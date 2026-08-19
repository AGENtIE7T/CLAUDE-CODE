/**
 * ─────────────────────────────────────────────────────────────────────────
 *  External citations + outbound-link health (Section 12).
 * ─────────────────────────────────────────────────────────────────────────
 *  Two read/preview concerns for links LEAVING the user's site:
 *
 *  A. Citation suggestions — propose relevant, trustworthy sources to cite,
 *     with appropriate rel attributes. Preview only; never auto-inserted.
 *  B. Outbound-link health — classify existing external links (broken,
 *     redirecting, unsafe, affiliate/sponsored) and recommend rel attributes.
 *
 *  Pure and deterministic; link status is passed in (fetched via the
 *  SSRF-guarded crawler elsewhere).
 */

export interface OutboundLink {
  href: string;
  rel: string | null;
  status: number | null; // null = unchecked
  finalUrl?: string | null;
}

export type LinkHealth = "ok" | "broken" | "redirect" | "unchecked";

export interface OutboundFinding {
  href: string;
  health: LinkHealth;
  /** Suggested rel attribute, if the current one is missing/incorrect. */
  suggestedRel: string | null;
  flags: string[]; // e.g. "affiliate", "sponsored", "ugc", "unsafe-scheme"
  note: string;
}

const AFFILIATE_HINTS = [/[?&](aff|affiliate|ref|tag)=/i, /amzn\.to/i, /\/aff\//i];

function classifyHealth(link: OutboundLink): LinkHealth {
  if (link.status == null) return "unchecked";
  if (link.status >= 400) return "broken";
  if (link.status >= 300 && link.status < 400) return "redirect";
  return "ok";
}

/** Audit a page's outbound links. */
export function auditOutbound(links: OutboundLink[]): OutboundFinding[] {
  return links.map((link) => {
    const flags: string[] = [];
    const relTokens = new Set((link.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean));

    const affiliate = AFFILIATE_HINTS.some((re) => re.test(link.href));
    if (affiliate) flags.push("affiliate");
    if (!/^https?:/i.test(link.href)) flags.push("unsafe-scheme");

    // Affiliate/sponsored links should carry rel="sponsored nofollow".
    let suggestedRel: string | null = null;
    if (affiliate && !(relTokens.has("sponsored") || relTokens.has("nofollow"))) {
      suggestedRel = "sponsored nofollow";
    }

    const health = classifyHealth(link);
    const notes: string[] = [];
    if (health === "broken") notes.push("destination returned an error");
    if (health === "redirect") notes.push(`redirects${link.finalUrl ? ` to ${link.finalUrl}` : ""}`);
    if (affiliate) notes.push("looks like an affiliate/paid link — disclose + mark rel");

    return {
      href: link.href,
      health,
      suggestedRel,
      flags,
      note: notes.join("; ") || "no issues detected",
    };
  });
}

export interface CitationSource {
  url: string;
  title: string;
  /** 0..1 authority proxy. */
  authority: number;
  /** 0..1 topical relevance to the citing content. */
  relevance: number;
  /** True if it's a competitor domain — excluded unless explicitly allowed. */
  isCompetitor: boolean;
}

export interface CitationSuggestion {
  url: string;
  title: string;
  score: number;
  suggestedRel: string;
  reason: string;
  requiresApproval: true;
}

/**
 * Rank citation suggestions for a piece of content. Competitors are excluded
 * unless `allowCompetitors` is set. Preview only — never inserted automatically.
 */
export function suggestCitations(
  sources: CitationSource[],
  opts: { minScore?: number; allowCompetitors?: boolean } = {},
): CitationSuggestion[] {
  const minScore = opts.minScore ?? 0.6;
  return sources
    .filter((s) => opts.allowCompetitors || !s.isCompetitor)
    .map((s) => ({
      url: s.url,
      title: s.title,
      score: Number((0.5 * s.authority + 0.5 * s.relevance).toFixed(3)),
      // External citations to third parties default to a clean rel; editorial.
      suggestedRel: "noopener",
      reason: `authority ${s.authority.toFixed(2)}, relevance ${s.relevance.toFixed(2)}`,
      requiresApproval: true as const,
    }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
