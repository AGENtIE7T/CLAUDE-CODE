/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Execute engine — the ONLY path that writes changes to a site (Section 14).
 * ─────────────────────────────────────────────────────────────────────────
 *  Applies an APPROVED revision, then verifies, with rollback ready. The order
 *  of checks is the safety contract:
 *
 *    0. the write TARGET must be unambiguous, writable, and — for production —
 *       explicitly enabled and running outside demo mode
 *    1. (see 0; the environment gate replaced the old demo-mode shortcut)
 *    2. caller must hold `revision.execute` permission
 *    3. approval must bind to THIS revision's revisionHash and not be expired
 *    4. no page in the revision may match a protected-URL pattern
 *    5. re-read live content; revision must still be FRESH (baseHash matches) —
 *       otherwise the preview is stale and the write is rejected
 *    6. apply each page; keep the prior HTML for rollback
 *    7. re-read live content and VERIFY it now hashes to revisionHash
 *    8. on any verify failure, ROLL BACK every applied page and report
 *
 *  It writes an audit entry for the outcome. The CMS is injected, so this runs
 *  against the mock CMS in demo/tests and a real adapter in production.
 */

import { isDemo } from "@/lib/env";
import { audit } from "@/lib/audit-log/log";
import { can } from "@/lib/rbac/roles";
import { isProtected } from "@/lib/websites/protected";
import { hashContent, isRevisionFresh, type Revision } from "@/lib/revisions/revision";
import type { CmsStore } from "@/lib/cms/mock";
import type { Role } from "@/lib/seo/types";

export interface Approval {
  approvedRevisionHash: string;
  expiresAt: number; // epoch ms
}

/**
 * Where this write actually lands.
 *
 * Derived from the CMS connection that will be written to, never from an
 * environment variable read separately — so the gate below judges the thing
 * being written to rather than a setting that might describe something else.
 *
 * Required. There is no default: a missing or malformed target is treated as
 * ambiguous and refused, because "we could not tell what we were about to
 * write to" is never a reason to proceed.
 */
export interface ExecuteTarget {
  environment: "staging" | "production";
  /** True when the CMS behind this store is the in-process fixture. */
  isMock: boolean;
  /** True when the connection is permitted to write at all. */
  writable: boolean;
}

const ENVIRONMENTS = new Set(["staging", "production"]);

/** Fail-closed validation of the target. Returns a refusal reason, or null. */
function targetRefusal(t: ExecuteTarget | undefined): string | null {
  if (!t || typeof t !== "object") return "no write target was supplied";
  if (!ENVIRONMENTS.has(t.environment)) {
    return `write target environment is ambiguous (${JSON.stringify(t.environment)})`;
  }
  if (typeof t.isMock !== "boolean" || typeof t.writable !== "boolean") {
    return "write target is ambiguous (isMock/writable must be explicit)";
  }
  if (!t.writable) return "the CMS connection is read-only";
  // A fixture may stand in for staging, never for production.
  if (t.isMock && t.environment === "production") {
    return "a mock connection can never be used against production";
  }
  if (t.environment === "production") {
    if (process.env.SEO_ENABLE_PRODUCTION_WRITES !== "1") {
      return "production writes are disabled (set SEO_ENABLE_PRODUCTION_WRITES=1)";
    }
    // Demo mode bypasses authentication, so it may never reach production.
    if (isDemo()) {
      return "production writes require the authenticated application; demo mode is not permitted";
    }
  }
  return null;
}

export interface ExecuteContext {
  workspaceId: string;
  userId: string | null;
  role: Role;
  protectedPatterns: string[];
  approval: Approval;
  /** Idempotency key — a repeated key is treated as already-done. */
  idempotencyKey: string;
  /** Where the write lands. Required; an absent or malformed target is refused. */
  target: ExecuteTarget;
  dryRun?: boolean;
}

export type ExecuteResult =
  | { ok: true; applied: string[]; verified: true; cmsRevisions: Record<string, number>; dryRun: boolean }
  | { ok: false; reason: string; rolledBack?: string[] };

/** Keys already executed, for idempotency (demo/in-memory). */
const DONE = new Set<string>();

