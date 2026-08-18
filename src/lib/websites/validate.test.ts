import { describe, it, expect } from "vitest";
import { validateWebsite, canonicalDomain, defaultDiscoveryUrls } from "./validate";

describe("website validation", () => {
  it("accepts a clean HTTPS site and derives the canonical domain", () => {
    const r = validateWebsite({ name: "Acme", url: "https://www.acme.com" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.canonicalDomain).toBe("acme.com");
      expect(r.warnings).toHaveLength(0);
    }
  });

  it("warns (not errors) on non-HTTPS", () => {
    const r = validateWebsite({ name: "Acme", url: "http://acme.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some((w) => w.field === "url")).toBe(true);
  });

  it("rejects an SSRF-unsafe URL", () => {
    const r = validateWebsite({ name: "x", url: "http://169.254.169.254/" });
    expect(r.ok).toBe(false);
  });

  it("rejects a missing name", () => {
    const r = validateWebsite({ name: "  ", url: "https://acme.com" });
    expect(r.ok).toBe(false);
  });

  it("rejects a sitemap on a different domain", () => {
    const r = validateWebsite({
      name: "Acme",
      url: "https://acme.com",
      sitemapUrl: "https://evil.com/sitemap.xml",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.field === "sitemapUrl")).toBe(true);
  });

  it("accepts same-domain sitemap and robots", () => {
    const r = validateWebsite({
      name: "Acme",
      url: "https://acme.com",
      sitemapUrl: "https://www.acme.com/sitemap.xml",
      robotsUrl: "https://acme.com/robots.txt",
    });
    expect(r.ok).toBe(true);
  });

  it("canonicalDomain strips www; defaults derive from origin", () => {
    expect(canonicalDomain("https://www.Example.com/x")).toBe("example.com");
    expect(defaultDiscoveryUrls("https://acme.com/blog")).toEqual({
      sitemapUrl: "https://acme.com/sitemap.xml",
      robotsUrl: "https://acme.com/robots.txt",
    });
  });
});
