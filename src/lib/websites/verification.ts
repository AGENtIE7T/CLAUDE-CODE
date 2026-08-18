/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Domain ownership verification.
 * ─────────────────────────────────────────────────────────────────────────
 *  A website may not be crawled or written to until ownership is verified. We
 *  support several methods; each issues a unique token the user places, then we
 *  confirm the token is present. The token generation and the "does this
 *  evidence prove ownership?" checks are PURE here — the actual DNS/HTTP lookup
 *  is passed in as a fetcher, so this module is fully testable and does no
 *  network I/O itself (demo-safe).
 */

import { createHash, randomBytes } from "node:crypto";
import type { OwnershipMethod } from "@/lib/seo/types";

const TOKEN_PREFIX = "seo-cc-verify";

/** Deterministic-length verification token bound to a website id. */
export function issueToken(websiteId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const sig = createHash("sha256").update(`${websiteId}:${nonce}`).digest("hex").slice(0, 16);
  return `${TOKEN_PREFIX}=${nonce}.${sig}`;
}

/** The exact artifact the user must place, per method. */
export function verificationInstructions(
  method: OwnershipMethod,
  domain: string,
  token: string,
): { where: string; value: string } {
  switch (method) {
    case "dns":
      return { where: `TXT record on ${domain}`, value: token };
    case "html_file": {
      const [, body] = token.split("=");
      return { where: `https://${domain}/.well-known/seo-cc-${body?.split(".")[1]}.txt`, value: token };
    }
    case "meta_tag":
      return { where: `<meta> tag in the homepage <head>`, value: `<meta name="seo-cc-verification" content="${token}">` };
    case "search_console":
      return { where: "Google Search Console property", value: "OAuth connection (no token to place)" };
    case "cms_connection":
      return { where: "Authenticated CMS connection", value: "Verified via connected CMS credentials" };
  }
}

/** Evidence gathered from the outside world, for the pure checker below. */
export interface VerificationEvidence {
  /** TXT records found at the domain (for method "dns"). */
  dnsTxt?: string[];
  /** Body of the fetched well-known file (for method "html_file"). */
  fileBody?: string | null;
  /** Homepage HTML (for method "meta_tag"). */
  homepageHtml?: string | null;
  /** Whether an authenticated integration confirmed ownership. */
  integrationConfirmed?: boolean;
}

export interface VerificationResult {
  verified: boolean;
  reason: string;
}

/** Pure check: does the evidence prove the token is present for this method? */
export function checkVerification(
  method: OwnershipMethod,
  token: string,
  evidence: VerificationEvidence,
): VerificationResult {
  switch (method) {
    case "dns": {
      const found = (evidence.dnsTxt ?? []).some((r) => r.includes(token));
      return found
        ? { verified: true, reason: "TXT record present." }
        : { verified: false, reason: "TXT record with the token not found." };
    }
    case "html_file": {
      const ok = Boolean(evidence.fileBody && evidence.fileBody.includes(token));
      return ok
        ? { verified: true, reason: "Verification file present." }
        : { verified: false, reason: "Verification file missing or wrong contents." };
    }
    case "meta_tag": {
      const ok = Boolean(evidence.homepageHtml && evidence.homepageHtml.includes(token));
      return ok
        ? { verified: true, reason: "Meta tag present on homepage." }
        : { verified: false, reason: "Verification meta tag not found." };
    }
    case "search_console":
    case "cms_connection":
      return evidence.integrationConfirmed
        ? { verified: true, reason: "Confirmed via authenticated integration." }
        : { verified: false, reason: "Integration did not confirm ownership." };
  }
}
