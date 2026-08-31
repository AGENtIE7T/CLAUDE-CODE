/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Per-website configuration — protected URLs and Autopilot rules.
 * ─────────────────────────────────────────────────────────────────────────
 *  This is the operator's own safety configuration, so two properties matter
 *  more than convenience:
 *
 *   · It is read fresh at the moment of every run. A rule the operator changed
 *     one second ago governs the next run — nothing caches a stale rule set.
 *   · Saving always goes through `normalizeRules()`, which clamps every limit
 *     and strips anything that is never eligible. A malformed or hostile
 *     payload therefore cannot widen what Autopilot may do; the worst it can
 *     do is fail to narrow it.
 *
 *  Storage is in-memory (persisted on globalThis so dev hot-reload keeps it),
 *  matching the existing demo-store pattern. A durable implementation swaps in
 *  behind these four functions without touching a caller.
 */

import {
  DEFAULT_AUTOPILOT_RULES,
  normalizeRules,
  type AutopilotRules,
} from "@/lib/autopilot/rules";

export interface WebsiteConfig {
  websiteId: string;
  /** Glob patterns that may never be modified, whatever is approved. */
  protectedUrls: string[];
  rules: AutopilotRules;
  updatedAt: string;
}

interface ConfigState {
  byWebsite: Record<string, WebsiteConfig>;
}

const g = globalThis as unknown as { __seoWebsiteConfig?: ConfigState };

function state(): ConfigState {
  if (!g.__seoWebsiteConfig) g.__seoWebsiteConfig = { byWebsite: {} };
  return g.__seoWebsiteConfig;
}

function fresh(websiteId: string): WebsiteConfig {
  return {
    websiteId,
    protectedUrls: [],
    rules: { ...DEFAULT_AUTOPILOT_RULES },
    updatedAt: new Date().toISOString(),
  };
}

/** Current configuration, defaulted for a website that has none yet. */
export function getWebsiteConfig(websiteId: string): WebsiteConfig {
  return state().byWebsite[websiteId] ?? fresh(websiteId);
}

/**
 * Parse a textarea of protected URL patterns: one per line, comments and
 * blanks dropped, each normalised to a leading slash so a pasted full URL and
 * a hand-typed path behave identically.
 */
export function parseProtectedUrls(raw: string): string[] {
  const out = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^https?:\/\//i.test(t)) {
      try {
        out.add(new URL(t).pathname + (new URL(t).search || ""));
        continue;
      } catch {
        /* fall through and keep the raw text */
      }
    }
    out.add(t.startsWith("/") ? t : `/${t}`);
  }
  return [...out].slice(0, 200);
}

export function saveProtectedUrls(websiteId: string, patterns: string[]): WebsiteConfig {
  const current = getWebsiteConfig(websiteId);
  const next: WebsiteConfig = {
    ...current,
    protectedUrls: patterns.slice(0, 200),
    updatedAt: new Date().toISOString(),
  };
  state().byWebsite[websiteId] = next;
  return next;
}

export function saveAutopilotRules(
  websiteId: string,
  rules: Partial<AutopilotRules>,
): WebsiteConfig {
  const current = getWebsiteConfig(websiteId);
  const next: WebsiteConfig = {
    ...current,
    rules: normalizeRules({ ...current.rules, ...rules }),
    updatedAt: new Date().toISOString(),
  };
  state().byWebsite[websiteId] = next;
  return next;
}

/** Test-only reset. */
export function __resetWebsiteConfig(): void {
  g.__seoWebsiteConfig = { byWebsite: {} };
}
