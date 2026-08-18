/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Explainable internal-link scoring (Section 10).
 * ─────────────────────────────────────────────────────────────────────────
 *    final = 0.30·semantic + 0.15·topic + 0.15·entity + 0.10·intent
 *          + 0.10·page_type + 0.10·business_priority + 0.10·destination_quality
 *
 *  Every component is returned alongside the final score so the recommendation
 *  is fully explainable — no black-box numbers. A link is never suggested on a
 *  bare keyword match; the weighting ensures semantic + topical relevance
 *  dominate.
 */

import { cosineSimilarity, entityOverlap, jaccard, tokenize } from "@/lib/linking/similarity";

export type PageType = "home" | "blog" | "product" | "service" | "category" | "other";

export interface LinkingPage {
  url: string;
  title: string;
  text: string;
  type: PageType;
  indexable: boolean;
  canonicalIsSelf: boolean;
  status: number;
  /** Normalized targets already linked from this page. */
  existingTargets: Set<string>;
  /** Business priority 0..1 (from website settings; commercial pages higher). */
  businessPriority: number;
}

export interface ScoreComponents {
  semantic_similarity: number;
  topic_match: number;
  entity_match: number;
  intent_match: number;
  page_type_compatibility: number;
  business_priority: number;
  destination_quality: number;
}

export const WEIGHTS: Record<keyof ScoreComponents, number> = {
  semantic_similarity: 0.3,
  topic_match: 0.15,
  entity_match: 0.15,
  intent_match: 0.1,
  page_type_compatibility: 0.1,
  business_priority: 0.1,
  destination_quality: 0.1,
};

/** Which source→target page-type pairs make editorial sense. */
function pageTypeCompatibility(source: PageType, target: PageType): number {
  // Blog/informational → commercial (category/service/product) is the classic,
  // highest-value internal link. Same-type links are fine but less valuable.
  const table: Record<string, number> = {
    "blog>category": 1, "blog>service": 1, "blog>product": 0.9,
    "blog>blog": 0.6, "service>service": 0.7, "service>category": 0.8,
    "category>product": 0.8, "home>service": 0.6, "home>category": 0.6,
  };
  return table[`${source}>${target}`] ?? 0.4;
}

/** Search-intent compatibility: informational source → commercial target. */
function intentMatch(source: PageType, target: PageType): number {
  const informational = source === "blog" || source === "home" || source === "other";
  const commercial = target === "product" || target === "service" || target === "category";
  if (informational && commercial) return 1;
  if (source === target) return 0.5;
  return 0.4;
}

/** Destination quality from technical signals. */
function destinationQuality(target: LinkingPage): number {
  let q = 0;
  if (target.status >= 200 && target.status < 300) q += 0.5;
  if (target.indexable) q += 0.3;
  if (target.canonicalIsSelf) q += 0.2;
  return Math.min(1, q);
}

export function scoreComponents(source: LinkingPage, target: LinkingPage): ScoreComponents {
  const semantic_similarity = cosineSimilarity(source.text, target.text);
  const topic_match = jaccard(tokenize(source.title + " " + source.text), tokenize(target.title));
  const entity_match = entityOverlap(source.text, target.text);
  const intent_match = intentMatch(source.type, target.type);
  const page_type_compatibility = pageTypeCompatibility(source.type, target.type);
  const business_priority = clamp01(target.businessPriority);
  const destination_quality = destinationQuality(target);
  return {
    semantic_similarity,
    topic_match,
    entity_match,
    intent_match,
    page_type_compatibility,
    business_priority,
    destination_quality,
  };
}

export function finalScore(c: ScoreComponents): number {
  let s = 0;
  (Object.keys(WEIGHTS) as (keyof ScoreComponents)[]).forEach((k) => {
    s += WEIGHTS[k] * c[k];
  });
  return Number(s.toFixed(4));
}

/** Human-readable explanation of the top contributing components. */
export function explain(c: ScoreComponents): string {
  const contributions = (Object.keys(WEIGHTS) as (keyof ScoreComponents)[])
    .map((k) => ({ k, v: WEIGHTS[k] * c[k] }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => `${x.k.replace(/_/g, " ")} (${x.v.toFixed(2)})`);
  return `Top factors: ${contributions.join(", ")}.`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
