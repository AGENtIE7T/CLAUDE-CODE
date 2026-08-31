/**
 * ─────────────────────────────────────────────────────────────────────────
 *  URL normalization for crawling.
 * ─────────────────────────────────────────────────────────────────────────
 *  Normalizing before dedupe is what stops a crawler from looping forever on
 *  the "same" page reached by different URLs (trailing slash, tracking params,
 *  fragment, param order, default port, host case). Pure and testable.
 *
 *  This is deliberately conservative: it only removes things that are known to
 *  be non-semantic (fragments, known tracking params, default ports) and never
 *  drops a query param it doesn't recognise.
 */

/** Query params that never change page content — safe to strip for dedupe. */
export const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "ref",
  "ref_src",
  "igshid",
]);

export interface NormalizeOptions {
  /** Extra param names to strip (from website settings). */
  stripParams?: string[];
  /** Drop the trailing slash on non-root paths (default true). */
  dropTrailingSlash?: boolean;
}

/**
 * Normalize an absolute URL for crawl dedupe. Returns null if the input is not
 * a valid absolute http(s) URL (callers skip nulls).
 */
export function normalizeUrl(raw: string, opts: NormalizeOptions = {}): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  // Host: lowercase (URL already lowercases scheme+host), strip default ports.
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
    u.port = "";
  }

  // Drop fragment — never part of server-side identity.
  u.hash = "";

  // Strip tracking + configured params; keep the rest, sorted for stability.
  const strip = new Set([...TRACKING_PARAMS, ...(opts.stripParams ?? [])]);
  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!strip.has(k.toLowerCase())) kept.push([k, v]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);

  // Trailing slash: collapse "/path/" → "/path" (but keep root "/").
  if ((opts.dropTrailingSlash ?? true) && u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  return u.toString();
}

/** Resolve a possibly-relative href against a base page URL. */
export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** True iff two URLs share the same registrable-ish host (www-insensitive). */
export function sameHost(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, "");
    const hb = new URL(b).hostname.replace(/^www\./, "");
    return ha === hb;
  } catch {
    return false;
  }
}
