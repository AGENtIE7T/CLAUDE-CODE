/**
 * ─────────────────────────────────────────────────────────────────────────
 *  HTML-safe link application (Section 10 insertion rules).
 * ─────────────────────────────────────────────────────────────────────────
 *  Turns an approved link candidate into an actual edit of a page's HTML by
 *  wrapping the FIRST safe occurrence of the anchor phrase in an <a> tag.
 *
 *  It refuses to insert inside "no-touch" regions: existing anchors, headings,
 *  code/pre/script/style blocks, and it never double-links. If the anchor
 *  phrase cannot be found in body text safely, the edit is reported as skipped
 *  rather than forcing an unnatural change. Pure and deterministic.
 */

export interface LinkEdit {
  anchor: string;
  targetUrl: string;
  rel?: string;
}

export interface ApplyResult {
  html: string;
  applied: { anchor: string; targetUrl: string }[];
  skipped: { anchor: string; targetUrl: string; reason: string }[];
}

/** Regions whose inner text must never be altered. */
const PROTECTED_BLOCKS = /<(a|h[1-6]|code|pre|script|style|button|nav|form)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Compute the character ranges covered by protected blocks, so we only edit
 * text that lies outside all of them.
 */
function protectedRanges(html: string): [number, number][] {
  const ranges: [number, number][] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PROTECTED_BLOCKS.source, "gi");
  while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function inProtected(pos: number, ranges: [number, number][]): boolean {
  return ranges.some(([a, b]) => pos >= a && pos < b);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Apply a set of link edits to HTML. Each edit links the first safe, unlinked
 * occurrence of its anchor text. Returns the new HTML plus applied/skipped logs.
 */
export function applyLinks(html: string, edits: LinkEdit[]): ApplyResult {
  let out = html;
  const applied: ApplyResult["applied"] = [];
  const skipped: ApplyResult["skipped"] = [];

  for (const edit of edits) {
    const anchor = edit.anchor.trim();
    if (!anchor) {
      skipped.push({ anchor: edit.anchor, targetUrl: edit.targetUrl, reason: "empty anchor" });
      continue;
    }

    // Don't add a second link to the same target if it already exists.
    if (new RegExp(`<a\\b[^>]*href=["']${escapeRegExp(edit.targetUrl)}["']`, "i").test(out)) {
      skipped.push({ anchor, targetUrl: edit.targetUrl, reason: "target already linked" });
      continue;
    }

    const ranges = protectedRanges(out);
    // Match the anchor phrase on a word boundary, case-insensitive.
    const phraseRe = new RegExp(`\\b${escapeRegExp(anchor)}\\b`, "i");

    let found = -1;
    let searchFrom = 0;
    // Find the first occurrence that is NOT inside a protected block.
    for (;;) {
      const slice = out.slice(searchFrom);
      const rel = slice.search(phraseRe);
      if (rel === -1) break;
      const abs = searchFrom + rel;
      if (!inProtected(abs, ranges)) {
        found = abs;
        break;
      }
      searchFrom = abs + anchor.length;
    }

    if (found === -1) {
      skipped.push({ anchor, targetUrl: edit.targetUrl, reason: "no safe occurrence in body text" });
      continue;
    }

    const matched = out.slice(found).match(phraseRe)![0]; // preserve original casing
    const relAttr = edit.rel ? ` rel="${escapeAttr(edit.rel)}"` : "";
    const link = `<a href="${escapeAttr(edit.targetUrl)}"${relAttr}>${matched}</a>`;
    out = out.slice(0, found) + link + out.slice(found + matched.length);
    applied.push({ anchor: matched, targetUrl: edit.targetUrl });
  }

  return { html: out, applied, skipped };
}
