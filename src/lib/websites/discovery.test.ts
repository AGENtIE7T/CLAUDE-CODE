import { describe, it, expect } from "vitest";
import { parseRobots, isPathAllowedByRobots, parseSitemap, CRAWLER_UA } from "./discovery";

const ROBOTS = `
# comment
User-agent: *
Disallow: /admin/
Disallow: /cart
Allow: /admin/public
Sitemap: https://acme.com/sitemap.xml
Crawl-delay: 2

User-agent: ${CRAWLER_UA}
Disallow: /private/
`;

describe("robots parsing", () => {
  it("extracts sitemaps, disallow/allow, and crawl-delay", () => {
    const r = parseRobots(ROBOTS);
    expect(r.sitemaps).toContain("https://acme.com/sitemap.xml");
    expect(r.disallow).toContain("/admin/");
    expect(r.disallow).toContain("/private/"); // our UA group unioned in
    expect(r.allow).toContain("/admin/public");
    expect(r.crawlDelay).toBe(2);
  });

  it("respects longest-match allow over disallow", () => {
    const r = parseRobots(ROBOTS);
    expect(isPathAllowedByRobots("/admin/secret", r)).toBe(false);
    expect(isPathAllowedByRobots("/admin/public", r)).toBe(true);
    expect(isPathAllowedByRobots("/blog/post", r)).toBe(true);
    expect(isPathAllowedByRobots("/private/x", r)).toBe(false);
  });

  it("allows everything when robots is empty", () => {
    const r = parseRobots("");
    expect(isPathAllowedByRobots("/anything", r)).toBe(true);
  });
});

describe("sitemap parsing", () => {
  it("parses a urlset with lastmod and decodes entities", () => {
    const xml = `<?xml version="1.0"?>
      <urlset><url><loc>https://acme.com/?a=1&amp;b=2</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://acme.com/blog</loc></url></urlset>`;
    const { urls, isIndex } = parseSitemap(xml);
    expect(isIndex).toBe(false);
    expect(urls).toHaveLength(2);
    expect(urls[0].loc).toBe("https://acme.com/?a=1&b=2");
    expect(urls[0].lastmod).toBe("2026-01-01");
    expect(urls[1].lastmod).toBeNull();
  });

  it("parses a sitemap index into child refs", () => {
    const xml = `<sitemapindex><sitemap><loc>https://acme.com/s1.xml</loc></sitemap>
      <sitemap><loc>https://acme.com/s2.xml</loc></sitemap></sitemapindex>`;
    const { sitemapRefs, isIndex, urls } = parseSitemap(xml);
    expect(isIndex).toBe(true);
    expect(sitemapRefs).toEqual(["https://acme.com/s1.xml", "https://acme.com/s2.xml"]);
    expect(urls).toHaveLength(0);
  });
});
