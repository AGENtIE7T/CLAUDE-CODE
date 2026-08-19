"use server";

import { runAutopilot } from "@/lib/execute/autopilot";
import { createMockCms } from "@/lib/cms/mock";
import { fixtureFetcher, FIXTURE_HOST } from "@/lib/crawler/fixtures";
import { resolveMembership, DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import type { LinkingPage } from "@/lib/linking/score";

/**
 * Demo autopilot: seeds a small site and runs the full autonomous loop
 * (crawl → audit → link candidates → revision → approve → execute → verify)
 * end to end, then returns a plain-text report of exactly what it did.
 *
 * This is demo-only: it writes to an in-memory mock CMS, never the network.
 * Live autopilot holds for human approval unless production writes are enabled.
 */
function demoCorpus(): { pages: LinkingPage[]; seedHtml: Record<string, string>; sources: string[] } {
  const mk = (url: string, title: string, text: string, type: LinkingPage["type"], bp = 0.3): LinkingPage => ({
    url, title, text, type, indexable: true, canonicalIsSelf: true, status: 200,
    existingTargets: new Set(), businessPriority: bp,
  });
  const pages: LinkingPage[] = [
    mk(`${FIXTURE_HOST}/blog/a`, "Avoiding Probate",
      "Our estate planning services help families avoid probate with wills and trusts. Estate planning services matter.", "blog"),
    mk(`${FIXTURE_HOST}/services`, "Estate Planning Services",
      "estate planning services wills trusts probate legal help families", "service", 1),
  ];
  const seedHtml = {
    [`${FIXTURE_HOST}/blog/a`]: "<h1>Avoiding Probate</h1><p>Our estate planning services help families avoid probate with wills and trusts.</p>",
  };
  return { pages, seedHtml, sources: [`${FIXTURE_HOST}/blog/a`] };
}

export interface AutopilotReport {
  stage: string;
  message: string;
  executed: boolean;
  candidateCount: number;
  auditFindings: number;
  before: string | null;
  after: string | null;
}

export async function runAutopilotAction(): Promise<AutopilotReport> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  // Fail closed: an unresolved principal must NOT be treated as OWNER. Without
  // a resolved membership there is no authority to run the write path.
  if (!membership) {
    return {
      stage: "failed", message: "Not authorized: no workspace membership.",
      executed: false, candidateCount: 0, auditFindings: 0, before: null, after: null,
    };
  }
  const { pages, seedHtml, sources } = demoCorpus();
  const cms = createMockCms(seedHtml);
  const before = (await cms.getPage(sources[0]))?.html ?? null;

  const result = await runAutopilot({
    workspaceId: membership.workspaceId,
    websiteId: "web-demo-1",
    userId: membership.userId,
    role: membership.role,
    startUrl: `${FIXTURE_HOST}/`,
    linkingPages: pages,
    sourceUrls: sources,
    cms,
    protectedPatterns: ["/checkout/**"],
    fetcher: fixtureFetcher(),
    limits: { minConfidence: 0.4 },
  });

  const after = (await cms.getPage(sources[0]))?.html ?? null;

  return {
    stage: result.stage,
    message: result.message,
    executed: result.executed,
    candidateCount: result.candidates.length,
    auditFindings: result.audit?.findings.length ?? 0,
    before,
    after,
  };
}
