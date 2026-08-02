import { describe, it, expect } from "vitest";
import {
  similarity,
  dedupeGuard,
  rateCapGuard,
  brandFactGuard,
  runGuards,
} from "./guards";

describe("similarity", () => {
  it("is 1 for identical text", () => {
    expect(similarity("hello world", "hello world")).toBe(1);
  });
  it("is 0 for disjoint text", () => {
    expect(similarity("alpha beta", "gamma delta")).toBe(0);
  });
  it("ignores punctuation and case", () => {
    expect(similarity("Hello, World!", "hello world")).toBe(1);
  });
});

describe("dedupeGuard", () => {
  it("blocks a near-duplicate", () => {
    const body = "the quick brown fox jumps over the lazy dog";
    const v = dedupeGuard(body, [body], 0.85);
    expect(v.ok).toBe(false);
  });
  it("passes distinct content", () => {
    const v = dedupeGuard("a completely original sentence", ["nothing alike here"], 0.85);
    expect(v.ok).toBe(true);
  });
});

describe("rateCapGuard", () => {
  it("passes under the cap", () => {
    expect(rateCapGuard(2, 3).ok).toBe(true);
  });
  it("blocks at the cap", () => {
    expect(rateCapGuard(3, 3).ok).toBe(false);
  });
});

describe("brandFactGuard", () => {
  it("flags an unsourced statistic", () => {
    const v = brandFactGuard("We grew revenue by 47% last year.", []);
    expect(v.ok).toBe(false);
  });
  it("passes a sourced statistic", () => {
    const v = brandFactGuard("Revenue grew 47% (source: annual report).", []);
    expect(v.ok).toBe(true);
  });
  it("flags an unbacked superlative when an allowlist exists", () => {
    const v = brandFactGuard("We are the best CRM.", ["fastest onboarding"]);
    expect(v.ok).toBe(false);
  });
});

describe("runGuards", () => {
  it("aggregates reasons from every failing guard", () => {
    const v = runGuards({
      body: "We are the #1 tool and grew 90% this year.",
      channelKind: "social",
      recentBodies: ["We are the #1 tool and grew 90% this year."],
      postsLast24h: 5,
      capPerDay: 3,
      claimAllowlist: ["cheapest"],
    });
    expect(v.ok).toBe(false);
    expect(v.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
