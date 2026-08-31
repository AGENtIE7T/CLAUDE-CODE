/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Provider circuit breaker.
 * ─────────────────────────────────────────────────────────────────────────
 *  Some provider failures are STATE, not luck. "Your plan does not include
 *  this data" will be just as true on the next request, and on the thousand
 *  after that. Retrying it burns quota, fills the log with noise, and — for
 *  metered APIs — costs money for a guaranteed failure.
 *
 *  So a breaker records those failures and refuses to call out again until a
 *  cooldown has passed. The cooldown is chosen by the caller and scales with
 *  how permanent the condition is: seconds for a rate limit, hours for a plan
 *  restriction.
 *
 *  The clock is injectable so this is testable without waiting, and the
 *  breaker is deliberately in-memory and per-process: reopening after a
 *  restart is the safe direction to be wrong in.
 */

import type { ProviderName, UnavailableReason } from "./state";

export interface TripRecord {
  reason: UnavailableReason;
  message: string;
  trippedAt: number;
  openUntil: number;
}

export interface Breaker {
  readonly provider: ProviderName;
  /** True when calls must NOT be attempted right now. */
  isOpen(): boolean;
  /** Why it is open, or null when closed. */
  openReason(): TripRecord | null;
  /** Milliseconds until it closes again, or 0. */
  retryAfterMs(): number;
  /** Record a failure that should suppress further calls for `cooldownMs`. */
  trip(reason: UnavailableReason, message: string, cooldownMs: number): void;
  /** Clear the breaker — used when the operator re-connects the provider. */
  reset(): void;
}

/** Sensible cooldowns keyed by how permanent the condition is. */
export const COOLDOWN_MS: Partial<Record<UnavailableReason, number>> = {
  // A plan does not change on its own. Do not keep asking.
  plan_insufficient: 24 * 60 * 60 * 1000,
  unauthorized: 60 * 60 * 1000,
  quota_exhausted: 60 * 60 * 1000,
  rate_limited: 60 * 1000,
  network: 30 * 1000,
};

export function createBreaker(provider: ProviderName, now: () => number = Date.now): Breaker {
  let record: TripRecord | null = null;

  function current(): TripRecord | null {
    if (record && now() >= record.openUntil) record = null;
    return record;
  }

  return {
    provider,
    isOpen: () => current() !== null,
    openReason: () => current(),
    retryAfterMs() {
      const r = current();
      return r ? Math.max(0, r.openUntil - now()) : 0;
    },
    trip(reason, message, cooldownMs) {
      const at = now();
      const openUntil = at + Math.max(0, cooldownMs);
      // Never shorten an existing, longer suppression by tripping again.
      if (record && record.openUntil > openUntil && now() < record.openUntil) return;
      record = { reason, message, trippedAt: at, openUntil };
    },
    reset() {
      record = null;
    },
  };
}

/** Process-wide breakers, so one route's failure suppresses another's retry. */
const shared = new Map<ProviderName, Breaker>();

export function sharedBreaker(provider: ProviderName): Breaker {
  const existing = shared.get(provider);
  if (existing) return existing;
  const b = createBreaker(provider);
  shared.set(provider, b);
  return b;
}

/** Test-only: forget every shared breaker. */
export function resetSharedBreakers(): void {
  shared.clear();
}
