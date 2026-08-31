/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Internal-linking run — the end-to-end workflow, CMS-agnostic.
 * ─────────────────────────────────────────────────────────────────────────
 *  One function performs the whole product: connect, read, find opportunities,
 *  score them, build a preview, bind an approval to that exact preview, apply
 *  it, verify it landed, and (for a controlled test) undo it and verify the
 *  undo. Every step is recorded, in order, with what actually happened.
 *
 *  Two properties make this safe to point at a real site later:
 *
 *   · It is written against `CmsConnection` / `CmsStore`, not against
 *     WordPress. The mocked fixture and a real staging site run the SAME code,
 *     so a green mocked run is evidence about the real path, not a rehearsal
 *     of a different one.
 *
 *   · It never reports an outcome it did not observe. `applied` is true only
 *     after the execute engine re-read the live page and the content hashed to
 *     the approved revision. If a step did not run, it is recorded as skipped
 *     with the reason — not omitted, and never coloured green.
 *
 *  Page content read from the CMS is UNTRUSTED. It is scanned for injection
 *  and used only as text to link within; nothing in it can change what runs.
 */

import { assertUsable, CmsError, type CmsConnection } from "@/lib/cms/adapter";
import { createWordPressCmsStore, rollbackFromBackups } from "@/lib/cms/wordpress/store";
import type { BackupStore } from "@/lib/backups/snapshot";
import { extractPage } from "@/lib/crawler/extract";
import { normalizeUrl } from "@/lib/crawler/normalize";
import { classifyInjection } from "@/lib/injection/classify";
import { applyLinks } from "@/lib/linking/apply";
import {
  generateLinkingPreview,
  type LinkCandidate,
  type LinkingLimits,
} from "@/lib/linking/engine";
import type { LinkingPage } from "@/lib/linking/score";
import { buildRevision, type Revision, type RevisionItem } from "@/lib/revisions/revision";
import { executeRevision, type Approval } from "@/lib/execute/engine";
import {
  evaluateAutopilotBatch,
  type AutopilotCandidate,
  type AutopilotRules,
} from "@/lib/autopilot/rules";
import { isProtected } from "@/lib/websites/protected";
import { WORDPRESS_CONNECTION_REQUIRED, WORK_ORDER_ONLY } from "@/lib/status/capabilities";
import type { Role } from "@/lib/seo/types";

export type RunMode = "audit" | "preview" | "execute";
export type StepStatus = "ok" | "skipped" | "failed";

export interface WorkflowStep {
  n: number;
  key: string;
  label: string;
  status: StepStatus;
  /** What actually happened, in plain language. */
  detail: string;
  at: string;
}

export interface LinkingRunOptions {
  websiteId: string;
  workspaceId: string;
  userId: string | null;
  role: Role;
  connection: CmsConnection | null;
  backups: BackupStore;
  rules: AutopilotRules;
  /** Website-level protected URL globs. Enforced on top of the rules'. */
  protectedUrls: string[];
  mode: RunMode;
  /** Use Autopilot to issue the approval instead of asking a human. */
  useAutopilot?: boolean;
  /** A human-issued approval, when the operator already approved a revision. */
  approval?: Approval | null;
  limits?: Partial<LinkingLimits>;
  /**
   * Cap on how many candidates this run may apply. Defaults to the rule set's
   * `maxTotalChanges`. The controlled first real-site test passes 1, which is
   * the only reason this is separate from the rules.
   */
  maxCandidates?: number;
  /** Only source links from pages whose URL contains one of these. */
  includePatterns?: string[];
  /**
   * Apply, verify, then undo and verify the undo. This is the controlled
   * single-change test — never a production behaviour.
   */
  undoAfterVerify?: boolean;
  now?: () => number;
}

