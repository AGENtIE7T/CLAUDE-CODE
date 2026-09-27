/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Natural anchor-text selection (Section 11).
 * ─────────────────────────────────────────────────────────────────────────
 *  Anchors must be descriptive and natural. We prefer a phrase that ALREADY
 *  exists in a source sentence and that accurately describes the destination.
 *  We avoid generic anchors ("click here"), exact-match commercial stuffing,
 *  and unnatural rewrites. If no good anchor exists in the source text, we
 *  return a suggestion flagged for editorial review rather than forcing one.
 */

import { tokenize } from "@/lib/linking/similarity";

const BANNED_ANCHORS = [
  "click here", "read more", "learn more", "this page", "here", "link",
  "this article", "more", "click", "website",
];

export interface AnchorSuggestion {
  anchor: string;
  /** The source sentence the anchor was found in (context for review). */
  sentence: string;
  /** true when we could not find a natural in-text anchor. */
  needsEditorialReview: boolean;
}

/** Split text into sentences (rough but adequate). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Find the best in-text anchor for linking to a target described by
 * `targetTerms` (e.g. tokens of the target title). Returns a phrase drawn from
 * the source, or a review-flagged fallback.
 */
export function selectAnchor(sourceText: string, targetTitle: string): AnchorSuggestion | null {
  const targetTerms = new Set(tokenize(targetTitle));
  if (targetTerms.size === 0) return null;

  const sentences = splitSentences(sourceText);
  let best: { anchor: string; sentence: string; score: number } | null = null;

  for (const sentence of sentences) {
    // Slide a 2–5 word window; score by how many target terms it covers.
    const words = sentence.split(/\s+/);
    for (let len = 5; len >= 2; len--) {
      for (let i = 0; i + len <= words.length; i++) {
        const phraseWords = words.slice(i, i + len);
        const phrase = phraseWords.join(" ").replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
        const lower = phrase.toLowerCase();
        if (!phrase || BANNED_ANCHORS.includes(lower)) continue;
        const covered = tokenize(phrase).filter((w) => targetTerms.has(w)).length;
        if (covered === 0) continue;
        // Prefer more coverage, then shorter phrases (tighter anchors).
        const score = covered * 10 - len;
        if (!best || score > best.score) best = { anchor: phrase, sentence, score };
      }
    }
  }

  if (best && best.score > 0) {
    return { anchor: best.anchor, sentence: best.sentence, needsEditorialReview: false };
  }

  // No natural anchor — propose the target title for editorial review.
  return {
    anchor: targetTitle.trim(),
    sentence: sentences[0] ?? "",
    needsEditorialReview: true,
  };
}

/** Guard: is an anchor acceptable (not banned, not empty, not too long)? */
export function isAcceptableAnchor(anchor: string): boolean {
  const a = anchor.trim().toLowerCase();
  if (!a || a.length > 80) return false;
  return !BANNED_ANCHORS.includes(a);
}
