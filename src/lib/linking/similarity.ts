/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Text similarity for internal linking (embedding-free, deterministic).
 * ─────────────────────────────────────────────────────────────────────────
 *  The scoring formula (Section 10) weights semantic similarity most heavily.
 *  A production deployment would use vector embeddings (pgvector is already
 *  enabled). To stay demo-safe and fully unit-testable with no model, we use a
 *  TF cosine over content words plus topic/entity overlap. The engine treats
 *  this as a pluggable signal, so swapping in real embeddings later changes one
 *  function, not the pipeline.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "it",
  "this", "that", "these", "those", "we", "you", "your", "our", "their", "his",
  "her", "its", "they", "them", "he", "she", "i", "me", "my", "us", "if", "so",
  "than", "then", "too", "very", "can", "will", "just", "about", "into", "over",
  "how", "what", "which", "who", "when", "where", "why", "all", "any", "each",
]);

/** Tokenize to lowercase content words (letters/digits), dropping stopwords. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length > 2 && !STOPWORDS.has(w),
  );
}

/** Term-frequency vector. */
function tf(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Cosine similarity of two texts over TF vectors. Range 0..1. */
export function cosineSimilarity(a: string, b: string): number {
  const va = tf(tokenize(a));
  const vb = tf(tokenize(b));
  if (va.size === 0 || vb.size === 0) return 0;
  let dot = 0;
  for (const [term, wa] of va) {
    const wb = vb.get(term);
    if (wb) dot += wa * wb;
  }
  const mag = (m: Map<string, number>) =>
    Math.sqrt([...m.values()].reduce((s, x) => s + x * x, 0));
  const denom = mag(va) * mag(vb);
  return denom === 0 ? 0 : dot / denom;
}

/** Jaccard overlap of two token sets — used for topic overlap. Range 0..1. */
export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Containment: what FRACTION of `needles` appears in `haystack`.
 *
 * Jaccard is the wrong measure when the two sides are wildly different sizes.
 * A 400-word article and a three-word page title can never score above about
 * 0.02 on Jaccard however perfectly they match, because the union is dominated
 * by the article. The question worth asking is asymmetric — "does this article
 * cover the destination's topic?" — and that is containment.
 */
export function containment(needles: string[], haystack: string[]): number {
  const set = new Set(haystack);
  const wanted = new Set(needles);
  if (wanted.size === 0) return 0;
  let found = 0;
  for (const n of wanted) if (set.has(n)) found++;
  return found / wanted.size;
}

/**
 * Naive entity extraction: capitalized multi-word phrases + notable nouns.
 * Deterministic stand-in for a real NER model. Returns lowercased entities.
 */
export function extractEntities(text: string): string[] {
  const caps = text.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3})\b/g) ?? [];
  return Array.from(new Set(caps.map((s) => s.toLowerCase())));
}

/**
 * How much of B's entity set appears in A. Asymmetric for the same reason as
 * `containment`: a long source page will always mention more entities than a
 * short destination, and that should not count against the match.
 */
export function entityOverlap(a: string, b: string): number {
  return containment(extractEntities(b), extractEntities(a));
}
