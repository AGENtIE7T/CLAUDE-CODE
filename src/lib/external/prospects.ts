/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Backlink prospects + unlinked brand-mention detection (Section 12).
 * ─────────────────────────────────────────────────────────────────────────
 *  The platform MAY: monitor backlinks, find relevant outreach prospects, and
 *  identify unlinked brand mentions. It MUST NOT create backlinks, publish on
 *  third-party sites, or send bulk outreach. This module does only the allowed,
 *  read-and-recommend parts. Pure and deterministic.
 */

export interface MentionCandidate {
  /** The page that mentions the brand. */
  sourceUrl: string;
  /** Domain of the source page. */
  sourceDomain: string;
  /** Text snippet around the mention. */
  snippet: string;
  /** True if the mention already links to the brand domain. */
  alreadyLinks: boolean;
}

export interface UnlinkedMention extends MentionCandidate {
  alreadyLinks: false;
}

/** Extract brand mentions from a page's visible text + link set. */
export function findMentions(
  brand: string,
  brandDomain: string,
  sourceUrl: string,
  text: string,
  outboundHrefs: string[],
): MentionCandidate[] {
  const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  const mentions: MentionCandidate[] = [];
  const linksToBrand = outboundHrefs.some((h) => {
    try {
      return new URL(h).hostname.replace(/^www\./, "").endsWith(brandDomain.replace(/^www\./, ""));
    } catch {
      return false;
    }
  });
  let m: RegExpExecArray | null;
  let sourceDomain = "";
  try {
    sourceDomain = new URL(sourceUrl).hostname;
  } catch {
    /* leave blank */
  }
  while ((m = re.exec(text))) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + brand.length + 60);
    mentions.push({
      sourceUrl,
      sourceDomain,
      snippet: text.slice(start, end).replace(/\s+/g, " ").trim(),
      alreadyLinks: linksToBrand,
    });
  }
  return mentions;
}

/** Keep only mentions that do NOT already link to the brand — the opportunity. */
export function unlinkedMentions(mentions: MentionCandidate[]): UnlinkedMention[] {
  return mentions.filter((m): m is UnlinkedMention => !m.alreadyLinks);
}

export interface ProspectSignals {
  domain: string;
  /** 0..1 topical relevance to the brand's niche. */
  relevance: number;
  /** 0..1 authority proxy (e.g. normalized domain rating). */
  authority: number;
  /** True if the domain already links to the brand (skip — already have it). */
  alreadyLinks: boolean;
  /** True if this is an unlinked mention (warm prospect). */
  unlinkedMention: boolean;
}

export interface ScoredProspect {
  domain: string;
  score: number;
  stage: "prospect";
  reason: string;
  /** Never auto-contacted — this is a manual-review queue entry. */
  requiresManualReview: true;
}

/**
 * Score and rank outreach prospects. Higher = better opportunity. Domains that
 * already link are dropped. Unlinked mentions are boosted (warm). This produces
 * a REVIEW LIST only — nothing is contacted.
 */
export function scoreProspects(signals: ProspectSignals[], minScore = 0.5): ScoredProspect[] {
  return signals
    .filter((s) => !s.alreadyLinks)
    .map((s) => {
      const warm = s.unlinkedMention ? 0.15 : 0;
      const score = Number(Math.min(1, 0.55 * s.relevance + 0.3 * s.authority + warm).toFixed(3));
      const reasons: string[] = [
        `relevance ${s.relevance.toFixed(2)}`,
        `authority ${s.authority.toFixed(2)}`,
      ];
      if (s.unlinkedMention) reasons.push("unlinked brand mention");
      return {
        domain: s.domain,
        score,
        stage: "prospect" as const,
        reason: reasons.join(", "),
        requiresManualReview: true as const,
      };
    })
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