export async function executeRevision(
  revision: Revision,
  cms: CmsStore,
  ctx: ExecuteContext,
): Promise<ExecuteResult> {
  const deny = async (reason: string): Promise<ExecuteResult> => {
    await audit({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "revision.execute.denied",
      resourceType: "revision",
      resourceId: revision.revisionHash.slice(0, 12),
      input: { idempotencyKey: ctx.idempotencyKey },
      resultSummary: `Execute denied: ${reason}`,
    });
    return { ok: false, reason };
  };

  // 0. Idempotency: a repeated key is a no-op success.
  if (DONE.has(ctx.idempotencyKey)) {
    return { ok: false, reason: "idempotent replay: already executed" };
  }

  // 1. The target must be unambiguous and permitted. This runs BEFORE every
  //     other check and applies identically in demo mode: demo bypasses
  //     authentication for local UI work, and nothing else.
  const refusal = targetRefusal(ctx.target);
  if (refusal) return deny(refusal);

  // 2. Permission.
  if (!can(ctx.role, "revision.execute")) {
    return deny(`role ${ctx.role} may not execute revisions`);
  }

  // 3. Approval binds to exactly this revision and is not expired.
  if (ctx.approval.approvedRevisionHash !== revision.revisionHash) {
    return deny("approval does not match this revision hash");
  }
  if (Date.now() > ctx.approval.expiresAt) {
    return deny("approval has expired");
  }

  // 4. Protected URLs may never be modified.
  const blocked = revision.items.find((i) => isProtected(i.url, ctx.protectedPatterns));
  if (blocked) {
    return deny(`revision touches a protected URL: ${blocked.url}`);
  }

  // 5. Freshness: re-read live content and confirm nothing changed since preview.
  const currentByUrl: Record<string, string> = {};
  for (const item of revision.items) {
    const page = await cms.getPage(item.url);
    if (!page) return deny(`page not found in CMS: ${item.url}`);
    currentByUrl[item.url] = page.html;
  }
  if (!isRevisionFresh(revision, currentByUrl)) {
    return deny("stale preview: page content changed since the revision was built");
  }

  // Dry run stops here — everything validated, nothing written.
  if (ctx.dryRun) {
    return { ok: true, applied: [], verified: true, cmsRevisions: {}, dryRun: true };
  }

  // 6. Apply, remembering prior HTML for rollback.
  const rollbackSet: { url: string; html: string }[] = [];
  const applied: string[] = [];
  const cmsRevisions: Record<string, number> = {};
  try {
    for (const item of revision.items) {
      rollbackSet.push({ url: item.url, html: currentByUrl[item.url] });
      const written = await cms.writePage(item.url, item.afterHtml);
      cmsRevisions[item.url] = written.revision;
      applied.push(item.url);
    }
  } catch (err) {
    const rolledBack = await rollback(cms, rollbackSet);
    await audit({
      workspaceId: ctx.workspaceId, userId: ctx.userId,
      action: "revision.execute.failed", resourceType: "revision",
      resourceId: revision.revisionHash.slice(0, 12),
      resultSummary: `Write failed, rolled back ${rolledBack.length} page(s).`,
    });
    return { ok: false, reason: err instanceof Error ? err.message : "write failed", rolledBack };
  }

  // 7. Verify: live content must now hash to revisionHash.
  const afterByUrl: Record<string, string> = {};
  for (const item of revision.items) {
    const page = await cms.getPage(item.url);
    afterByUrl[item.url] = page?.html ?? "";
  }
  const liveHash = hashContent(
    revision.items
      .map((i) => i.url)
      .sort()
      .map((url) => `${url}\n${afterByUrl[url]}`)
      .join("\n---\n"),
  );

  if (liveHash !== revision.revisionHash) {
    // 8. Verification failed → roll back everything.
    const rolledBack = await rollback(cms, rollbackSet);
    await audit({
      workspaceId: ctx.workspaceId, userId: ctx.userId,
      action: "revision.execute.verify_failed", resourceType: "revision",
      resourceId: revision.revisionHash.slice(0, 12),
      resultSummary: `Post-write verify failed; rolled back ${rolledBack.length} page(s).`,
    });
    return { ok: false, reason: "post-write verification failed", rolledBack };
  }

  DONE.add(ctx.idempotencyKey);
  await audit({
    workspaceId: ctx.workspaceId, userId: ctx.userId,
    action: "revision.execute.applied", resourceType: "revision",
    resourceId: revision.revisionHash.slice(0, 12),
    input: { idempotencyKey: ctx.idempotencyKey, pages: applied.length },
    resultSummary: `Applied & verified ${applied.length} page(s).`,
  });
  return { ok: true, applied, verified: true, cmsRevisions, dryRun: false };
}

/** Restore prior HTML for a set of pages. Best-effort; returns those restored. */
export async function rollback(
  cms: CmsStore,
  set: { url: string; html: string }[],
): Promise<string[]> {
  const restored: string[] = [];
  for (const { url, html } of set) {
    try {
      await cms.writePage(url, html);
      restored.push(url);
    } catch {
      /* keep going — a failed restore is reported by omission */
    }
  }
  return restored;
}

/** Test-only reset of the idempotency ledger. */
export function __resetExecuteLedger(): void {
  DONE.clear();
}
