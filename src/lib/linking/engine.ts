/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Internal-linking engine — candidate generation → validated preview.
 * ─────────────────────────────────────────────────────────────────────────
 *  Produces explainable, technically-validated internal-link candidates under
 *  strict default limits (Section 10). This is PREVIEW-ONLY: it proposes; it
 *  never writes. Every candidate carries its score components, an anchor, the
 *  source sentence, and a full validation record.
 *
 *  Defaults (all overridable, all clamped):
 *    max 5 links inserted per page · max 2 links to same target per page
 *    max 20 pages per write batch · min confidence 0.80 · no self/duplicate
 *    links · protected URLs excluded · target must be canonical + indexable.
 */

import { normalizeUrl } from "@/lib/crawler/normalize";
import { isProtected } from "@/lib/websites/protected";
import { selectAnchor, isAcceptableAnchor } from "@/lib/linking/anchor";
import {
  scoreComponents,
  finalScore,
  explain,
  type LinkingPage,
  type ScoreComponents,
} from "@/lib/linking/score";

export interface LinkingLimits {
  maxLinksPerPage: number;
  maxLinksToSameTarget: number;
  maxPagesPerBatch: number;
  minConfidence: number;
}

export const DEFAULT_LIMITS: LinkingLimits = {
  maxLinksPerPage: 5,
  maxLinksToSameTarget: 1,
  maxPagesPerBatch: 20,
  minConfidence: 0.8,
};

export interface LinkCandidate {
  sourceUrl: string;
  targetUrl: string;
  sourceType: string;
  targetType: string;
  anchor: string;
  sentence: string;
  confidence: number;
  components: ScoreComponents;
  reason: string;
  needsEditorialReview: boolean;
  targetCanonical: boolean;
  targetIndexable: boolean;
}

export interface LinkingInput {
  pages: LinkingPage[];
  /** Pages to source links FROM (already scoped by include/exclude). */
  sourceUrls: string[];
  protectedPatterns?: string[];
  limits?: Partial<LinkingLimits>;
}

export interface LinkingPreview {
  candidates: LinkCandidate[];
  pagesConsidered: number;
  rejected: { targetUrl: string; sourceUrl: string; reason: string }[];
}

/** True iff a target is a technically valid, allowed link destination. */
function validateTarget(
  source: LinkingPage,
  target: LinkingPage,
  protectedPatterns: string[],
): string | null {
  if (normalizeUrl(target.url) === normalizeUrl(source.url)) return "self-link";
  if (target.status < 200 || target.status >= 400) return "target not 2xx/3xx";
  if (!target.indexable) return "target not indexable";
  if (!target.canonicalIsSelf) return "target is not canonical";
  if (isProtected(target.url, protectedPatterns)) return "target is a protected URL";
  const normTarget = normalizeUrl(target.url);
  if (normTarget && source.existingTargets.has(normTarget)) return "link already exists";
  return null;
}

/** Generate an explainable, validated, limited linking preview. */
export function generateLinkingPreview(input: LinkingInput): LinkingPreview {
  const limits: LinkingLimits = { ...DEFAULT_LIMITS, ...(input.limits ?? {}) };
  const protectedPatterns = input.protectedPatterns ?? [];
  const byUrl = new Map(input.pages.map((p) => [normalizeUrl(p.url) ?? p.url, p]));

  const candidates: LinkCandidate[] = [];
  const rejected: LinkingPreview["rejected"] = [];
  let pagesConsidered = 0;

  const sources = input.sourceUrls
    .map((u) => byUrl.get(normalizeUrl(u) ?? u))
    .filter((p): p is LinkingPage => Boolean(p))
    .slice(0, limits.maxPagesPerBatch);

  for (const source of sources) {
    pagesConsidered++;
    const perPage: LinkCandidate[] = [];
    const perTargetCount = new Map<string, number>();

    for (const target of input.pages) {
      if (target === source) continue;

      const invalid = validateTarget(source, target, protectedPatterns);
      if (invalid) {
        rejected.push({ targetUrl: target.url, sourceUrl: source.url, reason: invalid });
        continue;
      }

      const components = scoreComponents(source, target);
      const confidence = finalScore(components);
      if (confidence < limits.minConfidence) {
        rejected.push({ targetUrl: target.url, sourceUrl: source.url, reason: `below min confidence (${confidence})` });
        continue;
      }

      const anchor = selectAnchor(source.text, target.title);
      if (!anchor || !isAcceptableAnchor(anchor.anchor)) {
        rejected.push({ targetUrl: target.url, sourceUrl: source.url, reason: "no acceptable anchor" });
        continue;
      }

      perPage.push({
        sourceUrl: source.url,
        targetUrl: target.url,
        sourceType: source.type,
        targetType: target.type,
        anchor: anchor.anchor,
        sentence: anchor.sentence,
        confidence,
        components,
        reason: explain(components),
        needsEditorialReview: anchor.needsEditorialReview,
        targetCanonical: target.canonicalIsSelf,
        targetIndexable: target.indexable,
      });
    }

    // Rank by confidence, then apply per-target and per-page caps.
    perPage.sort((a, b) => b.confidence - a.confidence);
    const accepted: LinkCandidate[] = [];
    for (const c of perPage) {
      const key = normalizeUrl(c.targetUrl) ?? c.targetUrl;
      const count = perTargetCount.get(key) ?? 0;
      if (count >= limits.maxLinksToSameTarget) continue;
      if (accepted.length >= limits.maxLinksPerPage) break;
      perTargetCount.set(key, count + 1);
      accepted.push(c);
    }
    candidates.push(...accepted);
  }

  return { candidates, pagesConsidered, rejected };
}
