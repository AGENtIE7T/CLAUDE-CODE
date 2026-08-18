/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Crawl engine — scoped, respectful breadth-first crawl.
 * ─────────────────────────────────────────────────────────────────────────
 *  Enforces: max pages, max depth, same-host scope, include/exclude patterns,
 *  robots.txt disallow rules, normalized-URL dedupe (no infinite param loops),
 *  and a cancellation signal. HTTP is injected as a Fetcher, so this runs
 *  against fixtures in tests and demo, and the real SSRF-guarded fetcher in
 *  production (only when live crawl is enabled).
 *
 *  All discovered content is untrusted data — extraction never executes it.
 */

import { createHash } from "node:crypto";
import { normalizeUrl, resolveUrl, sameHost } from "@/lib/crawler/normalize";
import { extractPage } from "@/lib/crawler/extract";
import { parseRobots, isPathAllowedByRobots, type RobotsRules } from "@/lib/websites/discovery";
import type { CrawlLink, CrawlPage, CrawlResult, Fetcher } from "@/lib/crawler/types";

export interface CrawlOptions {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  /** robots.txt body, if fetched by the caller; null = no restrictions. */
  robotsTxt?: string | null;
  /** Honour robots.txt disallow rules (default true). */
  respectRobots?: boolean;
  /** Cancellation hook checked between fetches. */
  isCancelled?: () => boolean;
}

const DEFAULTS = { maxPages: 200, maxDepth: 5, respectRobots: true };

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    // Treat a pattern as a substring match on the path unless it's a glob.
    if (p.includes("*")) {
      const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
      return re.test(path);
    }
    return path.includes(p);
  });
}

function inScope(url: string, include: string[], exclude: string[]): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (exclude.length > 0 && matchesAny(path, exclude)) return false;
  if (include.length > 0 && !matchesAny(path, include)) return false;
  return true;
}

export function hashContent(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/** Run a crawl. Deterministic given a deterministic fetcher (fixtures). */
export async function crawlSite(opts: CrawlOptions, fetcher: Fetcher): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? DEFAULTS.maxPages;
  const maxDepth = opts.maxDepth ?? DEFAULTS.maxDepth;
  const include = opts.includePatterns ?? [];
  const exclude = opts.excludePatterns ?? [];
  const respectRobots = opts.respectRobots ?? DEFAULTS.respectRobots;

  const robots: RobotsRules | null =
    respectRobots && opts.robotsTxt ? parseRobots(opts.robotsTxt) : null;

  const startNorm = normalizeUrl(opts.startUrl);
  if (!startNorm) {
    return {
      startUrl: opts.startUrl, pagesFound: 0, pagesCrawled: 0, pages: [], links: [],
      errors: [{ url: opts.startUrl, error: "invalid start URL" }], stoppedReason: "completed",
    };
  }

  const seen = new Set<string>([startNorm]);
  const queue: { url: string; depth: number }[] = [{ url: startNorm, depth: 0 }];
  const pages: CrawlPage[] = [];
  const links: CrawlLink[] = [];
  const errors: { url: string; error: string }[] = [];
  let stoppedReason: CrawlResult["stoppedReason"] = "completed";

  while (queue.length > 0) {
    if (opts.isCancelled?.()) {
      stoppedReason = "cancelled";
      break;
    }
    if (pages.length >= maxPages) {
      stoppedReason = "page_limit";
      break;
    }

    const { url, depth } = queue.shift()!;

    // robots.txt check.
    if (robots) {
      const path = new URL(url).pathname;
      if (!isPathAllowedByRobots(path, robots)) {
        errors.push({ url, error: "blocked by robots.txt" });
        continue;
      }
    }

    const res = await fetcher.fetch(url);
    if (res.error || res.status === 0) {
      errors.push({ url, error: res.error ?? `status ${res.status}` });
      continue;
    }

    const isHtml = (res.contentType ?? "").includes("html") || res.body.trimStart().startsWith("<");
    const extracted = isHtml
      ? extractPage(res.body)
      : {
          title: null, metaDescription: null, canonical: null, robotsMeta: [],
          indexable: true, h1: [], headings: [], links: [], images: [],
        };

    pages.push({
      url,
      finalUrl: res.finalUrl,
      status: res.status,
      contentType: res.contentType,
      depth,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      canonical: extracted.canonical,
      indexable: extracted.indexable,
      responseMs: res.elapsedMs,
      bytes: res.bytes,
      contentHash: hashContent(res.body),
      h1Count: extracted.h1.length,
      imagesMissingAlt: extracted.images.filter((i) => !i.alt || i.alt.trim() === "").length,
    });

    // Record links and enqueue in-scope internal ones.
    for (const link of extracted.links) {
      const abs = resolveUrl(link.href, res.finalUrl);
      if (!abs) continue;
      const internal = sameHost(abs, startNorm);
      links.push({
        sourceUrl: url,
        targetUrl: abs,
        anchor: link.anchor,
        rel: link.rel,
        isInternal: internal,
      });

      if (!internal) continue;
      const norm = normalizeUrl(abs, { stripParams: [] });
      if (!norm || seen.has(norm)) continue;
      if (depth + 1 > maxDepth) continue;
      if (!inScope(norm, include, exclude)) continue;
      seen.add(norm);
      queue.push({ url: norm, depth: depth + 1 });
    }
  }

  return {
    startUrl: startNorm,
    pagesFound: seen.size,
    pagesCrawled: pages.length,
    pages,
    links,
    errors,
    stoppedReason,
  };
}

// ── analyses derived from a completed crawl (feed Phase 4 audits) ───────────

/** Pages with no internal inbound links (excluding the start page). */
export function findOrphanPages(result: CrawlResult): string[] {
  const inbound = new Set<string>();
  for (const l of result.links) {
    if (l.isInternal) {
      const n = normalizeUrl(l.targetUrl);
      if (n) inbound.add(n);
    }
  }
  return result.pages
    .map((p) => p.url)
    .filter((u) => u !== result.startUrl && !inbound.has(u));
}

/** Internal links whose target returned a 4xx/5xx (broken internal links). */
export function findBrokenInternalLinks(result: CrawlResult): CrawlLink[] {
  const status = new Map<string, number>();
  for (const p of result.pages) status.set(p.url, p.status);
  return result.links.filter((l) => {
    if (!l.isInternal) return false;
    const n = normalizeUrl(l.targetUrl);
    const s = n ? status.get(n) : undefined;
    return s !== undefined && s >= 400;
  });
}
