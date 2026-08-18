import { describe, it, expect } from "vitest";
import { crawlSite } from "@/lib/crawler/crawl";
import { fixtureFetcher, FIXTURE_HOST } from "@/lib/crawler/fixtures";
import {
  runFullAudit,
  auditMetadata,
  auditBrokenInternalLinks,
  auditClickDepth,
  auditCanonical,
  auditSitemap,
} from "./audit";
import type { CrawlResult } from "@/lib/crawler/types";

async function crawl(): Promise<CrawlResult> {
  return crawlSite({ startUrl: `${FIXTURE_HOST}/` }, fixtureFetcher());
}

describe("audit engine", () => {
  it("detects the broken internal link as a high-severity fact", async () => {
    const r = await crawl();
    const f = auditBrokenInternalLinks(r);
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].severity).toBe("high");
    expect(f[0].kind).toBe("fact");
  });

  it("flags duplicate meta descriptions (blog + services share 'Dup')", async () => {
    const r = await crawl();
    const f = auditMetadata(r);
    expect(f.some((x) => x.code === "duplicate_meta_description")).toBe(true);
  });

  it("labels findings by kind (fact/inference/recommendation)", async () => {
    const r = await crawl();
    const report = runFullAudit(r);
    const kinds = new Set(report.findings.map((f) => f.kind));
    expect(kinds.has("fact")).toBe(true);
    // counts add up
    const total = Object.values(report.countsBySeverity).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.findings.length);
  });

  it("click-depth audit respects the threshold", async () => {
    const r = await crawl();
    // Fixture is shallow, so nothing beyond depth 3.
    expect(auditClickDepth(r, 3)).toEqual([]);
    // With threshold 0, every non-home page is flagged.
    expect(auditClickDepth(r, 0).length).toBeGreaterThan(0);
  });

  it("canonical audit reports missing canonicals as facts", async () => {
    const r = await crawl();
    const f = auditCanonical(r);
    expect(f.every((x) => ["missing_canonical", "non_self_canonical"].includes(x.code))).toBe(true);
    expect(f.some((x) => x.code === "missing_canonical")).toBe(true);
  });

  it("sitemap audit flags a missing sitemap and mismatches", async () => {
    const r = await crawl();
    const none = auditSitemap(r, { sitemapUrls: null });
    expect(none[0].code).toBe("no_sitemap");

    const partial = auditSitemap(r, { sitemapUrls: [`${FIXTURE_HOST}/`, `${FIXTURE_HOST}/not-crawled`] });
    expect(partial.some((x) => x.code === "sitemap_url_not_crawled")).toBe(true);
    expect(partial.some((x) => x.code === "page_missing_from_sitemap")).toBe(true);
  });

  it("full audit report includes scan counts", async () => {
    const r = await crawl();
    const report = runFullAudit(r, { sitemap: { sitemapUrls: null, robotsFound: false } });
    expect(report.pagesScanned).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.code === "no_sitemap")).toBe(true);
    expect(report.findings.some((f) => f.code === "no_robots")).toBe(true);
  });
});
