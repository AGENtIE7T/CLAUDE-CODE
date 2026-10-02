import { describe, expect, it } from "vitest";
import { AggregatedStatsSchema } from "../lib/schema";
import { aggregate, describeCorrelation, groupBy, insights, pearson } from "../lib/stats";
import type { PerformanceEntry } from "../lib/storage";

let n = 0;
function entry(over: Partial<PerformanceEntry>): PerformanceEntry {
  n++;
  return {
    id: `p${n}`,
    generation_id: "g1",
    script_id: `s${n}`,
    business_name: "Secret Salon Pvt",
    client_key: "secret salon pvt",
    niche: "Salon / Beauty / Makeup",
    title: "t",
    hook_type: "POV",
    content_pillar: "transformations",
    emotion: "joy",
    predicted_score: 70,
    prompt_version: "v1",
    platform: "instagram",
    post_date: "2026-09-01",
    views: 1000,
    hold_rate_3s: 50,
    avg_watch_pct: 40,
    likes: 10,
    comments: 1,
    shares: 2,
    saves: 5,
    profile_visits: 3,
    dms: 1,
    created_at: "2026-09-02",
    ...over,
  };
}

describe("pearson", () => {
  it("is 1 for perfectly linear data and -1 for inverse", () => {
    expect(pearson([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
    expect(pearson([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1);
  });
  it("returns null for < 3 points or no variance", () => {
    expect(pearson([1, 2], [3, 4])).toBeNull();
    expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull();
  });
  it("describes strength", () => {
    expect(describeCorrelation(0.8)).toBe("strong positive");
    expect(describeCorrelation(-0.5)).toBe("moderate negative");
    expect(describeCorrelation(0.1)).toBe("no real relationship");
    expect(describeCorrelation(null)).toBe("not enough data");
  });
});

describe("groupBy", () => {
  it("groups case-insensitively and averages", () => {
    const g = groupBy(
      [entry({ hook_type: "POV", saves: 4 }), entry({ hook_type: "pov", saves: 6 }), entry({ hook_type: "Pain call-out", saves: 21 })],
      "hook_type",
    );
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ group: "POV", posts: 2, avg_saves: 5 });
    expect(g[1]).toMatchObject({ group: "Pain call-out", posts: 1, avg_saves: 21 });
  });
});

describe("insights", () => {
  it("computes the x-times comparison", () => {
    const out = insights([
      entry({ hook_type: "Pain call-out", saves: 21, views: 2000 }),
      entry({ hook_type: "Pain call-out", saves: 21, views: 2000 }),
      entry({ hook_type: "POV", saves: 10, views: 1000 }),
    ]);
    expect(out).toContain('"Pain call-out" hooks averaged 2.1x more saves than "POV" hooks (2 vs 1 posts).');
    expect(out.some((s) => s.includes("early signals"))).toBe(true);
  });
  it("flags low 3-second hold", () => {
    expect(insights([entry({ hold_rate_3s: 20 })]).some((s) => s.includes("hook problem"))).toBe(true);
  });
  it("returns nothing for no data", () => {
    expect(insights([])).toEqual([]);
  });
});

describe("aggregate", () => {
  it("matches the API schema and contains no personal data", () => {
    const entries = [entry({ predicted_score: 60, views: 500 }), entry({ predicted_score: 70, views: 900 }), entry({ predicted_score: 80, views: 1500, hook_type: "Myth-bust" })];
    const a = aggregate(entries);
    expect(AggregatedStatsSchema.safeParse(a).success).toBe(true);
    expect(a.total_posts).toBe(3);
    expect(a.correlation_score_views).toBeGreaterThan(0.9);
    const json = JSON.stringify(a);
    expect(json).not.toContain("Secret Salon");
    expect(json).not.toContain("2026-09");
  });
});
