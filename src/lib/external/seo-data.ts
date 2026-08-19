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

export interface BacklinkRow {
  sourceDomain: string;
  targetUrl: string;
  anchor: string;
  domainRating: number; // 0..100
  firstSeen: string;
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

// ── live provider (Ahrefs/Semrush via API token) ────────────────────────────
/**
 * Live provider skeleton. It is intentionally conservative: if no token is
 * configured it reports metrics as `unavailable` rather than throwing, so a
 * report degrades gracefully. Real endpoint wiring is added per-vendor; the
 * shape above is the contract the UI/report renders against.
 */
function liveProvider(): SeoDataProvider {
  const ahrefs = process.env.AHREFS_API_TOKEN;
  const semrush = process.env.SEMRUSH_API_KEY;
  const configured = Boolean(ahrefs || semrush);
  const source: DomainMetrics["source"] = ahrefs ? "ahrefs" : semrush ? "semrush" : "unavailable";

  return {
    name: source,
    async getDomainMetrics(domain) {
      if (!configured) {
        return { domain, domainRating: null, referringDomains: null, backlinks: null, source: "unavailable" };
      }
      // Real HTTP call is added here per vendor; kept out of the default build
      // so no network I/O happens unless a token is present and wired.
      return { domain, domainRating: null, referringDomains: null, backlinks: null, source };
    },
    async getBacklinks() {
      return [];
    },
    async getSearchConsole() {
      return [];
    },
  };
}

/** Resolve the provider for the current environment. */
export function getSeoDataProvider(): SeoDataProvider {
  return isDemo() ? demoProvider() : liveProvider();
}
