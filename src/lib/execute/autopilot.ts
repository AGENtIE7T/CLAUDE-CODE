/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Autopilot — the autonomous end-to-end internal-linking loop.
 * ─────────────────────────────────────────────────────────────────────────
 *  Runs the whole pipeline by itself, on the user's OWN verified site:
 *
 *    crawl → audit → build link candidates → build a revision →
 *    (approve) → execute (insert links) → verify → report
 *
 *  The "approve" step is where autonomy is bounded. In DEMO mode an auto-
 *  approver stands in for the human so the loop runs unattended end to end. In
 *  LIVE mode autopilot stops at `awaiting_approval` and returns the revision for
 *  a human, unless production writes are explicitly enabled — the approval gate
 *  is a policy control, not a code shortcut. Prohibited/off-domain publishing is
 *  never reachable from here: it only ever writes to pages already in the CMS
 *  store for the target website.
 */

import { isDemo } from "@/lib/env";
import { crawlSite } from "@/lib/crawler/crawl";
import { fixtureFetcher } from "@/lib/crawler/fixtures";
import { runFullAudit, type AuditReport } from "@/lib/audits/audit";
import { generateLinkingPreview, type LinkCandidate } from "@/lib/linking/engine";
import type { LinkingPage } from "@/lib/linking/score";
import { applyLinks } from "@/lib/linking/apply";
import { buildRevision, type Revision } from "@/lib/revisions/revision";
import { executeRevision, type Approval } from "@/lib/execute/engine";
import type { CmsStore } from "@/lib/cms/mock";
import type { Fetcher } from "@/lib/crawler/types";
import type { Role } from "@/lib/seo/types";

export interface AutopilotInput {
  workspaceId: string;
  websiteId: string;
  userId: string | null;
  role: Role;
  startUrl: string;
  /** Pages (url→text/type/etc) the linker scores against — from the crawl. */
  linkingPages: LinkingPage[];
  sourceUrls: string[];
  cms: CmsStore;
  protectedPatterns?: string[];
  /** Injected for tests/demo; defaults to fixtures. */
  fetcher?: Fetcher;
  limits?: { minConfidence?: number; maxLinksPerPage?: number; maxPagesPerBatch?: number };
}

export interface AutopilotResult {
  stage: "audited" | "no_candidates" | "awaiting_approval" | "executed" | "failed";
  audit: AuditReport | null;
  candidates: LinkCandidate[];
  revision: Revision | null;
  executed: boolean;
  message: string;
  rolledBack?: string[];
}

/** Run the autonomous loop to completion (execute in demo; gate in live). */
export async function runAutopilot(input: AutopilotInput): Promise<AutopilotResult> {
  const fetcher = input.fetcher ?? fixtureFetcher();
  const protectedPatterns = input.protectedPatterns ?? [];

  // 1. Crawl + audit (read-only; always safe).
  const crawl = await crawlSite({ startUrl: input.startUrl }, fetcher);
  const audit = runFullAudit(crawl, { sitemap: { sitemapUrls: null, robotsFound: false } });

  // 2. Generate validated, explainable link candidates.
  const preview = generateLinkingPreview({
    pages: input.linkingPages,
    sourceUrls: input.sourceUrls,
    protectedPatterns,
    limits: {
      minConfidence: input.limits?.minConfidence ?? 0.4,
      maxLinksPerPage: input.limits?.maxLinksPerPage ?? 5,
      maxPagesPerBatch: input.limits?.maxPagesPerBatch ?? 20,
    },
  });

  if (preview.candidates.length === 0) {
    return {
      stage: "no_candidates", audit, candidates: [], revision: null, executed: false,
      message: "Crawl and audit complete; no internal-link candidates met the confidence bar.",
    };
  }

  // 3. Build a revision by actually applying the links to each source page's
  //    CURRENT CMS content (before → after).
  const bySource = new Map<string, LinkCandidate[]>();
  for (const c of preview.candidates) {
    bySource.set(c.sourceUrl, [...(bySource.get(c.sourceUrl) ?? []), c]);
  }

  const items: { url: string; beforeHtml: string; afterHtml: string }[] = [];
  for (const [url, cands] of bySource) {
    const page = await input.cms.getPage(url);
    if (!page) continue; // only edit pages the CMS actually holds
    const { html: after } = applyLinks(
      page.html,
      cands.map((c) => ({ anchor: c.anchor, targetUrl: c.targetUrl })),
    );
    if (after !== page.html) items.push({ url, beforeHtml: page.html, afterHtml: after });
  }

  if (items.length === 0) {
    return {
      stage: "no_candidates", audit, candidates: preview.candidates, revision: null, executed: false,
      message: "Candidates found, but none could be safely inserted into page content.",
    };
  }

  const revision = buildRevision(input.websiteId, items);

  // 4. Approval gate. Demo auto-approves; live holds for a human unless prod
  //    writes are explicitly enabled.
  const prodWrites = process.env.SEO_ENABLE_PRODUCTION_WRITES === "1";
  if (!isDemo() && !prodWrites) {
    return {
      stage: "awaiting_approval", audit, candidates: preview.candidates, revision, executed: false,
      message: `Prepared a ${items.length}-page revision. Waiting for human approval (production writes disabled).`,
    };
  }

  const approval: Approval = {
    approvedRevisionHash: revision.revisionHash,
    expiresAt: Date.now() + 10 * 60_000,
  };

  // 5. Execute → verify → (rollback on failure).
  const result = await executeRevision(revision, input.cms, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: input.role,
    protectedPatterns,
    approval,
    idempotencyKey: `autopilot:${revision.revisionHash}`,
  });

  if (!result.ok) {
    return {
      stage: "failed", audit, candidates: preview.candidates, revision, executed: false,
      message: `Execution rejected: ${result.reason}`,
      rolledBack: result.rolledBack,
    };
  }

  return {
    stage: "executed", audit, candidates: preview.candidates, revision, executed: true,
    message: `Autopilot inserted and verified links across ${result.applied.length} page(s).`,
  };
}
