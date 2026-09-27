/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SEO audit engine — derives findings from a completed crawl.
 * ─────────────────────────────────────────────────────────────────────────
 *  Pure functions over a CrawlResult (+ optional sitemap/robots data). Every
 *  finding is labelled by KIND per Section 21 so reports never blur the line
 *  between what was observed and what is advice:
 *
 *    fact           — directly observed (e.g. "page returned 404")
 *    inference      — derived by the system (e.g. "orphan: no inbound links")
 *    recommendation — suggested action (never a ranking guarantee)
 *
 *  Findings are read-only. Nothing here modifies a site.
 */

import type { CrawlResult } from "@/lib/crawler/types";
import { findOrphanPages, findBrokenInternalLinks } from "@/lib/crawler/crawl";
import { normalizeUrl } from "@/lib/crawler/normalize";

export type FindingKind = "fact" | "inference" | "recommendation";
export type Severity = "info" | "low" | "medium" | "high";

export interface Finding {
  code: string;
  kind: FindingKind;
  severity: Severity;
  url: string | null;
  message: string;
}

export interface AuditReport {
  pagesScanned: number;
  pagesDiscovered: number;
  findings: Finding[];
  countsBySeverity: Record<Severity, number>;
}

// ── individual audits ───────────────────────────────────────────────────────

export function auditBrokenInternalLinks(result: CrawlResult): Finding[] {
  return findBrokenInternalLinks(result).map((l) => ({
    code: "broken_internal_link",
    kind: "fact",
    severity: "high",
    url: l.sourceUrl,
    message: `Internal link to ${l.targetUrl} is broken.`,
  }));
}

export function auditOrphanPages(result: CrawlResult): Finding[] {
  return findOrphanPages(result).map((u) => ({
    code: "orphan_page",
    kind: "inference",
    severity: "medium",
    url: u,
    message: "Page has no internal inbound links (orphan).",
  }));
}

/** Pages deeper than `maxClicks` from the start page. */
export function auditClickDepth(result: CrawlResult, maxClicks = 3): Finding[] {
  return result.pages
    .filter((p) => p.depth > maxClicks)
    .map((p) => ({
      code: "click_depth",
      kind: "inference" as const,
      severity: "low" as const,
      url: p.url,
      message: `Page is ${p.depth} clicks from the start (recommended ≤ ${maxClicks}).`,
    }));
}

export function auditMetadata(result: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  const titles = new Map<string, string[]>();
  const descs = new Map<string, string[]>();

  for (const p of result.pages) {
    if (p.status >= 400) continue;
    if (!p.title) {
      findings.push({ code: "missing_title", kind: "fact", severity: "high", url: p.url, message: "Page has no <title>." });
    } else {
      const key = p.title.trim().toLowerCase();
      titles.set(key, [...(titles.get(key) ?? []), p.url]);
      if (p.title.length > 65) {
        findings.push({ code: "title_too_long", kind: "recommendation", severity: "low", url: p.url, message: `Title is ${p.title.length} chars (recommended ≤ 60).` });
      }
    }
    if (!p.metaDescription) {
      findings.push({ code: "missing_meta_description", kind: "fact", severity: "medium", url: p.url, message: "Page has no meta description." });
    } else {
      const key = p.metaDescription.trim().toLowerCase();
      descs.set(key, [...(descs.get(key) ?? []), p.url]);
    }
  }

  for (const [, urls] of titles) {
    if (urls.length > 1) {
      for (const u of urls) findings.push({ code: "duplicate_title", kind: "inference", severity: "medium", url: u, message: `Duplicate <title> shared by ${urls.length} pages.` });
    }
  }
  for (const [, urls] of descs) {
    if (urls.length > 1) {
      for (const u of urls) findings.push({ code: "duplicate_meta_description", kind: "inference", severity: "low", url: u, message: `Duplicate meta description shared by ${urls.length} pages.` });
    }
  }
  return findings;
}

