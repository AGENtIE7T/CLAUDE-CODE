/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Website onboarding validation.
 * ─────────────────────────────────────────────────────────────────────────
 *  Validates the URL fields a user supplies when adding a website: syntax,
 *  scheme, SSRF-safety, and that sitemap/robots URLs live on the same
 *  registrable domain as the site itself (a mismatch is a common mistake and
 *  a mild SSRF/mis-scoping risk). Pure and testable — no network calls.
 */

import { assertUrlAllowed, SsrfError } from "@/lib/ssrf/validate";

export interface WebsiteInput {
  name: string;
  url: string;
  sitemapUrl?: string | null;
  robotsUrl?: string | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface NormalizedWebsite {
  name: string;
  url: string;
  canonicalDomain: string;
  sitemapUrl: string | null;
  robotsUrl: string | null;
}

export type ValidationResult =
  | { ok: true; value: NormalizedWebsite; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Extract the registrable-ish domain: strip a leading "www." from the host.
 * (A full public-suffix list is overkill here; www-stripping catches the
 * overwhelming majority of "same site?" comparisons.)
 */
export function canonicalDomain(rawUrl: string): string {
  const host = new URL(rawUrl).hostname.toLowerCase();
  return host.replace(/^www\./, "");
}

function sameSite(a: string, b: string): boolean {
  try {
    return canonicalDomain(a) === canonicalDomain(b);
  } catch {
    return false;
  }
}

/** Validate + normalize a website onboarding payload. */
export function validateWebsite(input: WebsiteInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!input.name || input.name.trim().length === 0) {
    issues.push({ field: "name", message: "Name is required." });
  }
  if (input.name && input.name.length > 120) {
    issues.push({ field: "name", message: "Name must be 120 characters or fewer." });
  }

  // Primary URL: must parse, must be SSRF-safe, should be HTTPS.
  let primary: URL | null = null;
  try {
    primary = assertUrlAllowed(input.url);
  } catch (e) {
    const msg =
      e instanceof SsrfError ? `Not an allowed website URL (${e.reason}).` : "Invalid URL.";
    issues.push({ field: "url", message: msg });
  }
  if (primary && primary.protocol !== "https:") {
    warnings.push({ field: "url", message: "Site is not HTTPS — recommend switching to https://." });
  }

  // Sitemap URL (optional): SSRF-safe and same-site.
  let sitemap: string | null = null;
  if (input.sitemapUrl) {
    try {
      assertUrlAllowed(input.sitemapUrl);
      sitemap = input.sitemapUrl;
      if (primary && !sameSite(input.url, input.sitemapUrl)) {
        issues.push({ field: "sitemapUrl", message: "Sitemap must be on the same domain as the site." });
      }
    } catch {
      issues.push({ field: "sitemapUrl", message: "Invalid or disallowed sitemap URL." });
    }
  }

  // Robots URL (optional): SSRF-safe and same-site.
  let robots: string | null = null;
  if (input.robotsUrl) {
    try {
      assertUrlAllowed(input.robotsUrl);
      robots = input.robotsUrl;
      if (primary && !sameSite(input.url, input.robotsUrl)) {
        issues.push({ field: "robotsUrl", message: "robots.txt must be on the same domain as the site." });
      }
    } catch {
      issues.push({ field: "robotsUrl", message: "Invalid or disallowed robots.txt URL." });
    }
  }

  if (issues.length > 0 || !primary) return { ok: false, issues };

  return {
    ok: true,
    value: {
      name: input.name.trim(),
      url: primary.toString(),
      canonicalDomain: canonicalDomain(input.url),
      sitemapUrl: sitemap,
      robotsUrl: robots,
    },
    warnings,
  };
}

/** Default sitemap/robots URLs derived from the site origin. */
export function defaultDiscoveryUrls(rawUrl: string): { sitemapUrl: string; robotsUrl: string } {
  const origin = new URL(rawUrl).origin;
  return { sitemapUrl: `${origin}/sitemap.xml`, robotsUrl: `${origin}/robots.txt` };
}
