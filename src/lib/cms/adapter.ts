/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CMS adapter contract — the only sanctioned way to read or write a site.
 * ─────────────────────────────────────────────────────────────────────────
 *  `execute/engine.ts` already writes through an injected `CmsStore`
 *  (getPage/writePage/listUrls). That stays the narrow write seam. This module
 *  adds the richer connection contract the product needs around it:
 *  verification, capability reporting, content listing, and typed failures.
 *
 *  Two invariants are enforced here rather than left to callers:
 *
 *  1. MOCK ISOLATION. Every connection declares `isMock`. `assertUsable()`
 *     refuses a mock connection in a production environment, so fixture data
 *     can never be mistaken for a real site. There is no flag that relaxes it.
 *
 *  2. CAPABILITY HONESTY. A connection reports what it can actually do. A
 *     read-only connection reports `write: false`, and callers must branch on
 *     that rather than attempting a write and reporting failure afterwards.
 */

export type CmsKind = "wordpress" | "shopify" | "custom";
export type CmsEnvironment = "staging" | "production";

/** What a given connection can actually do, right now. */
export interface CmsCapabilities {
  read: boolean;
  write: boolean;
  /** Can re-read a page after writing, so a write can be verified. */
  verifyAfterWrite: boolean;
  /** Can restore a previous version through this connection. */
  rollback: boolean;
  listContent: boolean;
}

export const READ_ONLY_CAPABILITIES: CmsCapabilities = {
  read: true,
  write: false,
  verifyAfterWrite: false,
  rollback: false,
  listContent: true,
};

export const READ_WRITE_CAPABILITIES: CmsCapabilities = {
  read: true,
  write: true,
  verifyAfterWrite: true,
  rollback: true,
  listContent: true,
};

/** Stable failure codes. Callers branch on `code`, never on message text. */
export type CmsErrorCode =
  | "not_connected"
  | "auth_failed"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "stale_content"
  | "write_failed"
  | "verification_failed"
  | "read_only"
  | "network"
  | "mock_in_production"
  | "unsupported";

export class CmsError extends Error {
  readonly code: CmsErrorCode;
  /** Milliseconds to wait before a retry is sensible, when the server said so. */
  readonly retryAfterMs?: number;
  /** True only for codes where repeating the same call may succeed unattended. */
  readonly retryable: boolean;

  constructor(
    code: CmsErrorCode,
    message: string,
    opts: { retryAfterMs?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "CmsError";
    this.code = code;
    this.retryAfterMs = opts.retryAfterMs;
    this.retryable = opts.retryable ?? (code === "rate_limited" || code === "timeout");
  }
}

/** One piece of addressable content. */
export interface CmsContentRef {
  id: number | string;
  url: string;
  type: "post" | "page";
  title: string | null;
  modifiedAt: string;
}

/** Full content of one page/post. */
export interface CmsContent extends CmsContentRef {
  /** Rendered HTML body — what the linking engine edits. */
  html: string;
  /** Server-reported version marker used for optimistic concurrency. */
  version: string;
  status: "publish" | "draft" | "private" | "pending";
  /** Search-engine directives read off the content, when the CMS exposes them. */
  noindex: boolean;
}

export interface VerifyResult {
  ok: boolean;
  /** Site name reported by the CMS, for display. */
  siteName?: string;
  capabilities: CmsCapabilities;
  /** Present when ok === false. */
  error?: { code: CmsErrorCode; message: string };
  checkedAt: string;
}

export interface UpdateOptions {
  /** The version the caller believes it is editing. A mismatch is `stale_content`. */
  expectedVersion?: string;
  /** When true, do everything except the actual write. */
  dryRun?: boolean;
}

export interface UpdateResult {
  ok: true;
  id: number | string;
  url: string;
  /** Content the server reports AFTER the write — the basis for verification. */
  html: string;
  version: string;
}

/**
 * A live (or mocked) connection to one site.
 *
 * Implementations must never throw a bare Error — every failure is a CmsError
 * with a code, so the UI can render the one action that would fix it.
 */
export interface CmsConnection {
  readonly kind: CmsKind;
  readonly environment: CmsEnvironment;
  /** TRUE for fixture-backed connections. Never true for a real site. */
  readonly isMock: boolean;
  readonly capabilities: CmsCapabilities;
  /** Human label for the connection card. */
  readonly label: string;
  /**
   * The normalised site root this connection talks to, e.g.
   * "https://staging.example.com". Not a secret — it is the address, not the
   * credential — and callers need it to check that a connection actually
   * belongs to the website they are about to act on.
   */
  readonly siteUrl: string;

  verify(): Promise<VerifyResult>;
  list(): Promise<CmsContentRef[]>;
  get(id: number | string): Promise<CmsContent>;
  getByUrl(url: string): Promise<CmsContent>;
  update(id: number | string, html: string, opts?: UpdateOptions): Promise<UpdateResult>;
}

/**
 * Refuse a connection that must not be used in this context.
 *
 * The mock check is deliberately not overridable: a fixture-backed connection
 * in a production environment is always a bug, never a configuration choice.
 */
export function assertUsable(
  conn: CmsConnection,
  need: { write?: boolean } = {},
): void {
  if (conn.isMock && conn.environment === "production") {
    throw new CmsError(
      "mock_in_production",
      "A mock CMS connection can never be used against production.",
      { retryable: false },
    );
  }
  if (need.write && !conn.capabilities.write) {
    throw new CmsError(
      "read_only",
      `The ${conn.kind} connection "${conn.label}" is read-only.`,
      { retryable: false },
    );
  }
}

/** One-line capability summary for a connection card. */
export function describeCapabilities(c: CmsCapabilities): string {
  if (!c.read) return "No access";
  const bits = [c.write ? "read/write" : "read-only"];
  if (c.verifyAfterWrite) bits.push("verifies writes");
  if (c.rollback) bits.push("rollback");
  return bits.join(" · ");
}
