import { describe, it, expect } from "vitest";
import {
  evaluateAutopilotBatch,
  normalizeRules,
  DEFAULT_AUTOPILOT_RULES,
  type AutopilotCandidate,
  type AutopilotContext,
  type AutopilotRules,
} from "./rules";
import { buildRevision, type RevisionItem } from "@/lib/revisions/revision";

const S1 = "https://s.com/blog/a";
const S2 = "https://s.com/blog/b";
const T1 = "https://s.com/services/x";
const T2 = "https://s.com/services/y";

function candidate(over: Partial<AutopilotCandidate> = {}): AutopilotCandidate {
  return {
    sourceUrl: S1,
    targetUrl: T1,
    sourceType: "blog",
    targetType: "service",
    anchor: "estate planning services",
    confidence: 0.9,
    targetIndexable: true,
    targetCanonical: true,
    targetStatus: 200,
    needsEditorialReview: false,
    ...over,
  };
}

function rules(over: Partial<AutopilotRules> = {}): AutopilotRules {
  return { ...DEFAULT_AUTOPILOT_RULES, enabled: true, ...over };
}

function ctx(over: Partial<AutopilotContext> = {}): AutopilotContext {
  return {
    task: "insert_internal_links",
    cms: "wordpress",
    environment: "staging",
    backupPresent: true,
    verificationAvailable: true,
    productionWritesEnabled: false,
    now: 1_000_000,
    ...over,
  };
}

function revisionFor(urls: string[]) {
  const items: RevisionItem[] = urls.map((u) => ({
    url: u,
    beforeHtml: `<p>before ${u}</p>`,
    afterHtml: `<p>after ${u}</p>`,
  }));
  return buildRevision("site1", items);
}

