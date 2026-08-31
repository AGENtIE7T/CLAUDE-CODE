import { describe, it, expect, beforeEach } from "vitest";
import { createBreaker, COOLDOWN_MS } from "./circuit";
import { describeResult, unavailable } from "./state";
import {
  createSemrushProvider,
  parseSemrushCsv,
  parseSemrushError,
  type SemrushProvider,
} from "./semrush";
import { createAhrefsProvider } from "./ahrefs";

const KEY = "semrush-secret-key-abc123";
const TOKEN = "ahrefs-secret-token-xyz789";

/** A fetch stub that records every URL it was asked for. */
function stubFetch(handler: (url: string) => { status?: number; body: string; headers?: Record<string, string> }) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = handler(url);
    return new Response(r.body, { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** Movable clock. */
function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

// ── parsing ────────────────────────────────────────────────────────────────

describe("semrush parsing", () => {
  it("parses semicolon CSV with a header row", () => {
    const rows = parseSemrushCsv("Dn;Rk;Or\nacme.com;1234;567\n");
    expect(rows).toEqual([{ Dn: "acme.com", Rk: "1234", Or: "567" }]);
  });

  it("returns no rows for a header-only response", () => {
    expect(parseSemrushCsv("Dn;Rk\n")).toEqual([]);
  });

  it("recognises the error-in-a-200-body convention", () => {
    expect(parseSemrushError("ERROR 120 :: WRONG KEY")).toEqual({ code: 120, text: "WRONG KEY" });
    expect(parseSemrushError("Dn;Rk\nacme.com;1")).toBeNull();
  });
});

// ── circuit breaker ────────────────────────────────────────────────────────

describe("circuit breaker", () => {
  it("opens on a trip and closes once the cooldown elapses", () => {
    const c = clock();
    const b = createBreaker("ahrefs", c.now);
    expect(b.isOpen()).toBe(false);

    b.trip("plan_insufficient", "plan does not include this", 1000);
    expect(b.isOpen()).toBe(true);
    expect(b.retryAfterMs()).toBe(1000);
    expect(b.openReason()?.reason).toBe("plan_insufficient");

    c.advance(999);
    expect(b.isOpen()).toBe(true);
    c.advance(1);
    expect(b.isOpen()).toBe(false);
    expect(b.openReason()).toBeNull();
  });

  it("never shortens an existing longer suppression", () => {
    const c = clock();
    const b = createBreaker("ahrefs", c.now);
    b.trip("plan_insufficient", "long", 60_000);
    b.trip("network", "short", 100);
    expect(b.retryAfterMs()).toBe(60_000);
    expect(b.openReason()?.message).toBe("long");
  });

  it("reset clears it immediately", () => {
    const b = createBreaker("semrush", clock().now);
    b.trip("unauthorized", "bad key", 60_000);
    b.reset();
    expect(b.isOpen()).toBe(false);
  });

  it("treats a plan restriction as far more permanent than a rate limit", () => {
    expect(COOLDOWN_MS.plan_insufficient!).toBeGreaterThan(COOLDOWN_MS.rate_limited! * 100);
  });
});

// ── semrush provider ───────────────────────────────────────────────────────

describe("semrush provider", () => {
  const RANKS = "Dn;Rk;Or;Ot\nacme.com;1500;820;19400\n";
  const LINKS = "ascore;total;domains_num\n47;9120;318\n";

  function provider(
    handler: Parameters<typeof stubFetch>[0],
    over: Partial<Parameters<typeof createSemrushProvider>[0]> = {},
  ): { p: SemrushProvider; calls: string[] } {
    const { impl, calls } = stubFetch(handler);
    const c = clock();
    return {
      p: createSemrushProvider({ apiKey: KEY, fetchImpl: impl, now: c.now, ...over }),
      calls,
    };
  }

  const bothOk = (url: string) => ({ body: url.includes("backlinks_overview") ? LINKS : RANKS });

  it("reports not_configured — and makes no request — without a key", async () => {
    const { p, calls } = provider(bothOk, { apiKey: null });
    expect(p.isConfigured()).toBe(false);
    const r = await p.domainAuthority("acme.com");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.reason).toBe("not_configured");
      expect(r.error.retryable).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("returns a complete authority record when both reports succeed", async () => {
    const { p } = provider(bothOk);
    const r = await p.domainAuthority("acme.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      authorityScore: 47,
      backlinks: 9120,
      referringDomains: 318,
      organicKeywords: 820,
      organicTraffic: 19400,
    });
    expect(r.partial).toEqual([]);
    expect(r.data.missing).toEqual([]);
    expect(describeResult(r)).toBe("semrush: ok");
  });

  it("returns a PARTIAL answer when one of the two reports fails", async () => {
    const { p } = provider((url) =>
      url.includes("backlinks_overview")
        ? { body: "ERROR 135 :: API REPORT TYPE IS NOT SUPPORTED BY YOUR SUBSCRIPTION" }
        : { body: RANKS },
    );
    const r = await p.domainAuthority("acme.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The half that worked is still returned...
    expect(r.data.organicKeywords).toBe(820);
    // ...and the half that did not is null, not zero, and is explained.
    expect(r.data.authorityScore).toBeNull();
    expect(r.data.backlinks).toBeNull();
    expect(r.partial).toHaveLength(1);
    expect(r.partial[0]).toMatchObject({ report: "backlinks_overview", reason: "plan_insufficient" });
    expect(r.data.missing.map((m) => m.field)).toContain("authorityScore");
    expect(describeResult(r)).toContain("partial");
  });

  it("fails outright when both reports fail, rather than reporting all-nulls as success", async () => {
    const { p } = provider(() => ({ body: "ERROR 120 :: WRONG KEY" }));
    const r = await p.domainAuthority("acme.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("unauthorized");
  });

  it("treats NOTHING FOUND as a real answer with nulls, never as zeros", async () => {
    const { p } = provider(() => ({ body: "ERROR 50 :: NOTHING FOUND" }));
    const r = await p.domainAuthority("brand-new-domain.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.backlinks).toBeNull();
    expect(r.data.backlinks).not.toBe(0);
    expect(r.data.missing.length).toBeGreaterThan(0);
  });

  it("stops calling after an unauthorized response and reports circuit_open", async () => {
    const { p, calls } = provider(() => ({ body: "ERROR 120 :: WRONG KEY" }));
    await p.domainAuthority("acme.com");
    const before = calls.length;

    const second = await p.backlinks("acme.com");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.reason).toBe("circuit_open");
    expect(calls.length).toBe(before); // no further network I/O
  });

  it("maps a 429 to rate_limited with the server's retry delay", async () => {
    const { p } = provider(() => ({ status: 429, body: "", headers: { "retry-after": "30" } }));
    const r = await p.backlinks("acme.com");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.reason).toBe("rate_limited");
      expect(r.error.retryAfterMs).toBe(30_000);
      expect(r.error.retryable).toBe(true);
    }
  });

  it("parses backlink rows and does not invent a first-seen date", async () => {
    const { p } = provider(() => ({
      body:
        "source_url;target_url;anchor;nofollow;first_seen\n" +
        "https://news.example/a;https://acme.com/;acme roofing;false;2026-01-04\n" +
        "https://dir.example/b;https://acme.com/;acme;true;0\n",
    }));
    const r = await p.backlinks("acme.com", 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toMatchObject({ anchor: "acme roofing", nofollow: false, firstSeen: "2026-01-04" });
    expect(r.data[1].nofollow).toBe(true);
    expect(r.data[1].firstSeen).toBeNull();
  });

  it("never leaks the API key into an error message", async () => {
    const { p } = provider(() => ({ body: `ERROR 120 :: WRONG KEY for ${KEY}` }));
    const r = await p.domainAuthority("acme.com");
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(JSON.stringify(r)).toContain("[redacted]");
  });
});

// ── ahrefs provider ────────────────────────────────────────────────────────

describe("ahrefs provider: plan gate", () => {
  const PLAN_BODY = JSON.stringify({ error: "Insufficient plan for this endpoint" });

  it("stops calling Ahrefs entirely once the plan is known to be insufficient", async () => {
    const { impl, calls } = stubFetch(() => ({ status: 403, body: PLAN_BODY }));
    const c = clock();
    const p = createAhrefsProvider({ token: TOKEN, fetchImpl: impl, now: c.now });

    const first = await p.domainRating("acme.com");
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.reason).toBe("plan_insufficient");
    expect(calls).toHaveLength(1);

    // Ten more attempts must cost zero requests.
    for (let i = 0; i < 10; i++) {
      const r = await p.domainRating("acme.com");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.reason).toBe("circuit_open");
    }
    expect(calls).toHaveLength(1);
    expect(p.isSuppressed()).toBe(true);
    expect(p.suppressionReason()).toMatch(/plan/i);
  });

  it("keeps the suppression for a full day, not a few seconds", async () => {
    const { impl, calls } = stubFetch(() => ({ status: 403, body: PLAN_BODY }));
    const c = clock();
    const p = createAhrefsProvider({ token: TOKEN, fetchImpl: impl, now: c.now });
    await p.domainRating("acme.com");

    c.advance(6 * 60 * 60 * 1000); // 6 hours
    await p.domainRating("acme.com");
    expect(calls).toHaveLength(1);

    c.advance(19 * 60 * 60 * 1000); // past 24h in total
    await p.domainRating("acme.com");
    expect(calls).toHaveLength(2);
  });

  it("reconnect() clears the suppression immediately for an upgraded account", async () => {
    let body = PLAN_BODY;
    let status = 403;
    const { impl } = stubFetch(() => ({ status, body }));
    const p = createAhrefsProvider({ token: TOKEN, fetchImpl: impl, now: clock().now });
    await p.domainRating("acme.com");
    expect(p.isSuppressed()).toBe(true);

    status = 200;
    body = JSON.stringify({ domain_rating: { domain_rating: 61 } });
    p.reconnect();
    const r = await p.domainRating("acme.com");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.domainRating).toBe(61);
  });

  it("reports a missing rating as null with a reason, never as 0", async () => {
    const { impl } = stubFetch(() => ({ body: JSON.stringify({}) }));
    const p = createAhrefsProvider({ token: TOKEN, fetchImpl: impl, now: clock().now });
    const r = await p.domainRating("acme.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.domainRating).toBeNull();
    expect(r.data.missing[0].field).toBe("domainRating");
  });

  it("makes no request at all without a token", async () => {
    const { impl, calls } = stubFetch(() => ({ body: "{}" }));
    const p = createAhrefsProvider({ token: null, fetchImpl: impl });
    const r = await p.domainRating("acme.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });

  it("never leaks the token", async () => {
    const { impl } = stubFetch(() => {
      throw new Error(`connect failed with Bearer ${TOKEN}`);
    });
    const p = createAhrefsProvider({ token: TOKEN, fetchImpl: impl, now: clock().now });
    const r = await p.domainRating("acme.com");
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
});

describe("state helpers", () => {
  it("marks structural failures non-retryable and transient ones retryable", () => {
    expect(unavailable("semrush", "unauthorized", "x").retryable).toBe(false);
    expect(unavailable("semrush", "plan_insufficient", "x").retryable).toBe(false);
    expect(unavailable("semrush", "not_configured", "x").retryable).toBe(false);
    expect(unavailable("semrush", "rate_limited", "x").retryable).toBe(true);
    expect(unavailable("semrush", "network", "x").retryable).toBe(true);
  });
});
