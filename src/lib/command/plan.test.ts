import { describe, it, expect } from "vitest";
import { parseTaskPlan, type TaskPlan } from "./schema";
import { validatePlan } from "./policy";

const base: TaskPlan = {
  task_type: "internal_linking",
  mode: "preview",
  risk_level: "low",
  website_id: "11111111-1111-4111-8111-111111111111",
  scope: { include_patterns: ["/blog/"], exclude_patterns: ["/products/"], page_limit: 100 },
  constraints: { max_changes: 10, max_links_per_page: 2, minimum_confidence: 0.8 },
  actions: [],
  requires_approval: true,
  clarifications: [],
};

describe("task-plan schema (strict)", () => {
  it("accepts a well-formed plan", () => {
    const r = parseTaskPlan(base);
    expect(r.ok).toBe(true);
  });

  it("rejects unknown fields", () => {
    const r = parseTaskPlan({ ...base, sneaky: "x" });
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range page_limit", () => {
    const r = parseTaskPlan({ ...base, scope: { ...base.scope, page_limit: 999999 } });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid enum value", () => {
    const r = parseTaskPlan({ ...base, mode: "delete-everything" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-uuid website_id but allows null", () => {
    expect(parseTaskPlan({ ...base, website_id: "not-a-uuid" }).ok).toBe(false);
    expect(parseTaskPlan({ ...base, website_id: null }).ok).toBe(true);
  });
});

describe("policy validator", () => {
  it("allows a preview an SEO_MANAGER may run", () => {
    const r = validatePlan(base, { role: "SEO_MANAGER", websiteCount: 1 });
    expect(r.ok).toBe(true);
  });

  it("blocks a prohibited risk level", () => {
    const r = validatePlan({ ...base, risk_level: "prohibited" }, { role: "OWNER", websiteCount: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok && "blocked" in r) expect(r.blocked).toBe(true);
  });

  it("blocks a write when the caller's role can't execute", () => {
    const writePlan: TaskPlan = { ...base, mode: "execute", risk_level: "medium" };
    const r = validatePlan(writePlan, { role: "SEO_MANAGER", websiteCount: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok && "blocked" in r) expect(r.blocked).toBe(true);
  });

  it("forces approval on write tasks even if the plan omits it", () => {
    const writePlan: TaskPlan = {
      ...base,
      mode: "execute",
      risk_level: "medium",
      requires_approval: false,
    };
    const r = validatePlan(writePlan, { role: "OWNER", websiteCount: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok && r.blocked) {
      expect(r.reason).toMatch(/require approval/i);
    }
  });

  it("asks which website when several exist and none is given", () => {
    const r = validatePlan({ ...base, website_id: null }, { role: "OWNER", websiteCount: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok && !("blocked" in r && r.blocked)) {
      expect((r as { clarifications: string[] }).clarifications.length).toBeGreaterThan(0);
    }
  });

  it("warns when a write batch exceeds 20 pages", () => {
    const writePlan: TaskPlan = {
      ...base,
      mode: "execute",
      risk_level: "medium",
      scope: { ...base.scope, page_limit: 50 },
    };
    const r = validatePlan(writePlan, { role: "OWNER", websiteCount: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some((w) => /20 pages/.test(w))).toBe(true);
  });
});
