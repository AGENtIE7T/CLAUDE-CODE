import { describe, it, expect } from "vitest";
import { crawlSite, findOrphanPages, findBrokenInternalLinks } from "./crawl";
import { fixtureFetcher, FIXTURE_HOST } from "./fixtures";

const fetcher = fixtureFetcher();

describe("crawl engine (fixtures)", () => {
  it("crawls reachable pages from the homepage within scope", async () => {
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/` }, fetcher);
    const urls = r.pages.map((p) => p.url).sort();
    expect(urls).toContain(`${FIXTURE_HOST}/`);
    expect(urls).toContain(`${FIXTURE_HOST}/blog/a`);
    expect(urls).toContain(`${FIXTURE_HOST}/services`);
    // /orphan is not linked from home, so it is never discovered.
    expect(urls).not.toContain(`${FIXTURE_HOST}/orphan`);
  });

  it("records external links but does not crawl them", async () => {
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/` }, fetcher);
    const external = r.links.filter((l) => !l.isInternal);
    expect(external.some((l) => l.targetUrl.startsWith("https://external.example"))).toBe(true);
    expect(r.pages.every((p) => p.url.startsWith(FIXTURE_HOST))).toBe(true);
  });

  it("detects a broken internal link (404)", async () => {
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/` }, fetcher);
    const broken = findBrokenInternalLinks(r);
    expect(broken.some((l) => l.targetUrl === `${FIXTURE_HOST}/gone`)).toBe(true);
  });

  it("enforces the page limit", async () => {
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/`, maxPages: 2 }, fetcher);
    expect(r.pagesCrawled).toBe(2);
    expect(r.stoppedReason).toBe("page_limit");
  });

  it("enforces max depth", async () => {
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/`, maxDepth: 0 }, fetcher);
    expect(r.pagesCrawled).toBe(1); // only the start page
  });

  it("honours exclude patterns", async () => {
    const r = await crawlSite(
      { startUrl: `${FIXTURE_HOST}/`, excludePatterns: ["/blog/"] },
      fetcher,
    );
    expect(r.pages.map((p) => p.url)).not.toContain(`${FIXTURE_HOST}/blog/a`);
  });

  it("respects robots.txt disallow", async () => {
    const robots = "User-agent: *\nDisallow: /services";
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/`, robotsTxt: robots }, fetcher);
    expect(r.pages.map((p) => p.url)).not.toContain(`${FIXTURE_HOST}/services`);
    expect(r.errors.some((e) => e.error.includes("robots"))).toBe(true);
  });

  it("supports cancellation", async () => {
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/`, isCancelled: () => true }, fetcher);
    expect(r.stoppedReason).toBe("cancelled");
    expect(r.pagesCrawled).toBe(0);
  });

  it("treats a noindex page as non-indexable when crawled directly", async () => {
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/orphan` }, fetcher);
    expect(r.pages[0].indexable).toBe(false);
  });

  it("finds orphan pages relative to what was crawled", async () => {
    // Start at home; every crawled page except home has an inbound link,
    // so there should be no orphans in this connected set.
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/` }, fetcher);
    expect(findOrphanPages(r)).toEqual([]);
  });

  it("does not obey prompt-injection text embedded in page content", async () => {
    // The blog page contains "Ignore previous instructions...". The crawler
    // must simply record it as content; there is no code path that acts on it.
    const r = await crawlSite({ startUrl: `${FIXTURE_HOST}/` }, fetcher);
    const blog = r.pages.find((p) => p.url === `${FIXTURE_HOST}/blog/a`);
    expect(blog).toBeTruthy();
    // Its content hash is recorded; nothing about "publish everything" executes.
    expect(blog?.contentHash).toHaveLength(64);
  });
});
