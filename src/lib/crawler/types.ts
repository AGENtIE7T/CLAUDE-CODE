/**
 * Crawler types shared across the fetch layer and the crawl engine.
 */

export interface FetchResult {
  url: string; // requested URL
  finalUrl: string; // after redirects
  status: number;
  contentType: string | null;
  body: string; // decoded text (may be empty for non-text)
  bytes: number;
  elapsedMs: number;
  redirectChain: string[];
  error?: string;
}

/**
 * A Fetcher abstracts HTTP so the crawl engine can run against fixtures in
 * tests/demo and against the real SSRF-guarded network fetcher in production.
 */
export interface Fetcher {
  fetch(url: string): Promise<FetchResult>;
}

export interface CrawlPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  depth: number;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  indexable: boolean;
  responseMs: number;
  bytes: number;
  contentHash: string;
  h1Count: number;
  imagesMissingAlt: number;
}

export interface CrawlLink {
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  rel: string | null;
  isInternal: boolean;
}

export interface CrawlResult {
  startUrl: string;
  pagesFound: number;
  pagesCrawled: number;
  pages: CrawlPage[];
  links: CrawlLink[];
  errors: { url: string; error: string }[];
  stoppedReason: "completed" | "page_limit" | "cancelled";
}
