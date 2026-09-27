import { describe, it, expect } from "vitest";
import { parseInstruction } from "./parser";
import { parseTaskPlan } from "./schema";
import { matchesPattern } from "@/lib/websites/protected";

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

describe("nl parser: extracted rules", () => {
  it("extracts protected URLs from prose and covers their children", () => {
    const r = parseInstruction(
      "Add internal links across the blog. Never touch /checkout or /my-account.",
      ctx,
    );
    expect(r.rules.protectedUrls).toEqual(
      expect.arrayContaining(["/checkout**", "/my-account**"]),
    );
    expect(matchesPattern("https://x.test/checkout/thanks", r.rules.protectedUrls[0])).toBe(true);
  });

  it("keeps an explicit glob exactly as written", () => {
    const r = parseInstruction("Exclude /cart/* from every run.", ctx);
    expect(r.rules.protectedUrls).toEqual(["/cart/*"]);
  });

  it("extracts no protected URLs when the instruction names none", () => {
    const r = parseInstruction("Suggest internal links for the blog.", ctx);
    expect(r.rules.protectedUrls).toEqual([]);
  });

  it("detects an unattended request without granting anything", () => {
    const r = parseInstruction("Apply the internal links automatically.", ctx);
    expect(r.rules.autopilotRequested).toBe(true);
    // It still needs an approval — detection never bypasses that.
    expect(r.plan.requires_approval).toBe(true);
  });

  it("honours an explicit refusal of autopilot", () => {
    const r = parseInstruction("Apply the links, but do not run automatically.", ctx);
    expect(r.rules.autopilotRequested).toBe(false);
  });

  it("never flags autopilot on a prohibited request", () => {
    const r = parseInstruction("Automatically buy backlinks for my homepage.", ctx);
    expect(r.prohibitedHint).toBe("paid_link_manipulation");
    expect(r.rules.autopilotRequested).toBe(false);
  });

  it("parses an explicit decimal confidence threshold", () => {
    const r = parseInstruction(
      "Suggest internal links with a confidence score of at least 0.85.",
      ctx,
    );
    expect(r.plan.constraints.minimum_confidence).toBe(0.85);
  });

  it("parses a percentage confidence threshold", () => {
    const r = parseInstruction("Only propose links above 90% confidence.", ctx);
    expect(r.plan.constraints.minimum_confidence).toBe(0.9);
  });

  it("lets an explicit threshold beat a vague adjective", () => {
    const r = parseInstruction("Be aggressive, but keep confidence >= 0.95.", ctx);
    expect(r.plan.constraints.minimum_confidence).toBe(0.95);
  });

  it("does not mistake an unrelated number for a confidence threshold", () => {
    const r = parseInstruction("Use high confidence, limit this task to 25 pages.", ctx);
    expect(r.plan.constraints.minimum_confidence).toBe(0.9);
    expect(r.plan.scope.page_limit).toBe(25);
  });

  it("parses a same-target link cap", () => {
    const r = parseInstruction(
      "Suggest links, no more than two links per page and only one link to the same target.",
      ctx,
    );
    expect(r.plan.constraints.max_links_per_page).toBe(2);
    expect(r.plan.constraints.max_links_to_same_target).toBe(1);
    expect(parseTaskPlan(r.plan).ok).toBe(true);
  });

  it("omits the same-target cap when it was not requested", () => {
    const r = parseInstruction("Suggest internal links for the blog.", ctx);
    expect(r.plan.constraints.max_links_to_same_target).toBeUndefined();
  });
});
