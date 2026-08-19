/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Revisions — content hashing, revision building, stale-preview detection.
 * ─────────────────────────────────────────────────────────────────────────
 *  A revision is the exact, hashable unit an approval authorizes. The write
 *  engine may only apply a revision whose:
 *    · baseHash still matches the page's CURRENT content (not stale), and
 *    · revisionHash matches the approval's approvedRevisionHash.
 *
 *  This is what makes "approve, then apply exactly that" safe: if the page
 *  changed between preview and execute, baseHash won't match and the write is
 *  rejected as stale. Pure; no I/O.
 */

import { createHash } from "node:crypto";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export interface RevisionItem {
  url: string;
  beforeHtml: string;
  afterHtml: string;
}

export interface Revision {
  websiteId: string;
  items: RevisionItem[];
  /** Hash of each page's CURRENT content at preview time (staleness check). */
  baseHash: string;
  /** Hash of the proposed result — this is what an approval binds to. */
  revisionHash: string;
  createdAt: string;
}

function joinFor(items: RevisionItem[], pick: (i: RevisionItem) => string): string {
  // Deterministic order by URL so the hash is stable regardless of input order.
  return [...items]
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
    .map((i) => `${i.url}\n${pick(i)}`)
    .join("\n---\n");
}

/** Build a revision (and its hashes) from before/after page contents. */
export function buildRevision(websiteId: string, items: RevisionItem[]): Revision {
  const baseHash = hashContent(joinFor(items, (i) => i.beforeHtml));
  const revisionHash = hashContent(joinFor(items, (i) => i.afterHtml));
  return { websiteId, items, baseHash, revisionHash, createdAt: new Date().toISOString() };
}

/**
 * Given the page's live content NOW, is the revision still applicable?
 * Returns true when the current content still hashes to the revision's
 * baseHash (i.e. nothing changed since the preview was built).
 */
export function isRevisionFresh(revision: Revision, currentByUrl: Record<string, string>): boolean {
  const current = revision.items.map((i) => ({ ...i, beforeHtml: currentByUrl[i.url] ?? "" }));
  const currentBaseHash = hashContent(joinFor(current, (i) => i.beforeHtml));
  return currentBaseHash === revision.baseHash;
}
