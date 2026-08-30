/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SEO-data provider — the read path for backlink & Search Console reports.
 * ─────────────────────────────────────────────────────────────────────────
 *  Abstracts the third-party SEO-data connectors (Ahrefs / Semrush / Google
 *  Search Console) behind one interface so `backlink_report` and
 *  `search_console_report` tasks have a real data path without coupling the
 *  pipeline to any single vendor.
 *
 *  Demo mode returns seeded, clearly-synthetic data (no keys, no network). Live
 *  mode routes to the configured provider via its API token. These are READ
 *  operations only — this module never writes or contacts anyone.
 *
 *  Live provider selection (env, all optional):
 *    AHREFS_API_TOKEN   → Ahrefs (Site Explorer backlinks, DR)
 *    SEMRUSH_API_KEY    → Semrush (backlinks/authority)
 *    (GSC via the website's connected Search Console OAuth connection)
 */

import { isDemo } from "@/lib/env";
import { ahrefsFromEnv } from "@/lib/external/providers/ahrefs";
import { semrushFromEnv } from "@/lib/external/providers/semrush";
import { describeResult, type ProviderResult } from "@/lib/external/providers/state";

export interface BacklinkRow {
  sourceDomain: string;
  targetUrl: string;
  anchor: string;
  /** 0..100, or null when the source does not supply a per-link figure. */
  domainRating: number | null;
  /** ISO date, or null when the source does not report one. */
  firstSeen: string | null;
  nofollow: boolean;
}

export interface SearchConsoleRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface DomainMetrics {
  domain: string;
  domainRating: number | null; // null when unavailable
  referringDomains: number | null;
  backlinks: number | null;
  source: "demo" | "ahrefs" | "semrush" | "unavailable";
  /**
   * Operator-facing explanation of anything that is null — "semrush: partial
   * — backlinks_overview (plan_insufficient)". Present only in live mode.
   */
  notes?: string[];
}

export interface SeoDataProvider {
  readonly name: string;
  getDomainMetrics(domain: string): Promise<DomainMetrics>;
  getBacklinks(domain: string, limit?: number): Promise<BacklinkRow[]>;
  getSearchConsole(domain: string, limit?: number): Promise<SearchConsoleRow[]>;
}

// ── demo provider ───────────────────────────────────────────────────────────
function demoProvider(): SeoDataProvider {
  return {
    name: "demo",
    async getDomainMetrics(domain) {
      return { domain, domainRating: 42, referringDomains: 128, backlinks: 3120, source: "demo" };
    },
    async getBacklinks(domain, limit = 25) {
      const rows: BacklinkRow[] = [
        { sourceDomain: "news.example", targetUrl: `https://${domain}/blog/a`, anchor: "estate planning guide", domainRating: 71, firstSeen: "2026-03-01", nofollow: false },
        { sourceDomain: "directory.example", targetUrl: `https://${domain}/`, anchor: domain, domainRating: 33, firstSeen: "2026-02-11", nofollow: true },
        { sourceDomain: "partner.example", targetUrl: `https://${domain}/services`, anchor: "these services", domainRating: 58, firstSeen: "2026-01-20", nofollow: false },
      ];
      return rows.slice(0, limit);
    },
    async getSearchConsole(domain, limit = 25) {
      const rows: SearchConsoleRow[] = [
        { query: "estate planning near me", page: `https://${domain}/services`, clicks: 84, impressions: 2100, ctr: 0.04, position: 6.2 },
        { query: "how to avoid probate", page: `https://${domain}/blog/a`, clicks: 42, impressions: 980, ctr: 0.043, position: 8.1 },
      ];
      return rows.slice(0, limit);
    },
  };
}

// ── live provider (Ahrefs / Semrush) ────────────────────────────────────────
/**
 * The live provider delegates to the typed provider clients in
 * `external/providers/`, which distinguish "not connected", "plan does not
 * cover this", "rate limited" and "no data for this domain" from one another.
 *
 * This wrapper flattens those states back onto the legacy shape the reports
 * render against, under one rule: a value we did not receive stays `null` and
 * `source` becomes "unavailable". Nothing here ever substitutes a zero for an
 * unknown, and nothing falls back to the demo figures.
 *
 * `notes` carries the operator-facing explanation so a screen can say WHY a
 * field is blank instead of showing an unexplained dash.
 */
function liveProvider(): SeoDataProvider {
  const semrush = semrushFromEnv();
  const ahrefs = ahrefsFromEnv();
  const configured = semrush.isConfigured() || ahrefs.isConfigured();
  const name = semrush.isConfigured() ? "semrush" : ahrefs.isConfigured() ? "ahrefs" : "unavailable";

  const blank = (domain: string): DomainMetrics => ({
    domain,
    domainRating: null,
    referringDomains: null,
    backlinks: null,
    source: "unavailable",
  });

  return {
    name,
    async getDomainMetrics(domain) {
      if (!configured) return blank(domain);

      const notes: string[] = [];
      const metrics = blank(domain);

      if (semrush.isConfigured()) {
        const r = await semrush.domainAuthority(domain);
        notes.push(describeResult(r as ProviderResult<unknown>));
        if (r.ok) {
          // Semrush Authority Score is not Ahrefs DR, but it is the same
          // 0..100 authority axis and is labelled by `source`.
          metrics.domainRating = r.data.authorityScore;
          metrics.referringDomains = r.data.referringDomains;
          metrics.backlinks = r.data.backlinks;
          if (r.data.authorityScore !== null || r.data.backlinks !== null) metrics.source = "semrush";
        }
      }

      // Ahrefs is only consulted for a value Semrush could not supply, and the
      // provider itself refuses to call out while the plan gate is closed.
      if (metrics.domainRating === null && ahrefs.isConfigured()) {
        const r = await ahrefs.domainRating(domain);
        notes.push(describeResult(r as ProviderResult<unknown>));
        if (r.ok && r.data.domainRating !== null) {
          metrics.domainRating = r.data.domainRating;
          metrics.source = "ahrefs";
        }
      }

      return { ...metrics, notes };
    },

    async getBacklinks(domain, limit = 25) {
      if (!semrush.isConfigured()) return [];
      const r = await semrush.backlinks(domain, limit);
      if (!r.ok) return [];
      return r.data.slice(0, limit).map((b) => ({
        sourceDomain: hostOf(b.sourceUrl),
        targetUrl: b.targetUrl,
        anchor: b.anchor,
        // Semrush's backlink rows carry no per-link authority figure. A 0
        // here would read as "worthless link", so the unknown stays null.
        domainRating: null,
        firstSeen: b.firstSeen,
        nofollow: b.nofollow,
      }));
    },

    async getSearchConsole() {
      // Search Console needs the website's own OAuth connection, which is not
      // wired yet. Return nothing rather than anything that looks like data.
      return [];
    },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Resolve the provider for the current environment. */
export function getSeoDataProvider(): SeoDataProvider {
  return isDemo() ? demoProvider() : liveProvider();
}
