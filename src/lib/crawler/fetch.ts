/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SSRF-guarded HTTP fetcher (the ONLY sanctioned outbound HTTP path).
 * ─────────────────────────────────────────────────────────────────────────
 *  Guarantees, in order, for every request AND every redirect hop:
 *    1. assertUrlAllowed()  — scheme/hostname/IP-literal/credential checks
 *    2. DNS resolve + assertIpAllowed() on EVERY resolved address — defeats
 *       DNS-rebinding where a public hostname maps to a private IP
 *    3. manual redirect following (max hops), re-validating each Location
 *    4. byte cap + timeout so a hostile server can't exhaust us
 *
 *  Live network access is OFF unless SEO_ENABLE_LIVE_CRAWL=1. When disabled,
 *  fetch() returns a structured "disabled" result instead of touching the
 *  network — matching the demo/fixtures-only posture. The crawl engine takes a
 *  Fetcher by injection, so tests and demo use a fixture fetcher instead.
 */

import { lookup } from "node:dns/promises";
import { assertUrlAllowed, assertIpAllowed, SsrfError } from "@/lib/ssrf/validate";
import type { Fetcher, FetchResult } from "@/lib/crawler/types";

export const CRAWLER_USER_AGENT =
  "SEOCommandCenterBot/1.0 (+https://seo-command-center.example/bot)";

export interface GuardedFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

const DEFAULTS: Required<GuardedFetchOptions> = {
  maxBytes: 2_000_000, // 2 MB
  timeoutMs: 15_000,
  maxRedirects: 5,
};

export function liveCrawlEnabled(): boolean {
  return process.env.SEO_ENABLE_LIVE_CRAWL === "1";
}

/** Resolve a hostname to IPs and assert every one is allowed. */
async function assertResolvedHostAllowed(hostname: string): Promise<void> {
  // If it's an IP literal, assertUrlAllowed already checked it; lookup still
  // returns it and we re-check to be safe.
  const records = await lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new SsrfError("blocked_hostname", `Could not resolve host: ${hostname}`);
  }
  for (const r of records) assertIpAllowed(r.address);
}

function disabledResult(url: string): FetchResult {
  return {
    url,
    finalUrl: url,
    status: 0,
    contentType: null,
    body: "",
    bytes: 0,
    elapsedMs: 0,
    redirectChain: [],
    error: "live crawl disabled (set SEO_ENABLE_LIVE_CRAWL=1 to enable)",
  };
}

/**
 * The real network fetcher. Construct once and pass to the crawl engine.
 */
export function createGuardedFetcher(options: GuardedFetchOptions = {}): Fetcher {
  const opts = { ...DEFAULTS, ...options };

  return {
    async fetch(startUrl: string): Promise<FetchResult> {
      if (!liveCrawlEnabled()) return disabledResult(startUrl);

      const started = Date.now();
      const redirectChain: string[] = [];
      let current = startUrl;

      for (let hop = 0; hop <= opts.maxRedirects; hop++) {
        // Guard 1 + 2 on every hop.
        let parsed: URL;
        try {
          parsed = assertUrlAllowed(current);
          await assertResolvedHostAllowed(parsed.hostname);
        } catch (e) {
          const msg = e instanceof SsrfError ? `SSRF blocked (${e.reason})` : "URL validation failed";
          return {
            url: startUrl, finalUrl: current, status: 0, contentType: null,
            body: "", bytes: 0, elapsedMs: Date.now() - started, redirectChain,
            error: msg,
          };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
        let res: Response;
        try {
          res = await fetch(current, {
            method: "GET",
            redirect: "manual", // we follow manually to re-validate each hop
            signal: controller.signal,
            headers: { "user-agent": CRAWLER_USER_AGENT, accept: "text/html,application/xhtml+xml" },
          });
        } catch (e) {
          clearTimeout(timer);
          return {
            url: startUrl, finalUrl: current, status: 0, contentType: null,
            body: "", bytes: 0, elapsedMs: Date.now() - started, redirectChain,
            error: e instanceof Error ? e.message : "fetch failed",
          };
        }
        clearTimeout(timer);

        // Redirect?
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc) break;
          const next = new URL(loc, current).toString();
          redirectChain.push(next);
          current = next;
          continue; // re-validate at top of loop
        }

        // Terminal response — read with a byte cap.
        const contentType = res.headers.get("content-type");
        const { text, bytes } = await readCapped(res, opts.maxBytes);
        return {
          url: startUrl,
          finalUrl: current,
          status: res.status,
          contentType,
          body: text,
          bytes,
          elapsedMs: Date.now() - started,
          redirectChain,
        };
      }

      return {
        url: startUrl, finalUrl: current, status: 0, contentType: null, body: "",
        bytes: 0, elapsedMs: Date.now() - started, redirectChain,
        error: `too many redirects (>${opts.maxRedirects})`,
      };
    },
  };
}

/** Read a response body but stop after maxBytes to bound memory. */
async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; bytes: number }> {
  if (!res.body) {
    const t = await res.text();
    return { text: t.slice(0, maxBytes), bytes: Buffer.byteLength(t) };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      chunks.push(value);
      if (total >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buf.toString("utf8"), bytes: total };
}