describe("autopilot: run-level blockers", () => {
  it("refuses when Autopilot is disabled", () => {
    const r = evaluateAutopilotBatch([candidate()], revisionFor([S1]), rules({ enabled: false }), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContain("Autopilot is disabled.");
  });

  it("refuses a task that is never eligible, even if configured", () => {
    const bad = { ...rules(), allowedTasks: ["update_robots"] } as unknown as AutopilotRules;
    const r = evaluateAutopilotBatch([candidate()], revisionFor([S1]), bad, ctx({ task: "update_robots" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/never eligible/);
  });

  it("refuses production when production writes are disabled", () => {
    const r = evaluateAutopilotBatch(
      [candidate()],
      revisionFor([S1]),
      rules({ allowedEnvironments: ["staging", "production"] }),
      ctx({ environment: "production", productionWritesEnabled: false }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContain("Production writes are disabled.");
  });

  it("refuses production when the environment is not allowed, even with the flag on", () => {
    const r = evaluateAutopilotBatch(
      [candidate()],
      revisionFor([S1]),
      rules(),
      ctx({ environment: "production", productionWritesEnabled: true }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/not permitted for Autopilot/);
  });

  it("refuses when a backup is required but missing", () => {
    const r = evaluateAutopilotBatch([candidate()], revisionFor([S1]), rules(), ctx({ backupPresent: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/backup is required/);
  });

  it("refuses when verification is required but unavailable", () => {
    const r = evaluateAutopilotBatch(
      [candidate()],
      revisionFor([S1]),
      rules(),
      ctx({ verificationAvailable: false }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/verification is required/);
  });

  it("refuses an unlisted CMS", () => {
    const r = evaluateAutopilotBatch([candidate()], revisionFor([S1]), rules(), ctx({ cms: "shopify" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/not in the allowed CMS list/);
  });
});

describe("autopilot: per-candidate rules", () => {
  const soft = (over: Partial<AutopilotRules> = {}) =>
    rules({ stopOnFirstError: false, ...over });

  it("skips a candidate below the confidence floor", () => {
    const r = evaluateAutopilotBatch(
      [candidate({ confidence: 0.79 }), candidate({ targetUrl: T2 })],
      revisionFor([S1]),
      soft(),
      ctx(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accepted).toHaveLength(1);
      expect(r.skipped[0].reason).toMatch(/below the 0.80 floor/);
    }
  });

  it("skips noindex, non-canonical, non-200 and redirect destinations", () => {
    const bad = [
      candidate({ targetUrl: T1, targetIndexable: false }),
      candidate({ targetUrl: T2, targetCanonical: false }),
      candidate({ targetUrl: "https://s.com/gone", targetStatus: 404 }),
      candidate({ targetUrl: "https://s.com/moved", targetIsRedirect: true }),
    ];
    const r = evaluateAutopilotBatch(bad, revisionFor([S1]), soft(), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const reasons = r.skipped.map((s) => s.reason).join(" | ");
      expect(reasons).toMatch(/noindex/);
      expect(reasons).toMatch(/not the canonical/);
      expect(reasons).toMatch(/HTTP 404/);
      expect(reasons).toMatch(/redirect/);
    }
  });

  it("skips a self-link", () => {
    const r = evaluateAutopilotBatch(
      [candidate({ targetUrl: S1 })],
      revisionFor([S1]),
      soft(),
      ctx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped[0].reason).toMatch(/same page/);
  });

  it("skips anchors needing editorial review", () => {
    const r = evaluateAutopilotBatch(
      [candidate({ needsEditorialReview: true })],
      revisionFor([S1]),
      soft(),
      ctx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped[0].reason).toMatch(/editorial review/);
  });

  it("never touches a protected URL", () => {
    const r = evaluateAutopilotBatch(
      [candidate({ targetUrl: "https://s.com/checkout" })],
      revisionFor([S1]),
      soft({ protectedUrls: ["/checkout*"] }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped[0].reason).toMatch(/protected URL/);
  });

  it("excludes product pages as sources by default", () => {
    const r = evaluateAutopilotBatch(
      [candidate({ sourceType: "product" })],
      revisionFor([S1]),
      soft(),
      ctx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped[0].reason).toMatch(/"product" is excluded/);
  });

  it("honours excluded URL patterns", () => {
    const r = evaluateAutopilotBatch(
      [candidate({ sourceUrl: "https://s.com/legal/terms" })],
      revisionFor(["https://s.com/legal/terms"]),
      soft({ excludedPatterns: ["/legal/**"] }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped[0].reason).toMatch(/excluded URL pattern/);
  });

  it("stops the whole batch on the first violation when configured to", () => {
    const r = evaluateAutopilotBatch(
      [candidate({ confidence: 0.5 }), candidate({ targetUrl: T2 })],
      revisionFor([S1]),
      rules({ stopOnFirstError: true }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/stop on the first error/);
  });
});

describe("autopilot: limits", () => {
  const soft = (over: Partial<AutopilotRules> = {}) =>
    rules({ stopOnFirstError: false, ...over });

  it("caps new links per page at three by default", () => {
    const many = [T1, T2, "https://s.com/services/z", "https://s.com/services/w"].map((t) =>
      candidate({ targetUrl: t }),
    );
    const r = evaluateAutopilotBatch(many, revisionFor([S1]), soft(), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accepted).toHaveLength(3);
      expect(r.skipped[0].reason).toMatch(/already has 3 new links/);
    }
  });

  it("caps links to the same destination at two per page", () => {
    const dup = [candidate(), candidate(), candidate()];
    const r = evaluateAutopilotBatch(dup, revisionFor([S1]), soft(), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accepted).toHaveLength(2);
      expect(r.skipped[0].reason).toMatch(/already links to this destination 2×/);
    }
  });

  it("caps pages per run", () => {
    const two = [candidate({ sourceUrl: S1 }), candidate({ sourceUrl: S2 })];
    const r = evaluateAutopilotBatch(two, revisionFor([S1]), soft({ maxPagesPerRun: 1 }), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accepted).toHaveLength(1);
      expect(r.skipped[0].reason).toMatch(/already covers 1 pages/);
    }
  });

  it("caps total changes", () => {
    const two = [candidate({ targetUrl: T1 }), candidate({ targetUrl: T2 })];
    const r = evaluateAutopilotBatch(two, revisionFor([S1]), soft({ maxTotalChanges: 1 }), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.accepted).toHaveLength(1);
  });
});

describe("autopilot: approval issuance", () => {
  it("issues an approval bound to the revision hash with an expiry", () => {
    const rev = revisionFor([S1]);
    const r = evaluateAutopilotBatch([candidate()], rev, rules(), ctx());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.approval.approvedRevisionHash).toBe(rev.revisionHash);
      expect(r.approval.expiresAt).toBe(1_000_000 + 30 * 60_000);
    }
  });

  it("refuses when the revision covers a page Autopilot did not accept", () => {
    // Revision includes S2, but only S1 was proposed — a scope mismatch.
    const r = evaluateAutopilotBatch([candidate({ sourceUrl: S1 })], revisionFor([S1, S2]), rules(), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/in the revision but not in the accepted set/);
  });

  it("never issues an approval for an empty batch", () => {
    const r = evaluateAutopilotBatch([], revisionFor([]), rules(), ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/No candidate satisfied/);
  });
});

describe("autopilot: rule normalization", () => {
  it("keeps defaults safe and Autopilot off", () => {
    expect(DEFAULT_AUTOPILOT_RULES.enabled).toBe(false);
    expect(DEFAULT_AUTOPILOT_RULES.allowedEnvironments).toEqual(["staging"]);
    expect(DEFAULT_AUTOPILOT_RULES.minimumConfidence).toBe(0.8);
    expect(DEFAULT_AUTOPILOT_RULES.maxLinksPerPage).toBe(3);
    expect(DEFAULT_AUTOPILOT_RULES.maxLinksToSameTarget).toBe(2);
  });

  it("strips tasks that are never eligible", () => {
    const n = normalizeRules({ allowedTasks: ["insert_internal_links", "publish_content"] as never });
    expect(n.allowedTasks).toEqual(["insert_internal_links"]);
  });

  it("clamps limits into safe bounds", () => {
    const n = normalizeRules({ maxLinksPerPage: 999, maxPagesPerRun: 0, approvalTtlMinutes: 10_000 });
    expect(n.maxLinksPerPage).toBe(10);
    expect(n.maxPagesPerRun).toBe(1);
    expect(n.approvalTtlMinutes).toBe(240);
  });

  it("never lets the confidence floor drop below 0.5", () => {
    expect(normalizeRules({ minimumConfidence: 0.1 }).minimumConfidence).toBe(0.5);
    expect(normalizeRules({ minimumConfidence: 0.95 }).minimumConfidence).toBe(0.95);
  });
});
