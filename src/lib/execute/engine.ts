/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Execute engine — the ONLY path that writes changes to a site (Section 14).
 * ─────────────────────────────────────────────────────────────────────────
 *  Applies an APPROVED revision, then verifies, with rollback ready. The order
 *  of checks is the safety contract:
 *
 *    1. production writes must be enabled (flag) OR we're in demo mode
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

export interface ExecuteContext {
  workspaceId: string;
  userId: string | null;
  role: Role;
  protectedPatterns: string[];
  approval: Approval;
  /** Idempotency key — a repeated key is treated as already-done. */
  idempotencyKey: string;
  dryRun?: boolean;
}

export type ExecuteResult =
  | { ok: true; applied: string[]; verified: true; cmsRevisions: Record<string, number>; dryRun: boolean }
  | { ok: false; reason: string; rolledBack?: string[] };

function productionWritesEnabled(): boolean {
  return process.env.SEO_ENABLE_PRODUCTION_WRITES === "1";
}

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

  // 1. Live writes require the flag; demo mode writes only to the mock CMS.
  if (!isDemo() && !productionWritesEnabled()) {
    return deny("production writes are disabled (set SEO_ENABLE_PRODUCTION_WRITES=1)");
  }

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
