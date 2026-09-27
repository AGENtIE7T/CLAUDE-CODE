/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Ahrefs provider (server-side, read-only) — with a hard plan gate.
 * ─────────────────────────────────────────────────────────────────────────
 *  The connected Ahrefs account authenticates successfully but its plan does
 *  not include the API data this product needs. That is a standing condition,
 *  not a transient error, so this provider is built to STOP asking:
 *
 *    · the first "insufficient plan" response trips a 24-hour breaker;
 *    · while the breaker is open no request is made at all — the call returns
 *      `circuit_open` locally, with no network I/O and no quota spent;
 *    · only `reconnect()` (an explicit operator action, e.g. after upgrading)
 *      clears it early.
 *
 *  Every other rule from the Semrush provider holds here: a metric we did not
 *  receive is null and never zero, the token stays in a closure, and nothing
 *  derived from a response reaches a message without passing `redact()`.
 */

import { COOLDOWN_MS, createBreaker, type Breaker } from "./circuit";
import { failure, success, type ProviderResult, type UnavailableReason } from "./state";

const PROVIDER = "ahrefs" as const;
const BASE = "https://api.ahrefs.com/v3";

export interface AhrefsDomainRating {
  domain: string;
  /** Ahrefs Domain Rating, 0..100. Null when not returned. */
  domainRating: number | null;
  missing: { field: string; reason: string }[];
}

export interface AhrefsConfig {
  /** Server-side only. Never rendered, logged, or returned by an API. */
  token: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  breaker?: Breaker;
}

export interface AhrefsProvider {
  readonly name: typeof PROVIDER;
  isConfigured(): boolean;
  /** True while the provider is deliberately not being called. */
  isSuppressed(): boolean;
  /** Operator-facing explanation of the suppression, or null. */
  suppressionReason(): string | null;
  /** Clear a suppression after the operator changes the account or plan. */
  reconnect(): void;
  domainRating(domain: string): Promise<ProviderResult<AhrefsDomainRating>>;
}

/** Ahrefs signals a plan restriction in the body text, not only by status. */
const PLAN_PATTERN = /insufficient\s+plan|not\s+(?:included|available)\s+(?:in|on)\s+your\s+plan|upgrade\s+your\s+(?:plan|subscription)/i;

export function createAhrefsProvider(cfg: AhrefsConfig): AhrefsProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 15_000;
  const now = cfg.now ?? Date.now;
  const breaker = cfg.breaker ?? createBreaker(PROVIDER, now);
  const token = cfg.token && cfg.token.trim() ? cfg.token.trim() : null;

  function redact(s: string): string {
    const cleaned = s.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
    return token ? cleaned.split(token).join("[redacted]") : cleaned;
  }

  async function call(
    path: string,
    params: Record<string, string>,
  ): Promise<{ ok: true; json: unknown } | { ok: false; reason: UnavailableReason; message: string; retryAfterMs?: number }> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        signal: controller.signal,
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        reason: "network",
        message: aborted
          ? `Ahrefs did not respond within ${timeoutMs}ms.`
          : redact(e instanceof Error ? e.message : "Network failure contacting Ahrefs."),
      };
    }
    clearTimeout(timer);

    const body = await res.text().catch(() => "");
    if (PLAN_PATTERN.test(body)) {
      return {
        ok: false,
        reason: "plan_insufficient",
        message: "The connected Ahrefs account's plan does not include this API data.",
      };
    }
    if (res.status === 401) {
      return { ok: false, reason: "unauthorized", message: "Ahrefs rejected the API token." };
    }
    if (res.status === 403) {
      return {
        ok: false,
        reason: "plan_insufficient",
        message: "Ahrefs refused the request for this account (forbidden).",
      };
    }
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after") ?? "60");
      return {
        ok: false,
        reason: "rate_limited",
        message: "Ahrefs is rate limiting requests.",
        retryAfterMs: Math.max(1, after) * 1000,
      };
    }
    if (!res.ok) {
      return { ok: false, reason: "unknown", message: `Ahrefs returned HTTP ${res.status}.` };
    }
    try {
      return { ok: true, json: JSON.parse(body) };
    } catch {
      return { ok: false, reason: "malformed_response", message: "Ahrefs returned a malformed response." };
    }
  }

  return {
    name: PROVIDER,
    isConfigured: () => token !== null,
    isSuppressed: () => breaker.isOpen(),
    suppressionReason: () => breaker.openReason()?.message ?? null,
    reconnect: () => breaker.reset(),

    async domainRating(domain) {
      if (!token) {
        return failure(
          PROVIDER,
          "not_configured",
          "No Ahrefs API token is configured, so no Ahrefs data can be shown.",
        );
      }
      // The whole point of the gate: no request is made while it is open.
      if (breaker.isOpen()) {
        const r = breaker.openReason();
        return failure(
          PROVIDER,
          "circuit_open",
          `Not calling Ahrefs: ${r?.message ?? "suppressed after a previous failure"}`,
          breaker.retryAfterMs(),
        );
      }

      const res = await call("/site-explorer/domain-rating", {
        target: domain,
        date: new Date(now()).toISOString().slice(0, 10),
      });
      if (!res.ok) {
        const cooldown = COOLDOWN_MS[res.reason];
        if (cooldown) breaker.trip(res.reason, res.message, res.retryAfterMs ?? cooldown);
        return failure(PROVIDER, res.reason, res.message, res.retryAfterMs);
      }

      const dr = (res.json as { domain_rating?: { domain_rating?: number } } | null)?.domain_rating
        ?.domain_rating;
      const value = typeof dr === "number" && Number.isFinite(dr) ? dr : null;
      return success(
        PROVIDER,
        {
          domain,
          domainRating: value,
          missing:
            value === null
              ? [{ field: "domainRating", reason: "Ahrefs did not return a domain rating." }]
              : [],
        },
        [],
        now,
      );
    },
  };
}

/** Build the provider from the server environment. */
export function ahrefsFromEnv(over: Partial<AhrefsConfig> = {}): AhrefsProvider {
  return createAhrefsProvider({ token: process.env.AHREFS_API_TOKEN ?? null, ...over });
}
