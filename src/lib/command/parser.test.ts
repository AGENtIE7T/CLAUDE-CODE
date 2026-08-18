import { describe, it, expect } from "vitest";
import { parseInstruction } from "./parser";
import { parseTaskPlan } from "./schema";

const ctx = { websiteId: "11111111-1111-4111-8111-111111111111" };

describe("nl parser", () => {
  it("parses the spec's canonical internal-linking example", () => {
    const r = parseInstruction(
      "Find relevant links from blog articles to service category pages. Do not touch product pages. Suggest no more than two links per article. Show a preview only.",
      ctx,
    );
    expect(r.plan.task_type).toBe("internal_linking");
    expect(r.plan.mode).toBe("preview");
    expect(r.plan.scope.include_patterns).toContain("/blog/");
    expect(r.plan.scope.exclude_patterns).toContain("/products/");
    expect(r.plan.constraints.max_links_per_page).toBe(2);
    expect(r.plan.requires_approval).toBe(false); // preview
    // And it must be a schema-valid plan.
    expect(parseTaskPlan(r.plan).ok).toBe(true);
  });

  it("defaults to audit mode when no action verb is present", () => {
    const r = parseInstruction("find broken internal links and orphan pages", ctx);
    expect(r.plan.mode).toBe("audit");
    expect(r.plan.task_type).toBe("audit");
  });

  it("detects execute mode and marks approval required", () => {
    const r = parseInstruction("apply the approved internal links now", ctx);
    expect(r.plan.mode).toBe("execute");
    expect(r.plan.requires_approval).toBe(true);
  });

  it("parses a page limit", () => {
    const r = parseInstruction("audit the blog, limit this task to 25 pages", ctx);
    expect(r.plan.scope.page_limit).toBe(25);
  });

  it("flags prohibited requests and forces audit/prohibited", () => {
    const r = parseInstruction("buy 500 backlinks for my homepage", ctx);
    expect(r.prohibitedHint).toBe("paid_link_manipulation");
    expect(r.plan.risk_level).toBe("prohibited");
  });

  it("detects metadata task type", () => {
    const r = parseInstruction("suggest title tags and meta descriptions", ctx);
    expect(r.plan.task_type).toBe("metadata");
    expect(r.plan.mode).toBe("preview");
  });

  it("always yields a schema-valid plan for varied inputs", () => {
    for (const s of [
      "crawl my website",
      "find unlinked brand mentions and prepare outreach prospects",
      "check canonical tags and robots.txt",
      "draft outreach emails to relevant blogs",
    ]) {
      const r = parseInstruction(s, ctx);
      expect(parseTaskPlan(r.plan).ok, s).toBe(true);
    }
  });
});
