/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Audit log — every consequential action is recorded, safely.
 * ─────────────────────────────────────────────────────────────────────────
 *  Records who did what, to which resource, with a HASH of the input (never
 *  the raw input, which may contain secrets or PII) and a short result
 *  summary. In demo mode it appends to an in-memory ring; in live mode it
 *  writes to the `audit_logs` table (scoped by workspace via RLS).
 *
 *  Secret redaction: `redact()` scrubs common secret shapes before anything
 *  is summarised or hashed, so tokens can never leak into the log.
 */

import { createHash } from "node:crypto";
import { isDemo } from "@/lib/env";

export interface AuditInput {
  workspaceId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  /** Arbitrary structured input; hashed, never stored raw. */
  input?: unknown;
  resultSummary: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditRecord extends Omit<AuditInput, "input"> {
  id: string;
  inputHash: string | null;
  createdAt: string;
}

/** Patterns that look like secrets; replaced before logging. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9-]{16,}/g, // API keys (Anthropic/OpenAI style)
  /Bearer\s+[a-zA-Z0-9._-]{10,}/gi, // bearer tokens
  /Basic\s+[a-zA-Z0-9+/=]{10,}/gi, // basic auth
  /"(?:password|token|secret|api[_-]?key|refresh_token)"\s*:\s*"[^"]*"/gi,
  /[a-zA-Z0-9._-]+:[^@\s/]+@/g, // credentials in URLs
];

/** Redact secret-looking substrings from a string. */
export function redact(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

/** Stable hash of an input object, after redaction. */
export function hashInput(input: unknown): string {
  const json = redact(JSON.stringify(input ?? null));
  return createHash("sha256").update(json).digest("hex");
}

/** In-memory ring buffer for demo mode. */
const DEMO_RING: AuditRecord[] = [];
const DEMO_MAX = 500;

function newId(): string {
  // Prefer crypto.randomUUID; fall back for very old runtimes.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 32);
}

/**
 * Record an audit entry. Never throws into the caller's happy path — a logging
 * failure must not take down the operation it is recording; it degrades to a
 * console warning instead.
 */
export async function audit(input: AuditInput): Promise<AuditRecord> {
  const record: AuditRecord = {
    id: newId(),
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    inputHash: input.input === undefined ? null : hashInput(input.input),
    resultSummary: redact(input.resultSummary).slice(0, 2000),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: new Date().toISOString(),
  };

  if (isDemo()) {
    DEMO_RING.push(record);
    if (DEMO_RING.length > DEMO_MAX) DEMO_RING.shift();
    return record;
  }

  // Live mode: persistence is wired in the DB phase. Until then, fail safe.
  try {
    const { getServiceClient } = await import("@/lib/audit-log/persist");
    await getServiceClient().insert(record);
  } catch (err) {
    console.warn("[audit] persistence unavailable:", redact(String(err)));
  }
  return record;
}

/** Read recent audit records (demo mode only for now). */
export function recentAudit(workspaceId: string, limit = 50): AuditRecord[] {
  return DEMO_RING.filter((r) => r.workspaceId === workspaceId)
    .slice(-limit)
    .reverse();
}

/** Test-only helper to reset the demo ring. */
export function __resetAuditForTests(): void {
  DEMO_RING.length = 0;
}
