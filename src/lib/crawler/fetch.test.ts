import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createGuardedFetcher, liveCrawlEnabled } from "./fetch";

describe("guarded fetcher: disabled by default", () => {
  const saved = process.env.SEO_ENABLE_LIVE_CRAWL;
  beforeEach(() => {
    delete process.env.SEO_ENABLE_LIVE_CRAWL;
  });
  afterEach(() => {
    if (saved !== undefined) process.env.SEO_ENABLE_LIVE_CRAWL = saved;
  });

  it("reports live crawl OFF and returns a disabled result (no network)", async () => {
    expect(liveCrawlEnabled()).toBe(false);
    const f = createGuardedFetcher();
    const r = await f.fetch("https://example.com/");
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/live crawl disabled/i);
  });

  it("still returns disabled (not a thrown error) for a would-be-blocked URL", async () => {
    const f = createGuardedFetcher();
    // Even a private URL just returns the disabled result while OFF; the SSRF
    // guard runs only once live crawl is enabled and a real request is made.
    const r = await f.fetch("http://127.0.0.1/");
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/disabled/i);
  });
});