export function auditHeadings(result: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  for (const p of result.pages) {
    if (p.status >= 400) continue;
    if (p.h1Count === 0) {
      findings.push({ code: "missing_h1", kind: "fact", severity: "medium", url: p.url, message: "Page has no H1." });
    } else if (p.h1Count > 1) {
      findings.push({ code: "multiple_h1", kind: "fact", severity: "low", url: p.url, message: `Page has ${p.h1Count} H1s (recommended 1).` });
    }
  }
  return findings;
}

export function auditImageAlt(result: CrawlResult): Finding[] {
  return result.pages
    .filter((p) => p.status < 400 && p.imagesMissingAlt > 0)
    .map((p) => ({
      code: "images_missing_alt",
      kind: "fact" as const,
      severity: "low" as const,
      url: p.url,
      message: `${p.imagesMissingAlt} image(s) missing alt text.`,
    }));
}

export function auditCanonical(result: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  for (const p of result.pages) {
    if (p.status >= 400) continue;
    if (!p.canonical) {
      findings.push({ code: "missing_canonical", kind: "fact", severity: "low", url: p.url, message: "No canonical tag." });
      continue;
    }
    const canon = normalizeUrl(p.canonical);
    const self = normalizeUrl(p.url);
    if (canon && self && canon !== self) {
      findings.push({ code: "non_self_canonical", kind: "inference", severity: "info", url: p.url, message: `Canonical points elsewhere: ${p.canonical}` });
    }
  }
  return findings;
}

export interface SitemapAuditInput {
  /** URLs declared in the sitemap (normalized or raw). */
  sitemapUrls?: string[] | null;
  /** Whether robots.txt was found. */
  robotsFound?: boolean;
}

export function auditSitemap(result: CrawlResult, input: SitemapAuditInput): Finding[] {
  const findings: Finding[] = [];
  if (input.sitemapUrls == null) {
    findings.push({ code: "no_sitemap", kind: "fact", severity: "medium", url: null, message: "No XML sitemap was provided or discovered." });
    return findings;
  }
  const crawled = new Set(result.pages.map((p) => normalizeUrl(p.url)).filter(Boolean) as string[]);
  const inSitemap = new Set(input.sitemapUrls.map((u) => normalizeUrl(u)).filter(Boolean) as string[]);

  for (const u of inSitemap) {
    if (!crawled.has(u)) {
      findings.push({ code: "sitemap_url_not_crawled", kind: "inference", severity: "low", url: u, message: "URL in sitemap was not reached by the crawl." });
    }
  }
  for (const u of crawled) {
    if (!inSitemap.has(u)) {
      findings.push({ code: "page_missing_from_sitemap", kind: "inference", severity: "info", url: u, message: "Crawled page is not listed in the sitemap." });
    }
  }
  return findings;
}

export function auditRobots(input: SitemapAuditInput): Finding[] {
  if (input.robotsFound === false) {
    return [{ code: "no_robots", kind: "fact", severity: "low", url: null, message: "No robots.txt was found." }];
  }
  return [];
}

// ── consolidation ───────────────────────────────────────────────────────────

export interface RunAuditOptions {
  maxClicks?: number;
  sitemap?: SitemapAuditInput;
}

/** Run every audit and consolidate into a single report. */
export function runFullAudit(result: CrawlResult, options: RunAuditOptions = {}): AuditReport {
  const findings: Finding[] = [
    ...auditBrokenInternalLinks(result),
    ...auditOrphanPages(result),
    ...auditClickDepth(result, options.maxClicks ?? 3),
    ...auditMetadata(result),
    ...auditHeadings(result),
    ...auditImageAlt(result),
    ...auditCanonical(result),
    ...(options.sitemap ? auditSitemap(result, options.sitemap) : []),
    ...(options.sitemap ? auditRobots(options.sitemap) : []),
  ];

  const countsBySeverity: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0 };
  for (const f of findings) countsBySeverity[f.severity]++;

  return {
    pagesScanned: result.pagesCrawled,
    pagesDiscovered: result.pagesFound,
    findings,
    countsBySeverity,
  };
}