export interface LinkingRunResult {
  steps: WorkflowStep[];
  mode: RunMode;
  /** True only when a change was written AND verified on the CMS. */
  applied: boolean;
  /** True only when a rollback ran and the prior bytes were restored. */
  rolledBack: boolean;
  /** True when a work order exists but nothing was written. */
  workOrderOnly: boolean;
  approvalSource: "none" | "human" | "autopilot";
  message: string;
  pagesRead: number;
  /** Everything that cleared the confidence floor and the rules. */
  candidates: LinkCandidate[];
  /**
   * The subset this run actually turned into an edit — a candidate whose
   * anchor could not be linked safely in the page body is dropped here rather
   * than forced, so `selected` is always what the revision contains.
   */
  selected: LinkCandidate[];
  /** `selected[0]`, kept because most runs propose exactly one. */
  chosen: LinkCandidate | null;
  revisionHash: string | null;
  /**
   * The exact revision an approval would bind to. Kept so a work order can be
   * approved LATER and applied unchanged — re-deriving it at approval time
   * would silently approve a different edit.
   */
  revision: Revision | null;
  batchId: string;
  /** True when the CMS behind this run is the fixture, not a real site. */
  mock: boolean;
  injectionFlags: { url: string; score: number }[];
}

// ── helpers ────────────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTypeFor(url: string): LinkingPage["type"] {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })().toLowerCase();
  if (/\/(blog|news|articles?|posts?)\//.test(path)) return "blog";
  if (/\/(products?|shop|store)\//.test(path)) return "product";
  if (/\/(services?|solutions?|practice-areas?)\//.test(path)) return "service";
  if (/\/(category|categories|collections?)\//.test(path)) return "category";
  if (path === "/" || path === "") return "home";
  return "other";
}

function businessPriorityFor(type: LinkingPage["type"]): number {
  if (type === "service" || type === "product") return 0.9;
  if (type === "category") return 0.75;
  if (type === "blog") return 0.5;
  return 0.6;
}

function toAutopilotCandidate(c: LinkCandidate): AutopilotCandidate {
  return {
    sourceUrl: c.sourceUrl,
    targetUrl: c.targetUrl,
    sourceType: c.sourceType,
    targetType: c.targetType,
    anchor: c.anchor,
    confidence: c.confidence,
    targetIndexable: c.targetIndexable,
    targetCanonical: c.targetCanonical,
    targetStatus: 200,
    needsEditorialReview: c.needsEditorialReview,
    removesExistingLink: false,
  };
}

/** Build the recorder that every step goes through. */
function recorder(now: () => number) {
  const steps: WorkflowStep[] = [];
  let n = 0;
  return {
    steps,
    step(key: string, label: string, status: StepStatus, detail: string): WorkflowStep {
      const s: WorkflowStep = {
        n: ++n,
        key,
        label,
        status,
        detail,
        at: new Date(now()).toISOString(),
      };
      steps.push(s);
      return s;
    },
    /** Mark every remaining step as skipped so the list stays complete. */
    skipRest(remaining: [string, string][], reason: string) {
      for (const [key, label] of remaining) this.step(key, label, "skipped", reason);
    },
  };
}

/** The full step list, so a short run still shows what it did not do. */
const ALL_STEPS: [string, string][] = [
  ["website", "Select website"],
  ["connection", "Test CMS connection"],
  ["list", "List pages and posts"],
  ["read", "Read page content"],
  ["detect", "Detect internal-link opportunities"],
  ["preview", "Generate preview"],
  ["select", "Select one proposed link"],
  ["approval", "Create hash-bound approval"],
  ["apply", "Apply the update"],
  ["reread", "Re-read the page"],
  ["verify", "Verify the link exists"],
  ["rollback", "Roll the change back"],
  ["reread2", "Re-read the page again"],
  ["verify2", "Verify the link was removed"],
  ["audit", "Record the audit trail"],
];

function remainingFrom(key: string): [string, string][] {
  const i = ALL_STEPS.findIndex(([k]) => k === key);
  return i === -1 ? [] : ALL_STEPS.slice(i);
}

// ── the run ────────────────────────────────────────────────────────────────

export async function runInternalLinking(opts: LinkingRunOptions): Promise<LinkingRunResult> {
  const now = opts.now ?? Date.now;
  const rec = recorder(now);
  const batchId = `batch-${new Date(now()).toISOString()}-${opts.websiteId}`;
  const guarded = [...opts.protectedUrls, ...opts.rules.protectedUrls];

  const base: LinkingRunResult = {
    steps: rec.steps,
    mode: opts.mode,
    applied: false,
    rolledBack: false,
    workOrderOnly: false,
    approvalSource: "none",
    message: "",
    pagesRead: 0,
    candidates: [],
    selected: [],
    chosen: null,
    revisionHash: null,
    revision: null,
    batchId,
    mock: opts.connection?.isMock === true,
    injectionFlags: [],
  };

  // 1. Website.
  rec.step("website", "Select website", "ok", `Website ${opts.websiteId} selected.`);

  // 2. Connection.
  const conn = opts.connection;
  if (!conn) {
    rec.skipRest(remainingFrom("connection"), "No CMS connection is configured.");
    return { ...base, message: WORDPRESS_CONNECTION_REQUIRED };
  }
  try {
    assertUsable(conn);
  } catch (e) {
    const msg = e instanceof CmsError ? e.message : "The connection may not be used.";
    rec.skipRest(remainingFrom("connection"), msg);
    return { ...base, message: msg };
  }
  const verified = await conn.verify();
  if (!verified.ok) {
    const msg = `Connection test failed: ${verified.error?.message ?? "unknown error"}`;
    rec.step("connection", "Test CMS connection", "failed", msg);
    rec.skipRest(remainingFrom("list"), "The connection is not usable.");
    return { ...base, message: msg };
  }
  rec.step(
    "connection",
    "Test CMS connection",
    "ok",
    `Connected to ${verified.siteName ?? conn.label} (${conn.environment}${conn.isMock ? ", MOCK" : ""}); access is ${conn.capabilities.write ? "read/write" : "read-only"}.`,
  );

  // 3. List.
  let refs;
  try {
    refs = await conn.list();
  } catch (e) {
    const msg = e instanceof CmsError ? e.message : "Could not list content.";
    rec.step("list", "List pages and posts", "failed", msg);
    rec.skipRest(remainingFrom("read"), "Nothing could be listed.");
    return { ...base, message: msg };
  }
  rec.step("list", "List pages and posts", "ok", `${refs.length} item(s) listed from the CMS.`);

  // 4. Read. Protected URLs are never even fetched into the candidate set.
  const pages: LinkingPage[] = [];
  const htmlByUrl = new Map<string, string>();
  const injectionFlags: LinkingRunResult["injectionFlags"] = [];
  for (const ref of refs) {
    if (isProtected(ref.url, guarded)) continue;
    let content;
    try {
      content = await conn.get(ref.id);
    } catch {
      continue; // a single unreadable page must not abort the run
    }
    const ex = extractPage(content.html);
    const verdict = classifyInjection(content.html);
    if (verdict.suspicious) injectionFlags.push({ url: content.url, score: verdict.score });

    const type = pageTypeFor(content.url);
    htmlByUrl.set(content.url, content.html);
    pages.push({
      url: content.url,
      title: content.title ?? "",
      text: `${content.title ?? ""}. ${htmlToText(content.html)}`,
      type,
      indexable: ex.indexable && !content.noindex,
      canonicalIsSelf: !ex.canonical || normalizeUrl(ex.canonical) === normalizeUrl(content.url),
      status: 200,
      existingTargets: new Set(
        ex.links.map((l) => normalizeUrl(l.href)).filter((u): u is string => Boolean(u)),
      ),
      businessPriority: businessPriorityFor(type),
    });
  }
  rec.step(
    "read",
    "Read page content",
    "ok",
    `${pages.length} page(s) read${injectionFlags.length ? `; ${injectionFlags.length} flagged as containing instruction-like text (treated as data)` : ""}.`,
  );

  // 5. Detect.
  const sourceUrls = pages
    .filter((p) =>
      opts.includePatterns?.length
        ? opts.includePatterns.some((pat) => p.url.includes(pat))
        : p.type === "blog",
    )
    .map((p) => p.url);

  const preview = generateLinkingPreview({
    pages,
    sourceUrls: sourceUrls.length ? sourceUrls : pages.map((p) => p.url),
    protectedPatterns: guarded,
    limits: {
      maxLinksPerPage: opts.rules.maxLinksPerPage,
      maxLinksToSameTarget: opts.rules.maxLinksToSameTarget,
      maxPagesPerBatch: opts.rules.maxPagesPerRun,
      minConfidence: opts.rules.minimumConfidence,
      ...(opts.limits ?? {}),
    },
  });
  rec.step(
    "detect",
    "Detect internal-link opportunities",
    preview.candidates.length ? "ok" : "skipped",
    preview.candidates.length
      ? `${preview.candidates.length} candidate(s) above the ${opts.rules.minimumConfidence} confidence floor, from ${preview.pagesConsidered} source page(s).`
      : `No candidate cleared the ${opts.rules.minimumConfidence} confidence floor (${preview.rejected.length} rejected).`,
  );

  const result: LinkingRunResult = {
    ...base,
    pagesRead: pages.length,
    candidates: preview.candidates,
    injectionFlags,
  };

  if (!preview.candidates.length) {
    rec.skipRest(remainingFrom("preview"), "There is nothing to propose.");
    return { ...result, message: "No internal-link opportunities met your rules. Nothing was changed." };
  }

  // AUDIT stops here: it reports, it never builds an edit.
  if (opts.mode === "audit") {
    rec.skipRest(remainingFrom("preview"), "Audit mode reports findings only.");
    return {
      ...result,
      message: `Audit complete. ${preview.candidates.length} internal-link opportunity(ies) found. No website was modified.`,
    };
  }

  // 6-7. Build the edits, grouped by page.
  //
  // Every candidate for one page is applied in a single pass, because
  // `applyLinks` needs to see the edits together to avoid linking inside a
  // link it just inserted. A candidate whose anchor cannot be placed safely is
  // dropped and reported, never forced into unnatural copy.
  const cap = Math.max(1, Math.min(opts.maxCandidates ?? opts.rules.maxTotalChanges, 500));
  const shortlist = preview.candidates.slice(0, cap);

  const byPage = new Map<string, LinkCandidate[]>();
  for (const c of shortlist) {
    const list = byPage.get(c.sourceUrl) ?? [];
    list.push(c);
    byPage.set(c.sourceUrl, list);
  }

  const items: RevisionItem[] = [];
  const selected: LinkCandidate[] = [];
  const unplaceable: { candidate: LinkCandidate; reason: string }[] = [];

  for (const [url, forPage] of byPage) {
    const beforeHtml = htmlByUrl.get(url) ?? "";
    const applyResult = applyLinks(
      beforeHtml,
      forPage.map((c) => ({ anchor: c.anchor, targetUrl: c.targetUrl })),
    );
    const placed = new Set(applyResult.applied.map((a) => `${a.anchor}\u0000${a.targetUrl}`));
    for (const c of forPage) {
      if (placed.has(`${c.anchor}\u0000${c.targetUrl}`)) selected.push(c);
      else {
        const skip = applyResult.skipped.find(
          (sk) => sk.anchor === c.anchor && sk.targetUrl === c.targetUrl,
        );
        unplaceable.push({ candidate: c, reason: skip?.reason ?? "no safe place in the body text" });
      }
    }
    if (applyResult.applied.length) {
      items.push({ url, beforeHtml, afterHtml: applyResult.html });
    }
  }

  if (!items.length) {
    rec.step(
      "preview",
      "Generate preview",
      "failed",
      `None of the ${shortlist.length} candidate(s) could be linked safely in the page body.`,
    );
    rec.skipRest(remainingFrom("select"), "No safe edit could be produced.");
    return { ...result, message: "No safe edit could be produced from the candidates found." };
  }

  rec.step(
    "preview",
    "Generate preview",
    "ok",
    `Preview built for ${items.length} page(s)${unplaceable.length ? `; ${unplaceable.length} candidate(s) had no natural anchor and were dropped` : ""}.`,
  );
  rec.step(
    "select",
    selected.length === 1 ? "Select one proposed link" : `Select ${selected.length} proposed links`,
    "ok",
    selected
      .map((c) => `"${c.anchor}" → ${c.targetUrl} (${c.confidence.toFixed(2)})`)
      .join("; "),
  );

  const revision: Revision = buildRevision(opts.websiteId, items);
  result.selected = selected;
  result.chosen = selected[0] ?? null;
  result.revisionHash = revision.revisionHash;
  result.revision = revision;

  // 8. Approval — human-issued, Autopilot-issued, or none.
  let approval: Approval | null = opts.approval ?? null;
  let approvalSource: LinkingRunResult["approvalSource"] = approval ? "human" : "none";

  if (!approval && opts.useAutopilot) {
    const decision = evaluateAutopilotBatch(
      selected.map(toAutopilotCandidate),
      revision,
      opts.rules,
      {
        task: "insert_internal_links",
        cms: conn.kind,
        environment: conn.environment === "production" ? "production" : "staging",
        backupPresent: opts.rules.requireBackup,
        verificationAvailable: true,
        productionWritesEnabled: process.env.SEO_ENABLE_PRODUCTION_WRITES === "1",
        now: now(),
      },
    );
    if (decision.ok) {
      approval = decision.approval;
      approvalSource = "autopilot";
      rec.step(
        "approval",
        "Create hash-bound approval",
        "ok",
        `Autopilot issued an approval bound to revision ${revision.revisionHash.slice(0, 12)}.`,
      );
    } else {
      rec.step(
        "approval",
        "Create hash-bound approval",
        "skipped",
        `Autopilot refused: ${decision.reason} ${decision.violations.join("; ")}`,
      );
    }
  }

  if (!approval) {
    if (approvalSource === "none" && !opts.useAutopilot) {
      rec.step(
        "approval",
        "Create hash-bound approval",
        "skipped",
        "Autopilot is off, so this needs your approval before anything is written.",
      );
    }
    rec.skipRest(remainingFrom("apply"), "No approval exists, so nothing was written.");
    return {
      ...result,
      workOrderOnly: true,
      approvalSource,
      message: WORK_ORDER_ONLY,
    };
  }

  // PREVIEW mode never writes, even holding a valid approval.
  if (opts.mode !== "execute") {
    rec.skipRest(remainingFrom("apply"), "Preview mode never writes.");
    return { ...result, workOrderOnly: true, approvalSource, message: WORK_ORDER_ONLY };
  }

  // 9. Apply through the unchanged execute engine.
  const cms = createWordPressCmsStore(conn, opts.backups, {
    websiteId: opts.websiteId,
    batchId,
    requireBackup: opts.rules.requireBackup,
  });
  const exec = await executeRevision(revision, cms, {
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    role: opts.role,
    protectedPatterns: guarded,
    approval,
    idempotencyKey: `${batchId}:${revision.revisionHash}`,
    target: {
      environment: conn.environment === "production" ? "production" : "staging",
      isMock: conn.isMock,
      writable: conn.capabilities.write,
    },
  });

  if (!exec.ok) {
    rec.step("apply", "Apply the update", "failed", exec.reason);
    const rolled = exec.rolledBack?.length ?? 0;
    rec.step(
      "reread",
      "Re-read the page",
      "skipped",
      "The write did not complete, so there is nothing to re-read.",
    );
    rec.step("verify", "Verify the link exists", "skipped", "Nothing was applied.");
    rec.step(
      "rollback",
      "Roll the change back",
      rolled ? "ok" : "skipped",
      rolled ? `The engine rolled back ${rolled} page(s).` : "Nothing needed rolling back.",
    );
    rec.step("reread2", "Re-read the page again", "skipped", "Nothing was applied.");
    rec.step("verify2", "Verify the link was removed", "skipped", "Nothing was applied.");
    rec.step("audit", "Record the audit trail", "ok", "The failed attempt was recorded.");
    return {
      ...result,
      approvalSource,
      rolledBack: rolled > 0,
      message: `The change was NOT applied: ${exec.reason}`,
    };
  }

  rec.step("apply", "Apply the update", "ok", `Applied to ${exec.applied.join(", ")}.`);

  // 10-11. Independent re-read and verification, on top of the engine's own.
  //
  // Every edited page is re-read and every approved link looked for by hand.
  // The engine already compared hashes; this asks the narrower question the
  // operator actually cares about — "is the link on the page?" — and one
  // missing link fails the whole run.
  const liveByUrl = new Map<string, string>();
  for (const item of revision.items) {
    liveByUrl.set(item.url, (await conn.getByUrl(item.url)).html);
  }
  rec.step(
    "reread",
    "Re-read the page",
    "ok",
    `Re-read ${revision.items.length} page(s) from the CMS.`,
  );
  const missing = selected.filter(
    (c) => !(liveByUrl.get(c.sourceUrl) ?? "").includes(`href="${c.targetUrl}"`),
  );
  const present = missing.length === 0;
  rec.step(
    "verify",
    selected.length === 1 ? "Verify the link exists" : "Verify the links exist",
    present ? "ok" : "failed",
    present
      ? `All ${selected.length} link(s) are present on the live page(s).`
      : `${missing.length} of ${selected.length} link(s) are NOT on the live page(s). Treating this as a failed write.`,
  );
  if (!present) {
    const undo = await rollbackFromBackups(conn, opts.backups, batchId);
    rec.step(
      "rollback",
      "Roll the change back",
      undo.failed.length ? "failed" : "ok",
      undo.failed.length
        ? `Restored ${undo.restored.length}; FAILED to restore ${undo.failed.map((f) => f.url).join(", ")}.`
        : `Restored ${undo.restored.length} page(s) from backup.`,
    );
    rec.skipRest(remainingFrom("reread2"), "Verification failed; the run stopped.");
    return {
      ...result,
      approvalSource,
      rolledBack: undo.failed.length === 0,
      message: "The write did not verify on the live page and was rolled back.",
    };
  }

  if (!opts.undoAfterVerify) {
    rec.step("rollback", "Roll the change back", "skipped", "Not requested; the change stands.");
    rec.step("reread2", "Re-read the page again", "skipped", "No rollback was requested.");
    rec.step("verify2", "Verify the link was removed", "skipped", "No rollback was requested.");
    rec.step("audit", "Record the audit trail", "ok", `Batch ${batchId} recorded with a backup for undo.`);
    return {
      ...result,
      applied: true,
      approvalSource,
      message: `Applied and verified ${selected.length} internal link(s) across ${revision.items.length} page(s).`,
    };
  }

  // 12-14. Controlled test: undo it, then prove the undo.
  const undo = await rollbackFromBackups(conn, opts.backups, batchId);
  rec.step(
    "rollback",
    "Roll the change back",
    undo.failed.length ? "failed" : "ok",
    undo.failed.length
      ? `Restored ${undo.restored.length}; FAILED to restore ${undo.failed.map((f) => f.url).join(", ")}.`
      : `Restored ${undo.restored.length} page(s) from the pre-write backup.`,
  );
  const restoredByUrl = new Map<string, string>();
  for (const item of revision.items) {
    restoredByUrl.set(item.url, (await conn.getByUrl(item.url)).html);
  }
  rec.step(
    "reread2",
    "Re-read the page again",
    "ok",
    `Re-read ${revision.items.length} page(s) after the rollback.`,
  );
  // Byte-for-byte, not just "the link is gone" — a rollback that leaves the
  // page subtly different is a failed rollback.
  const notRestored = revision.items.filter((i) => restoredByUrl.get(i.url) !== i.beforeHtml);
  const gone = notRestored.length === 0;
  rec.step(
    "verify2",
    selected.length === 1 ? "Verify the link was removed" : "Verify the links were removed",
    gone ? "ok" : "failed",
    gone
      ? "Every page is byte-identical to its pre-write content."
      : `${notRestored.length} page(s) did NOT return to their original content: ${notRestored.map((i) => i.url).join(", ")}.`,
  );
  rec.step("audit", "Record the audit trail", "ok", `Batch ${batchId} recorded: applied, verified, rolled back.`);

  return {
    ...result,
    applied: false,
    rolledBack: gone && undo.failed.length === 0,
    approvalSource,
    message: gone
      ? "Applied, verified, rolled back, and the rollback was verified. The site is unchanged."
      : "Applied and verified, but the rollback did not fully restore the page.",
  };
}

// ── applying a previously-approved work order ──────────────────────────────

export interface ApplyApprovedOptions {
  websiteId: string;
  workspaceId: string;
  userId: string | null;
  role: Role;
  connection: CmsConnection | null;
  backups: BackupStore;
  revision: Revision;
  approval: Approval;
  protectedUrls: string[];
  requireBackup?: boolean;
  /**
   * The links the operator approved, so verification can look for each one by
   * name. Absent falls back to byte-equality against the revision.
   */
  expectLinks?: { sourceUrl: string; targetUrl: string }[];
  undoAfterVerify?: boolean;
  now?: () => number;
}

export interface ApplyApprovedResult {
  steps: WorkflowStep[];
  applied: boolean;
  rolledBack: boolean;
  message: string;
}

/**
 * Apply a work order the operator approved earlier.
 *
 * The revision is the one that was previewed — it is NOT recomputed here. If
 * the page changed in the meantime the execute engine's freshness check
 * rejects it, which is the entire point of approving a specific revision
 * rather than approving an intention.
 */
export async function applyApprovedRevision(
  opts: ApplyApprovedOptions,
): Promise<ApplyApprovedResult> {
  const now = opts.now ?? Date.now;
  const rec = recorder(now);
  const conn = opts.connection;
  const batchId = `batch-${new Date(now()).toISOString()}-${opts.websiteId}`;

  if (!conn) {
    rec.step("apply", "Apply the update", "skipped", "No CMS connection is configured.");
    return { steps: rec.steps, applied: false, rolledBack: false, message: WORDPRESS_CONNECTION_REQUIRED };
  }
  try {
    assertUsable(conn, { write: true });
  } catch (e) {
    const msg = e instanceof CmsError ? e.message : "The connection may not be written to.";
    rec.step("apply", "Apply the update", "failed", msg);
    return { steps: rec.steps, applied: false, rolledBack: false, message: msg };
  }

  const cms = createWordPressCmsStore(conn, opts.backups, {
    websiteId: opts.websiteId,
    batchId,
    requireBackup: opts.requireBackup ?? true,
  });

  const exec = await executeRevision(opts.revision, cms, {
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    role: opts.role,
    protectedPatterns: opts.protectedUrls,
    approval: opts.approval,
    idempotencyKey: `${batchId}:${opts.revision.revisionHash}`,
    target: {
      environment: conn.environment === "production" ? "production" : "staging",
      isMock: conn.isMock,
      writable: conn.capabilities.write,
    },
  });

  if (!exec.ok) {
    rec.step("apply", "Apply the update", "failed", exec.reason);
    const rolled = exec.rolledBack?.length ?? 0;
    if (rolled) rec.step("rollback", "Roll the change back", "ok", `Rolled back ${rolled} page(s).`);
    return {
      steps: rec.steps,
      applied: false,
      rolledBack: rolled > 0,
      message: `The change was NOT applied: ${exec.reason}`,
    };
  }
  rec.step("apply", "Apply the update", "ok", `Applied to ${exec.applied.join(", ")}.`);

  const liveByUrl = new Map<string, string>();
  for (const item of opts.revision.items) {
    liveByUrl.set(item.url, (await conn.getByUrl(item.url)).html);
  }
  rec.step(
    "reread",
    "Re-read the page",
    "ok",
    `Re-read ${opts.revision.items.length} page(s) from the CMS.`,
  );
  const present = opts.expectLinks?.length
    ? opts.expectLinks.every((l) =>
        (liveByUrl.get(l.sourceUrl) ?? "").includes(`href="${l.targetUrl}"`),
      )
    : opts.revision.items.every((i) => liveByUrl.get(i.url) === i.afterHtml);
  rec.step(
    "verify",
    "Verify the change exists",
    present ? "ok" : "failed",
    present
      ? `All ${opts.expectLinks?.length ?? opts.revision.items.length} approved change(s) are live.`
      : "At least one live page does NOT carry the approved change.",
  );

  if (!present || opts.undoAfterVerify) {
    const undo = await rollbackFromBackups(conn, opts.backups, batchId);
    rec.step(
      "rollback",
      "Roll the change back",
      undo.failed.length ? "failed" : "ok",
      undo.failed.length
        ? `Restored ${undo.restored.length}; FAILED on ${undo.failed.map((f) => f.url).join(", ")}.`
        : `Restored ${undo.restored.length} page(s) from the pre-write backup.`,
    );
    return {
      steps: rec.steps,
      applied: false,
      rolledBack: undo.failed.length === 0,
      message: present
        ? "Applied, verified, and rolled back as requested. The site is unchanged."
        : "The write did not verify on the live page and was rolled back.",
    };
  }

  rec.step("audit", "Record the audit trail", "ok", `Batch ${batchId} recorded with a backup for undo.`);
  return {
    steps: rec.steps,
    applied: true,
    rolledBack: false,
    message: `Applied and verified on ${opts.revision.items.map((i) => i.url).join(", ")}.`,
  };
}
