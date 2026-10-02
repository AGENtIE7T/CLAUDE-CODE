/**
 * Performance aggregation, correlation and plain-language insights.
 * Computed in code: the model never invents these numbers.
 */
import type { AggregatedStats } from "./schema";
import type { PerformanceEntry } from "./storage";

export type Dimension = "hook_type" | "content_pillar" | "niche" | "emotion";
export const DIMENSIONS: { key: Dimension; label: string; noun: string }[] = [
  { key: "hook_type", label: "Hook type", noun: "hooks" },
  { key: "content_pillar", label: "Content pillar", noun: "reels" },
  { key: "niche", label: "Niche", noun: "reels" },
  { key: "emotion", label: "Emotion", noun: "reels" },
];

export interface GroupStat {
  group: string;
  posts: number;
  avg_views: number;
  avg_saves: number;
  avg_shares: number;
  avg_hold_rate: number;
  avg_watch_pct: number;
  avg_predicted_score: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Pearson correlation. Null when fewer than 3 points or no variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

export function describeCorrelation(r: number | null): string {
  if (r == null) return "not enough data";
  const a = Math.abs(r);
  const strength = a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "no real";
  return a < 0.2 ? "no real relationship" : `${strength} ${r > 0 ? "positive" : "negative"}`;
}

export function groupBy(entries: PerformanceEntry[], dim: Dimension): GroupStat[] {
  const groups = new Map<string, { label: string; items: PerformanceEntry[] }>();
  for (const e of entries) {
    const label = (e[dim] || "unknown").trim();
    const key = label.toLowerCase();
    const g = groups.get(key) ?? { label, items: [] };
    g.items.push(e);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ label, items }) => ({
      group: label,
      posts: items.length,
      avg_views: r1(mean(items.map((i) => i.views))),
      avg_saves: r1(mean(items.map((i) => i.saves))),
      avg_shares: r1(mean(items.map((i) => i.shares))),
      avg_hold_rate: r1(mean(items.map((i) => i.hold_rate_3s))),
      avg_watch_pct: r1(mean(items.map((i) => i.avg_watch_pct))),
      avg_predicted_score: r1(mean(items.map((i) => i.predicted_score))),
    }))
    .sort((a, b) => b.posts - a.posts || b.avg_views - a.avg_views);
}

type Metric = "avg_saves" | "avg_views" | "avg_shares";
const METRIC_NOUN: Record<Metric, string> = { avg_saves: "saves", avg_views: "views", avg_shares: "shares" };

export function insights(entries: PerformanceEntry[]): string[] {
  const out: string[] = [];
  if (entries.length === 0) return out;

  for (const d of DIMENSIONS) {
    if (d.key === "niche" && new Set(entries.map((e) => e.niche.toLowerCase())).size < 2) continue;
    const groups = groupBy(entries, d.key);
    if (groups.length < 2) continue;
    for (const m of ["avg_saves", "avg_views"] as Metric[]) {
      const sorted = [...groups].sort((a, b) => b[m] - a[m]);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (worst[m] <= 0) {
        if (best[m] > 0) out.push(`"${best.group}" ${d.noun} got ${best[m]} ${METRIC_NOUN[m]} on average while "${worst.group}" ${d.noun} got none (${best.posts} vs ${worst.posts} posts).`);
        continue;
      }
      const ratio = best[m] / worst[m];
      if (ratio >= 1.2) {
        out.push(`"${best.group}" ${d.noun} averaged ${ratio.toFixed(1)}x more ${METRIC_NOUN[m]} than "${worst.group}" ${d.noun} (${best.posts} vs ${worst.posts} posts).`);
      }
    }
  }

  const scores = entries.map((e) => e.predicted_score);
  const rv = pearson(scores, entries.map((e) => e.views));
  const rs = pearson(scores, entries.map((e) => e.saves));
  if (rv != null) out.push(`Critic score vs views: r = ${rv} (${describeCorrelation(rv)}) across ${entries.length} posts.`);
  if (rs != null) out.push(`Critic score vs saves: r = ${rs} (${describeCorrelation(rs)}).`);

  const lowHold = entries.filter((e) => e.hold_rate_3s > 0 && e.hold_rate_3s < 40);
  if (lowHold.length) out.push(`${lowHold.length} of ${entries.length} posts held under 40% of viewers past 3 seconds. That's a hook problem: test new first frames.`);
  const lowWatch = entries.filter((e) => e.avg_watch_pct > 0 && e.avg_watch_pct < 30);
  if (lowWatch.length) out.push(`${lowWatch.length} of ${entries.length} posts had average watch under 30%. That's a body problem: cut slower beats.`);

  if (entries.length < 5) out.push(`Only ${entries.length} post${entries.length > 1 ? "s" : ""} logged so far. Treat these patterns as early signals, not rules.`);
  return out;
}

/** Aggregates only: no business names, notes, dates or ids leave the browser. */
export function aggregate(entries: PerformanceEntry[]): AggregatedStats {
  const scores = entries.map((e) => e.predicted_score);
  const clip = (gs: GroupStat[]) => gs.slice(0, 50).map((g) => ({ ...g, group: g.group.slice(0, 80) }));
  return {
    total_posts: entries.length,
    correlation_score_views: pearson(scores, entries.map((e) => e.views)),
    correlation_score_saves: pearson(scores, entries.map((e) => e.saves)),
    by_hook_type: clip(groupBy(entries, "hook_type")),
    by_pillar: clip(groupBy(entries, "content_pillar")),
    by_niche: clip(groupBy(entries, "niche")),
    by_emotion: clip(groupBy(entries, "emotion")),
    insights: insights(entries).slice(0, 20).map((s) => s.slice(0, 300)),
  };
}
