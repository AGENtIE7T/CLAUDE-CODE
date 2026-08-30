/**
 * Connection resolution is the one place a real website can be reached, so the
 * rules about WHEN it resolves to a real site are worth pinning down. Two of
 * these tests exist because the alternative behaviour would have written to a
 * live staging site.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConnection, __resetMockWordPress } from "./resolve";

const KEYS = [
  "WORDPRESS_BASE_URL",
  "WORDPRESS_USERNAME",
  "WORDPRESS_APP_PASSWORD",
  "WORDPRESS_ENVIRONMENT",
  "WORDPRESS_ACCESS",
  "WORDPRESS_USE_MOCK",
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

const saved: Record<string, string | undefined> = {};

function set(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
}

const REAL = {
  WORDPRESS_BASE_URL: "https://staging.example.com",
  WORDPRESS_USERNAME: "seo-automation",
  WORDPRESS_APP_PASSWORD: "abcd EFGH ijkl MNOP",
  WORDPRESS_ENVIRONMENT: "staging",
  WORDPRESS_ACCESS: "read_only",
} as const;

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  __resetMockWordPress();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("connection resolution", () => {
  it("resolves a real connection from complete credentials", () => {
    set(REAL);
    const r = resolveConnection();
    expect(r.kind).toBe("real");
    expect(r.connection?.isMock).toBe(false);
    expect(r.connection?.environment).toBe("staging");
    expect(r.connection?.capabilities.write).toBe(false); // read_only
  });

  it("honours read_write when it is set explicitly", () => {
    set({ ...REAL, WORDPRESS_ACCESS: "read_write" });
    expect(resolveConnection().connection?.capabilities.write).toBe(true);
  });

  it("defaults to read-only when WORDPRESS_ACCESS is absent or misspelled", () => {
    set({ ...REAL, WORDPRESS_ACCESS: "readwrite" });
    expect(resolveConnection().connection?.capabilities.write).toBe(false);
  });

  it("WORDPRESS_USE_MOCK=1 wins over real credentials, so it can never reach a live site", () => {
    set({ ...REAL, WORDPRESS_USE_MOCK: "1" });
    const r = resolveConnection();
    expect(r.kind).toBe("mock");
    expect(r.connection?.isMock).toBe(true);
    // And nothing about the real site leaks into the description.
    expect(r.description).not.toContain("staging.example.com");
  });

  it("demo mode alone does NOT force the mock — demo plus real credentials is a real connection", () => {
    set({ ...REAL, NEXT_PUBLIC_DEMO_MODE: "1" });
    expect(resolveConnection().kind).toBe("real");
  });

  it("falls back to the fixture in demo mode when no credentials are configured", () => {
    set({ NEXT_PUBLIC_DEMO_MODE: "1" });
    const r = resolveConnection();
    expect(r.kind).toBe("mock");
    expect(r.connection?.isMock).toBe(true);
  });

  it("reports no connection when credentials are incomplete and the mock was not asked for", () => {
    set({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      WORDPRESS_BASE_URL: REAL.WORDPRESS_BASE_URL,
      WORDPRESS_USERNAME: REAL.WORDPRESS_USERNAME,
      // password missing
    });
    const r = resolveConnection();
    expect(r.kind).toBe("none");
    expect(r.connection).toBeNull();
  });

  it("never exposes the Application Password on the resolved connection", () => {
    set(REAL);
    const r = resolveConnection();
    const serialised = JSON.stringify(r) + Object.values(r.connection ?? {}).join(" ");
    expect(serialised).not.toContain(REAL.WORDPRESS_APP_PASSWORD);
    expect(serialised).not.toContain(
      Buffer.from(`${REAL.WORDPRESS_USERNAME}:${REAL.WORDPRESS_APP_PASSWORD}`).toString("base64"),
    );
  });
});

describe("the browser suite cannot reach a real website", () => {
  it("blanks every real-connection variable for its server", async () => {
    const config = (await import("../../../playwright.config")).default;
    const env = config.webServer && !Array.isArray(config.webServer) ? config.webServer.env : undefined;
    expect(env).toBeDefined();
    // If a developer has staging credentials in .env.local, `next start` would
    // otherwise inherit them — and this suite approves and applies a link.
    expect(env?.WORDPRESS_BASE_URL).toBe("");
    expect(env?.WORDPRESS_USERNAME).toBe("");
    expect(env?.WORDPRESS_APP_PASSWORD).toBe("");
    expect(env?.WORDPRESS_USE_MOCK).toBe("1");
    expect(env?.SEO_ENABLE_PRODUCTION_WRITES).toBe("0");
  });
});
