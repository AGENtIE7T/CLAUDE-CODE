/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Third-party data provider states.
 * ─────────────────────────────────────────────────────────────────────────
 *  Every provider call resolves to one of a small, closed set of outcomes.
 *  The point of the closed set is that the UI can never render a number the
 *  system does not actually have:
 *
 *    · a metric the provider did not return is `null`, never 0;
 *    · "the account has no data for this domain" is a SUCCESS with nulls and a
 *      recorded reason, not a failure and not zeros;
 *    · a provider that is not configured says so, rather than degrading into
 *      silent emptiness that looks like a real answer;
 *    · when one report succeeds and another fails, the successful part is
 *      returned WITH the failure attached, so a partial answer is visibly
 *      partial.
 *
 *  Nothing here performs I/O.
 */

export type ProviderName = "semrush" | "ahrefs" | "google_search_console";

/** Why a provider could not answer. Closed set — no free-form states. */
export type UnavailableReason =
  /** No credential configured. The operator has not connected the provider. */
  | "not_configured"
  /** Credential present but rejected. */
  | "unauthorized"
  /** Authenticated, but the subscription does not include this data. */
  | "plan_insufficient"
  /** Quota or API units exhausted. */
  | "quota_exhausted"
  /** Too many requests; retry later. */
  | "rate_limited"
  /** Network or transport failure. */
  | "network"
  /** Provider responded with something we cannot parse. */
  | "malformed_response"
  /** We are deliberately not calling out right now (see circuit.ts). */
  | "circuit_open"
  /** Anything else. */
  | "unknown";

export interface ProviderUnavailable {
  provider: ProviderName;
  reason: UnavailableReason;
  /** Operator-facing text. Never contains a credential. */
  message: string;
  /** Present when the provider told us when to come back. */
  retryAfterMs?: number;
  /** True when retrying with the same input could plausibly succeed. */
  retryable: boolean;
}

/** One sub-report that failed inside an otherwise successful call. */
export interface PartialFailure {
  /** Which sub-report failed, e.g. "backlinks_overview". */
  report: string;
  reason: UnavailableReason;
  message: string;
}

export type ProviderResult<T> =
  | {
      ok: true;
      provider: ProviderName;
      data: T;
      fetchedAt: string;
      /** Empty when the answer is complete. */
      partial: PartialFailure[];
    }
  | { ok: false; provider: ProviderName; error: ProviderUnavailable };

const RETRYABLE: Record<UnavailableReason, boolean> = {
  not_configured: false,
  unauthorized: false,
  plan_insufficient: false,
  quota_exhausted: true,
  rate_limited: true,
  network: true,
  malformed_response: true,
  circuit_open: true,
  unknown: true,
};

export function unavailable(
  provider: ProviderName,
  reason: UnavailableReason,
  message: string,
  retryAfterMs?: number,
): ProviderUnavailable {
  return {
    provider,
    reason,
    message,
    retryable: RETRYABLE[reason],
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

export function failure<T>(
  provider: ProviderName,
  reason: UnavailableReason,
  message: string,
  retryAfterMs?: number,
): ProviderResult<T> {
  return { ok: false, provider, error: unavailable(provider, reason, message, retryAfterMs) };
}

export function success<T>(
  provider: ProviderName,
  data: T,
  partial: PartialFailure[] = [],
  now: () => number = Date.now,
): ProviderResult<T> {
  return { ok: true, provider, data, fetchedAt: new Date(now()).toISOString(), partial };
}

/** One-line operator-facing summary of any result. Safe to render or log. */
export function describeResult(r: ProviderResult<unknown>): string {
  if (!r.ok) return `${r.provider}: unavailable (${r.error.reason}) — ${r.error.message}`;
  if (r.partial.length) {
    return `${r.provider}: partial — ${r.partial.map((p) => `${p.report} (${p.reason})`).join(", ")}`;
  }
  return `${r.provider}: ok`;
}
