/**
 * ─────────────────────────────────────────────────────────────────────────
 *  robots.txt + XML sitemap parsing.
 * ─────────────────────────────────────────────────────────────────────────
 *  Pure parsers that turn fetched text into structured data. No network I/O
 *  here — the caller fetches (through the SSRF-guarded fetcher) and passes the
 *  body in. That keeps parsing fully unit-testable and demo-safe.
 *
 *  The robots parser is deliberately conservative and read-only: it extracts
 *  Sitemap: directives and Disallow/Allow rules per user-agent so the crawler
 *  can RESPECT them. It never "interprets" robots.txt as instructions to obey
 *  beyond crawl scoping.
 */

export interface RobotsRules {
  /** Sitemap URLs declared anywhere in the file. */
  sitemaps: string[];
  /** Disallow paths that apply to our crawler (ua "*" merged with our UA). */
  disallow: string[];
  /** Allow paths that apply to our crawler. */
  allow: string[];
  /** Crawl-delay seconds if specified for our group. */
  crawlDelay: number | null;
}

/** Our crawler's user-agent token used to select the applicable group. */
export const CRAWLER_UA = "SEOCommandCenterBot";

/**
 * Parse robots.txt. Rules are grouped by User-agent; we collect the group that
 * matches our UA plus the wildcard "*" group (our-UA rules take precedence but
 * we union the disallow lists to stay conservative).
 */
export function parseRobots(text: string, ua: string = CRAWLER_UA): RobotsRules {
  const sitemaps: string[] = [];
  const groups: { agents: string[]; disallow: string[]; allow: string[]; crawlDelay: number | null }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!lastLineWasAgent || !current) {
        current = { agents: [], disallow: [], allow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;
    if (field === "disallow") current.disallow.push(value);
    else if (field === "allow") current.allow.push(value);
    else if (field === "crawl-delay") {
      const n = Number(value);
      if (!Number.isNaN(n)) current.crawlDelay = n;
    }
  }

  const uaLower = ua.toLowerCase();
  const applicable = groups.filter(
    (g) => g.agents.includes("*") || g.agents.some((a) => uaLower.includes(a) || a.includes(uaLower)),
  );

  const disallow = new Set<string>();
  const allow = new Set<string>();
  let crawlDelay: number | null = null;
  for (const g of applicable) {
    g.disallow.forEach((d) => d && disallow.add(d));
    g.allow.forEach((a) => a && allow.add(a));
    if (g.crawlDelay !== null) crawlDelay = crawlDelay === null ? g.crawlDelay : Math.max(crawlDelay, g.crawlDelay);
  }

  return { sitemaps, disallow: [...disallow], allow: [...allow], crawlDelay };
}

/**
 * Decide whether a path is allowed by robots rules. Longest-match-wins between
 * Allow and Disallow, per the de-facto standard. An empty Disallow value means
 * "allow all"; "/" means "disallow all".
 */
export function isPathAllowedByRobots(path: string, rules: RobotsRules): boolean {
  const match = (patterns: string[]): number => {
    let best = -1;
    for (const p of patterns) {
      if (p === "") continue;
      // robots wildcards: "*" any, "$" end anchor.
      const re = new RegExp(
        "^" +
          p
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\\\$$/, "$") +
          (p.endsWith("$") ? "" : ""),
      );
      if (re.test(path)) best = Math.max(best, p.length);
    }
    return best;
  };
  const dis = match(rules.disallow);
  const alw = match(rules.allow);
  if (dis === -1) return true; // nothing disallows it
  return alw >= dis; // allow wins ties and longer matches
}

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

/**
 * Parse an XML sitemap or sitemap index. Returns page URLs (<url><loc>) and,
 * for an index, the child sitemap URLs (<sitemap><loc>) under `sitemapRefs`.
 * A tolerant regex parse — sitemaps are simple and often slightly malformed;
 * we avoid pulling in an XML dependency.
 */
export function parseSitemap(xml: string): {
  urls: SitemapEntry[];
  sitemapRefs: string[];
  isIndex: boolean;
} {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const urls: SitemapEntry[] = [];
  const sitemapRefs: string[] = [];

  const blockRe = isIndex ? /<sitemap\b[\s\S]*?<\/sitemap>/gi : /<url\b[\s\S]*?<\/url>/gi;
  const locRe = /<loc>\s*([\s\S]*?)\s*<\/loc>/i;
  const lastmodRe = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i;

  const blocks = xml.match(blockRe) ?? [];
  for (const b of blocks) {
    const loc = locRe.exec(b)?.[1]?.trim();
    if (!loc) continue;
    const decoded = decodeXmlEntities(loc);
    if (isIndex) sitemapRefs.push(decoded);
    else urls.push({ loc: decoded, lastmod: lastmodRe.exec(b)?.[1]?.trim() ?? null });
  }
  return { urls, sitemapRefs, isIndex };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
