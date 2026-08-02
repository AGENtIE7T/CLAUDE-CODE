import type { ChannelKind } from "@/lib/types";

/**
 * Always-on safety layer. Every draft passes these before it can be
 * scheduled or published. Failing any check parks the item for human review
 * with a reason, rather than silently publishing.
 */

export interface GuardVerdict {
  ok: boolean;
  reasons: string[];
}

/** Normalize text for near-duplicate comparison. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Cheap Jaccard similarity over word shingles — good enough to catch
 *  the reposted-everywhere pattern that gets accounts flagged. */
export function similarity(a: string, b: string): number {
  const wa = new Set(normalize(a).split(" "));
  const wb = new Set(normalize(b).split(" "));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

/** Block a draft that is too close to something already published nearby. */
export function dedupeGuard(body: string, recentBodies: string[], threshold = 0.85): GuardVerdict {
  const hit = recentBodies.find((prev) => similarity(body, prev) >= threshold);
  return hit
    ? { ok: false, reasons: [`Near-duplicate of recent content (>=${threshold} similarity).`] }
    : { ok: true, reasons: [] };
}

/** Enforce per-channel posting cadence. */
export function rateCapGuard(postsLast24h: number, capPerDay: number): GuardVerdict {
  return postsLast24h < capPerDay
    ? { ok: true, reasons: [] }
    : { ok: false, reasons: [`Rate cap reached (${postsLast24h}/${capPerDay} in 24h).`] };
}

/**
 * Brand + fact guard. Flags fabricated-looking stats and claims that fall
 * outside an allowlist. Deliberately conservative: it flags for human review,
 * it does not rewrite. Wire an LLM-based fact-check here for full coverage.
 */
export function brandFactGuard(body: string, claimAllowlist: string[]): GuardVerdict {
  const reasons: string[] = [];

  // Suspiciously specific unsourced percentages are the most common hallucination.
  const stats = body.match(/\b\d{1,3}(\.\d+)?%/g) ?? [];
  const hasSource = /\bsource:|\baccording to\b|\[\d+\]|https?:\/\//i.test(body);
  if (stats.length > 0 && !hasSource) {
    reasons.push(`${stats.length} statistic(s) with no visible source.`);
  }

  // If an allowlist is provided, superlative claims must be backed by it.
  const superlatives = body.match(/\b(best|#1|number one|leading|fastest|cheapest)\b/gi) ?? [];
  if (superlatives.length > 0 && claimAllowlist.length > 0) {
    const backed = superlatives.every((s) =>
      claimAllowlist.some((c) => c.toLowerCase().includes(s.toLowerCase())),
    );
    if (!backed) reasons.push("Unbacked superlative claim (not in allowlist).");
  }

  return { ok: reasons.length === 0, reasons };
}

export interface RunGuardsInput {
  body: string;
  channelKind: ChannelKind;
  recentBodies: string[];
  postsLast24h: number;
  capPerDay: number;
  claimAllowlist: string[];
}

/** Run every guard; a single failure means the item must go to review. */
export function runGuards(input: RunGuardsInput): GuardVerdict {
  const verdicts = [
    dedupeGuard(input.body, input.recentBodies),
    rateCapGuard(input.postsLast24h, input.capPerDay),
    brandFactGuard(input.body, input.claimAllowlist),
  ];
  const reasons = verdicts.flatMap((v) => v.reasons);
  return { ok: reasons.length === 0, reasons };
}
