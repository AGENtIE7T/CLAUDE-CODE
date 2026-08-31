import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAutopilot } from "./autopilot";
import { createMockCms } from "@/lib/cms/mock";
import { fixtureFetcher, FIXTURE_HOST } from "@/lib/crawler/fixtures";
import { __resetExecuteLedger } from "./engine";
import type { LinkingPage } from "@/lib/linking/score";

function page(url: string, title: string, text: string, type: LinkingPage["type"], bp = 0.3): LinkingPage {
  return { url, title, text, type, indexable: true, canonicalIsSelf: true, status: 200, existingTargets: new Set(), businessPriority: bp };
}

const linkingPages: LinkingPage[] = [
  page(`${FIXTURE_HOST}/blog/a`, "Avoiding Probate", "Our estate planning services help families avoid probate with wills and trusts. Estate planning services matter.", "blog"),
  page(`${FIXTURE_HOST}/services`, "Estate Planning Services", "estate planning services wills trusts probate legal help families", "service", 1),
];

describe("autopilot end-to-end (demo mode)", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    __resetExecuteLedger();
  });
  afterEach(() => {
    if (saved) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("crawls, audits, links, executes and verifies unattended", async () => {
    const cms = createMockCms({
      [`${FIXTURE_HOST}/blog/a`]: "<p>Our estate planning services help families avoid probate.</p>",
    });

    const r = await runAutopilot({
      workspaceId: "ws1", websiteId: "web1", userId: "u1", role: "OWNER",
      startUrl: `${FIXTURE_HOST}/`,
      linkingPages,
      sourceUrls: [`${FIXTURE_HOST}/blog/a`],
      cms,
      protectedPatterns: ["/checkout/**"],
      fetcher: fixtureFetcher(),
      limits: { minConfidence: 0.4 },
    });

    expect(r.stage).toBe("executed");
    expect(r.executed).toBe(true);
    expect(r.audit).not.toBeNull();

    // The blog page was actually mutated with a link to the services page.
    const blog = await cms.getPage(`${FIXTURE_HOST}/blog/a`);
    expect(blog?.html).toContain(`href="${FIXTURE_HOST}/services"`);
    expect(blog?.revision).toBe(2);
  });

  it("holds for approval in live mode when production writes are disabled", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SEO_ENABLE_PRODUCTION_WRITES;
    const cms = createMockCms({
      [`${FIXTURE_HOST}/blog/a`]: "<p>Our estate planning services help families.</p>",
    });

    const r = await runAutopilot({
      workspaceId: "ws1", websiteId: "web1", userId: "u1", role: "OWNER",
      startUrl: `${FIXTURE_HOST}/`, linkingPages, sourceUrls: [`${FIXTURE_HOST}/blog/a`],
      cms, fetcher: fixtureFetcher(), limits: { minConfidence: 0.4 },
    });

    expect(r.stage).toBe("awaiting_approval");
    expect(r.executed).toBe(false);
    expect(r.revision).not.toBeNull();
    // Nothing was written.
    expect((await cms.getPage(`${FIXTURE_HOST}/blog/a`))?.revision).toBe(1);
  });
});
