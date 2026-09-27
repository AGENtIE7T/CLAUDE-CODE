/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Semrush provider (server-side, read-only).
 * ─────────────────────────────────────────────────────────────────────────
 *  Semrush's Analytics API answers in semicolon-separated CSV, not JSON, and
 *  signals failure with a 200 response whose BODY reads "ERROR 120 :: WRONG
 *  KEY". Both facts are handled here so no caller has to know them.
 *
 *  Two rules shape this module:
 *
 *   1. A metric we did not receive is `null` and is listed in `missing`. It is
 *      never 0. "Authority score 0" and "we don't know the authority score"
 *      are different answers and the UI must be able to tell them apart.
 *
 *   2. `domainAuthority()` draws on two independent reports. If one fails the
 *      other is still returned, with the failure recorded in `partial`. A
 *      partial answer is labelled partial rather than silently thinned out.
 *
 *  The API key is read from the environment by the caller, held in a closure,
 *  and sent only as a query parameter to api.semrush.com. `redact()` removes
 *  it from anything derived from a response before that text can reach a
 *  message, an error, or a log line.
 */

import { COOLDOWN_MS, createBreaker, type Breaker } from "./circuit";
import {
  failure,
  success,
  unavailable,
  type PartialFailure,
  type ProviderResult,
  type UnavailableReason,
} from "./state";

const PROVIDER = "semrush" as const;
const BASE = "https://api.semrush.com";

export interface DomainAuthority {
  domain: string;
  /** Semrush Authority Score, 0..100. Null when not returned. */
  authorityScore: number | null;
  referringDomains: number | null;
  backlinks: number | null;
  organicKeywords: number | null;
  organicTraffic: number | null;
  /** Every field we could not obtain, with the reason. Never silently zero. */
  missing: { field: string; reason: string }[];
}

export interface SemrushBacklink {
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  nofollow: boolean;
  firstSeen: string | null;
}

export interface SemrushConfig {
  /** Server-side only. Never rendered, logged, or returned by an API. */
  apiKey: string | null;
  database?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  breaker?: Breaker;
}

export interface SemrushProvider {
  readonly name: typeof PROVIDER;
  /** True when a key is configured. Says nothing about whether it works. */
  isConfigured(): boolean;
  /** Cheap credential check that costs one API unit. */
  verify(): Promise<ProviderResult<{ apiUnits: number | null }>>;
  domainAuthority(domain: string): Promise<ProviderResult<DomainAuthority>>;
  backlinks(domain: string, limit?: number): Promise<ProviderResult<SemrushBacklink[]>>;
}

// ── error mapping ───────────────────────────────────────────────────────────

/**
 * Semrush error codes we can act on. Anything unlisted maps to `unknown` and
 * is retried, because guessing that an unfamiliar code is permanent would
 * silently disable a working integration.
 */
const ERROR_CODES: Record<number, UnavailableReason> = {
  120: "unauthorized", // WRONG KEY
  121: "unauthorized", // API KEY IS NOT PROVIDED
  122: "unauthorized", // API KEY IS DISABLED
  130: "plan_insufficient", // API DISABLED FOR THIS SUBSCRIPTION
  131: "quota_exhausted", // LIMIT EXCEEDED
  132: "quota_exhausted", // API UNITS BALANCE IS ZERO
  133: "network", // DB CONNECTION ERROR
  134: "quota_exhausted", // API UNITS BALANCE IS ZERO
  135: "plan_insufficient", // API REPORT TYPE IS NOT SUPPORTED BY SUBSCRIPTION
  140: "rate_limited",
};

/** "ERROR 120 :: WRONG KEY" → { code, text }, or null when not an error body. */
export function parseSemrushError(body: string): { code: number; text: string } | null {
  const m = /^\s*ERROR\s+(\d+)\s*::\s*(.+?)\s*$/im.exec(body);
  return m ? { code: Number(m[1]), text: m[2] } : null;
}

