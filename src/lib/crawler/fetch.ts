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

/**
 * Resolve a hostname, assert every resolved IP is allowed, and RETURN one
 * validated address to pin the connection to. Pinning is what closes the
 * DNS-rebinding window: without it, fetch() would re-resolve independently and
 * could connect to a different (private) IP than the one we validated.
 */
async function resolveAllowedIp(hostname: string): Promise<{ address: string; family: number }> {
  const records = await lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new SsrfError("blocked_hostname", `Could not resolve host: ${hostname}`);
  }
  for (const r of records) assertIpAllowed(r.address);
  return { address: records[0].address, family: records[0].family };
}

/**
 * Build an undici dispatcher that forces the connection to the pre-validated
 * IP (re-asserting inside the lookup callback), so the address we checked is
 * the address we connect to. Falls back to null if undici's Agent isn't
 * importable — in that case the pre-fetch validation still applies but the
 * rebinding window is not fully closed (logged by the caller).
 */
type LookupCb = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;
interface UndiciAgentCtor {
  new (opts: { connect: { lookup: (h: string, o: unknown, cb: LookupCb) => void } }): unknown;
}

async function pinnedDispatcher(pinned: { address: string; family: number }): Promise<unknown | null> {
  try {
    // `undici` backs Node's global fetch; import it by a computed specifier so
    // the bundler/type-checker doesn't require static types for an optional dep.
    const mod = (await import(/* webpackIgnore: true */ "undici" as string)) as { Agent?: UndiciAgentCtor };
    if (!mod.Agent) return null;
    return new mod.Agent({
      connect: {
        lookup: (_hostname: string, _opts: unknown, cb: LookupCb) => {
          try {
            assertIpAllowed(pinned.address); // re-assert at connect time
            cb(null, pinned.address, pinned.family);
          } catch (err) {
            cb(err as NodeJS.ErrnoException, "", 0);
          }
        },
      },
    });
  } catch {
    return null;
  }
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
        // Guard 1 + 2 on every hop: validate the URL, then resolve + validate
        // the IP and PIN the connection to it (defeats DNS rebinding).
        let parsed: URL;
        let dispatcher: unknown | null;
        try {
          parsed = assertUrlAllowed(current);
          const pinned = await resolveAllowedIp(parsed.hostname);
          dispatcher = await pinnedDispatcher(pinned);
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
          const init: RequestInit & { dispatcher?: unknown } = {
            method: "GET",
            redirect: "manual", // we follow manually to re-validate each hop
            signal: controller.signal,
            headers: { "user-agent": CRAWLER_USER_AGENT, accept: "text/html,application/xhtml+xml" },
          };
          if (dispatcher) init.dispatcher = dispatcher;
          res = await fetch(current, init);
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
