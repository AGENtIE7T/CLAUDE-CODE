import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLearningContext } from "../lib/learning";
import { generatorSystem, viralPatternsText } from "../lib/prompts";
import { BusinessInputSchema, type GenerationRecord } from "../lib/schema";
import type { PerformanceEntry } from "../lib/storage";

const record: GenerationRecord = JSON.parse(fs.readFileSync(path.join(__dirname, "mocks/record.json"), "utf8"));
const salon = BusinessInputSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/salon.json"), "utf8")));

const perf = (over: Partial<PerformanceEntry>): PerformanceEntry => ({
  id: Math.random().toString(36), generation_id: "g", script_id: "s1", business_name: "X", client_key: "x",
  niche: "Salon / Beauty / Makeup", title: "t", hook_type: "POV", content_pillar: "p", emotion: "e", predicted_score: 70,
  prompt_version: "v", platform: "instagram", post_date: "2026-09-01", views: 1000, hold_rate_3s: 50, avg_watch_pct: 40,
  likes: 1, comments: 1, shares: 1, saves: 5, profile_visits: 1, dms: 1, created_at: "2026-09-02", ...over,
});

describe("viral patterns injection", () => {
  it("injects only the selected niche's patterns", () => {
    const t = viralPatternsText({ niche: "salon" });
    expect(t).toContain("DSP bride");
    expect(t).not.toContain("Surat shoe factory");
    expect(t).toContain("Across niches");
  });
  it("falls back to cross-niche rules for Other", () => {
    const t = viralPatternsText({ niche: "other" });
    expect(t).toContain("Across niches");
    expect(t).not.toContain("This niche: do");
  });
  it("fills every placeholder in the generator prompt", () => {
    const sys = generatorSystem(salon, "- liked hook");
    expect(sys).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(sys).toContain("# VIRAL PATTERNS");
    expect(sys).toContain("- liked hook");
  });
});

describe("buildLearningContext", () => {
  const base = { niche: "salon", nicheLabel: "Salon / Beauty / Makeup", clientKey: "glam studio by neha", generations: [record], performance: [] as PerformanceEntry[], feedback: {} };

  it("is empty when there is no data", () => {
    const c = buildLearningContext(base);
    expect(c.text).toBe("");
  });

  it("includes liked and disliked hooks from the same niche with notes", () => {
    const c = buildLearningContext({
      ...base,
      feedback: {
        [`${record.id}:s1`]: { vote: "up", note: "", updated_at: "" },
        [`${record.id}:s3`]: { vote: "down", note: "too salesy", updated_at: "" },
      },
    });
    expect(c.counts).toMatchObject({ liked: 1, disliked: 1 });
    expect(c.text).toContain("LIKED");
    expect(c.text).toContain(record.output.scripts[0].hook.spoken);
    expect(c.text).toContain("too salesy");
  });

  it("ignores feedback from other niches", () => {
    const other = { ...record, inputs: { ...record.inputs, niche: "gym" } };
    const c = buildLearningContext({ ...base, generations: [other], feedback: { [`${record.id}:s1`]: { vote: "up", note: "", updated_at: "" } } });
    expect(c.counts.liked).toBe(0);
  });

  it("adds computed insights once 3+ reels in the niche are posted", () => {
    const c = buildLearningContext({
      ...base,
      performance: [perf({ hook_type: "Pain call-out", saves: 21 }), perf({ hook_type: "Pain call-out", saves: 21 }), perf({ hook_type: "POV", saves: 10 }), perf({ niche: "Gym / Fitness / Yoga" })],
    });
    expect(c.counts.nichePosts).toBe(3);
    expect(c.text).toContain("2.1x more saves");
  });

  it("includes saved client learnings", () => {
    const c = buildLearningContext({ ...base, clientLearnings: { bullets: ["Do more price reveals"], created_at: "", posts: 6 } });
    expect(c.text).toContain("Do more price reveals");
  });
});
