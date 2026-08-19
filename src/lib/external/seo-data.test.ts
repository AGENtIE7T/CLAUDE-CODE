import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSeoDataProvider } from "./seo-data";

describe("seo-data provider", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedTokens = { a: process.env.AHREFS_API_TOKEN, s: process.env.SEMRUSH_API_KEY };
  afterEach(() => {
    if (saved) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
    process.env.AHREFS_API_TOKEN = savedTokens.a;
    process.env.SEMRUSH_API_KEY = savedTokens.s;
  });

  describe("demo mode", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_DEMO_MODE;
    });

    it("returns seeded, clearly-synthetic metrics/backlinks/GSC data", async () => {
      const p = getSeoDataProvider();
      expect(p.name).toBe("demo");
      const m = await p.getDomainMetrics("acme.example");
      expect(m.source).toBe("demo");
      expect(m.domainRating).toBeGreaterThan(0);
      expect((await p.getBacklinks("acme.example")).length).toBeGreaterThan(0);
      expect((await p.getSearchConsole("acme.example"))[0].query).toBeTruthy();
    });

    it("honours the limit argument", async () => {
      const p = getSeoDataProvider();
      expect(await p.getBacklinks("acme.example", 1)).toHaveLength(1);
    });
  });

  describe("live mode without tokens", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      delete process.env.NEXT_PUBLIC_DEMO_MODE;
      delete process.env.AHREFS_API_TOKEN;
      delete process.env.SEMRUSH_API_KEY;
    });

    it("degrades gracefully to 'unavailable' rather than fabricating data", async () => {
      const p = getSeoDataProvider();
      const m = await p.getDomainMetrics("acme.example");
      expect(m.source).toBe("unavailable");
      expect(m.domainRating).toBeNull();
    });
  });
});