/** Semicolon-separated CSV with a header row → array of records. */
export function parseSemrushCsv(body: string): Record<string, string>[] {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

/** Parse a numeric cell. An absent or non-numeric cell is null, NOT zero. */
function num(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ── provider ────────────────────────────────────────────────────────────────

export function createSemrushProvider(cfg: SemrushConfig): SemrushProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 15_000;
  const now = cfg.now ?? Date.now;
  const database = cfg.database ?? "us";
  const breaker = cfg.breaker ?? createBreaker(PROVIDER, now);
  const key = cfg.apiKey && cfg.apiKey.trim() ? cfg.apiKey.trim() : null;

  /** Remove the key from any text that came back from the network. */
  function redact(s: string): string {
    const cleaned = s.replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]");
    return key ? cleaned.split(key).join("[redacted]") : cleaned;
  }

  type Raw = { ok: true; body: string } | { ok: false; reason: UnavailableReason; message: string; retryAfterMs?: number };

  async function raw(path: string, params: Record<string, string>): Promise<Raw> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", key as string);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url.toString(), { signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        reason: "network",
        message: aborted
          ? `Semrush did not respond within ${timeoutMs}ms.`
          : redact(e instanceof Error ? e.message : "Network failure contacting Semrush."),
      };
    }
    clearTimeout(timer);

    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "unauthorized", message: "Semrush rejected the API key." };
    }
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after") ?? "60");
      return {
        ok: false,
        reason: "rate_limited",
        message: "Semrush is rate limiting requests.",
        retryAfterMs: Math.max(1, after) * 1000,
      };
    }

    let body: string;
    try {
      body = await res.text();
    } catch {
      return { ok: false, reason: "malformed_response", message: "Could not read the Semrush response." };
    }
    if (!res.ok) {
      return { ok: false, reason: "unknown", message: `Semrush returned HTTP ${res.status}.` };
    }

    // Semrush reports failure in the body of a 200 response.
    const err = parseSemrushError(body);
    if (err) {
      // "NOTHING FOUND" is not a failure: the account simply has no data for
      // this domain. That is a real, reportable answer.
      if (err.code === 50) return { ok: true, body: "" };
      return {
        ok: false,
        reason: ERROR_CODES[err.code] ?? "unknown",
        message: `Semrush error ${err.code}: ${redact(err.text)}`,
      };
    }
    return { ok: true, body };
  }

  /** One report: breaker-aware, returning rows or a typed reason. */
  async function report(
    path: string,
    params: Record<string, string>,
  ): Promise<{ ok: true; rows: Record<string, string>[] } | { ok: false; reason: UnavailableReason; message: string; retryAfterMs?: number }> {
    if (!key) {
      return {
        ok: false,
        reason: "not_configured",
        message: "No Semrush API key is configured, so no Semrush data can be shown.",
      };
    }
    if (breaker.isOpen()) {
      const r = breaker.openReason();
      return {
        ok: false,
        reason: "circuit_open",
        message: `Not calling Semrush: ${r?.message ?? "suppressed after a previous failure"}`,
        retryAfterMs: breaker.retryAfterMs(),
      };
    }
    const res = await raw(path, params);
    if (!res.ok) {
      const cooldown = COOLDOWN_MS[res.reason];
      if (cooldown) breaker.trip(res.reason, res.message, res.retryAfterMs ?? cooldown);
      return res;
    }
    return { ok: true, rows: parseSemrushCsv(res.body) };
  }

  return {
    name: PROVIDER,
    isConfigured: () => key !== null,

    async verify() {
      const r = await report("/", {
        type: "domain_ranks",
        domain: "semrush.com",
        database,
        export_columns: "Dn,Rk",
      });
      if (!r.ok) return failure(PROVIDER, r.reason, r.message, r.retryAfterMs);
      breaker.reset();
      return success(PROVIDER, { apiUnits: null }, [], now);
    },

    async domainAuthority(domain) {
      const partial: PartialFailure[] = [];
      const missing: DomainAuthority["missing"] = [];

      const [ranks, links] = await Promise.all([
        report("/", {
          type: "domain_ranks",
          domain,
          database,
          export_columns: "Dn,Rk,Or,Ot",
        }),
        report("/analytics/v1/", {
          type: "backlinks_overview",
          target: domain,
          target_type: "root_domain",
          export_columns: "ascore,total,domains_num",
        }),
      ]);

      // Both reports failed for the same structural reason → not partial, just
      // unavailable. Reporting an all-null record as "success" would be a lie.
      if (!ranks.ok && !links.ok) {
        return failure(PROVIDER, ranks.reason, ranks.message, ranks.retryAfterMs);
      }

      const data: DomainAuthority = {
        domain,
        authorityScore: null,
        referringDomains: null,
        backlinks: null,
        organicKeywords: null,
        organicTraffic: null,
        missing,
      };

      if (ranks.ok) {
        const row = ranks.rows[0];
        data.organicKeywords = num(row?.Or);
        data.organicTraffic = num(row?.Ot);
        if (!row) {
          missing.push({ field: "organicKeywords", reason: "Semrush has no organic data for this domain." });
          missing.push({ field: "organicTraffic", reason: "Semrush has no organic data for this domain." });
        }
      } else {
        partial.push({ report: "domain_ranks", reason: ranks.reason, message: ranks.message });
        missing.push({ field: "organicKeywords", reason: ranks.message });
        missing.push({ field: "organicTraffic", reason: ranks.message });
      }

      if (links.ok) {
        const row = links.rows[0];
        data.authorityScore = num(row?.ascore);
        data.backlinks = num(row?.total);
        data.referringDomains = num(row?.domains_num);
        if (!row) {
          for (const f of ["authorityScore", "backlinks", "referringDomains"]) {
            missing.push({ field: f, reason: "Semrush has no backlink data for this domain." });
          }
        }
      } else {
        partial.push({ report: "backlinks_overview", reason: links.reason, message: links.message });
        for (const f of ["authorityScore", "backlinks", "referringDomains"]) {
          missing.push({ field: f, reason: links.message });
        }
      }

      return success(PROVIDER, data, partial, now);
    },

    async backlinks(domain, limit = 50) {
      const r = await report("/analytics/v1/", {
        type: "backlinks",
        target: domain,
        target_type: "root_domain",
        export_columns: "source_url,target_url,anchor,nofollow,first_seen",
        display_limit: String(Math.min(1000, Math.max(1, limit))),
      });
      if (!r.ok) return failure(PROVIDER, r.reason, r.message, r.retryAfterMs);

      const rows: SemrushBacklink[] = r.rows.map((row) => ({
        sourceUrl: row.source_url ?? "",
        targetUrl: row.target_url ?? "",
        anchor: row.anchor ?? "",
        nofollow: row.nofollow === "true" || row.nofollow === "1",
        firstSeen: row.first_seen && row.first_seen !== "0" ? row.first_seen : null,
      }));
      return success(PROVIDER, rows, [], now);
    },
  };
}

/** Build the provider from the server environment. */
export function semrushFromEnv(over: Partial<SemrushConfig> = {}): SemrushProvider {
  return createSemrushProvider({ apiKey: process.env.SEMRUSH_API_KEY ?? null, ...over });
}
