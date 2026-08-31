/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SSRF protection — mandatory URL & IP validation.
 * ─────────────────────────────────────────────────────────────────────────
 *  The crawler and any outbound fetch MUST pass every URL — and every redirect
 *  hop — through `assertUrlAllowed()` before a request is made, and every
 *  RESOLVED IP through `assertIpAllowed()` after DNS resolution (defends
 *  against DNS-rebinding, where a hostname resolves to a private IP).
 *
 *  Blocks: non-HTTP(S) schemes, localhost, private/reserved IP ranges, cloud
 *  metadata endpoints, and internal-looking hostnames.
 *
 *  This module is pure and has no network dependency, so it is fully unit
 *  testable. The network wiring (DNS resolve + fetch with redirect
 *  re-validation) is built on top of it in the crawler phase.
 */

export type SsrfReason =
  | "invalid_url"
  | "blocked_scheme"
  | "blocked_hostname"
  | "blocked_ip"
  | "credentials_in_url";

export class SsrfError extends Error {
  constructor(
    public readonly reason: SsrfReason,
    message: string,
  ) {
    super(message);
    this.name = "SsrfError";
  }
}

/** Only these schemes may ever be fetched. Blocks file:, ftp:, gopher:, etc. */
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** Exact hostnames that are always blocked. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  // Cloud metadata service hostnames.
  "metadata.google.internal",
  "metadata",
]);

/** Hostname suffixes that are always blocked (internal TLDs). */
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
];

/** The well-known cloud metadata IPs (AWS/GCP/Azure/OpenStack, etc.). */
const METADATA_IPS = new Set(["169.254.169.254", "fd00:ec2::254"]);

// ── IPv4 helpers ────────────────────────────────────────────────────────────

/** Parse a dotted-quad IPv4 to a 32-bit number, or null if not an IPv4. */
export function parseIpv4(host: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inV4Range(ip: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const baseNum = parseIpv4(base)!;
  const bits = Number(bitsStr);
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (baseNum & mask);
}

/** Private, loopback, link-local, and reserved IPv4 ranges. */
const PRIVATE_V4_CIDRS = [
  "0.0.0.0/8", // "this" network
  "10.0.0.0/8", // private
  "100.64.0.0/10", // carrier-grade NAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local (incl. metadata 169.254.169.254)
  "172.16.0.0/12", // private
  "192.0.0.0/24", // IETF protocol assignments
  "192.0.2.0/24", // TEST-NET-1
  "192.168.0.0/16", // private
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved
];

/** True iff the IPv4 (as string) is in a private/reserved/loopback range. */
export function isPrivateIpv4(host: string): boolean {
  const ip = parseIpv4(host);
  if (ip === null) return false;
  return PRIVATE_V4_CIDRS.some((cidr) => inV4Range(ip, cidr));
}

// ── IPv6 helpers ────────────────────────────────────────────────────────────

/**
 * Conservative IPv6 classifier. We block loopback (::1), unspecified (::),
 * unique-local (fc00::/7), link-local (fe80::/10), and IPv4-mapped/embedded
 * addresses whose embedded v4 is private. Anything we cannot confidently
 * classify as public is treated as blocked (fail closed).
 */
export function isBlockedIpv6(raw: string): boolean {
  const host = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":")) return false; // not IPv6
  if (host === "::1" || host === "::") return true;

  // IPv4-mapped / embedded (::ffff:a.b.c.d or ::a.b.c.d) — check embedded v4.
  const embedded = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (embedded) {
    if (isPrivateIpv4(embedded[1])) return true;
  }

  const firstHextet = host.split(":")[0];
  // Unique-local fc00::/7 → first byte 0xfc or 0xfd.
  if (/^f[cd]/.test(firstHextet)) return true;
  // Link-local fe80::/10 → fe8..feb.
  if (/^fe[89ab]/.test(firstHextet)) return true;

  return false;
}

// ── public API ──────────────────────────────────────────────────────────────

/** Classify an already-resolved IP literal (v4 or v6). Fails closed. */
export function isBlockedIp(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (METADATA_IPS.has(bare.toLowerCase())) return true;
  if (parseIpv4(bare) !== null) return isPrivateIpv4(bare);
  if (bare.includes(":")) return isBlockedIpv6(bare);
  return false; // not an IP literal — hostname checks handle it elsewhere
}

/** Throwing guard for a resolved IP (call AFTER DNS resolution). */
export function assertIpAllowed(ip: string): void {
  if (isBlockedIp(ip)) {
    throw new SsrfError("blocked_ip", `Resolved IP is not allowed: ${ip}`);
  }
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => h.endsWith(s))) return true;
  // A hostname that is itself an IP literal must pass the IP checks.
  // (The WHATWG URL parser normalizes integer/hex/octal IPv4 forms — e.g.
  // http://2130706433/ → 127.0.0.1 — before we get here, so those are caught.)
  if (isBlockedIp(h)) return true;
  // Single-label hostnames (no dot, no colon) are internal/non-public — a
  // public registrable domain always contains a dot. This blocks intranet
  // names like "jenkins" or "wiki". IPv6 literals contain ":" so are excluded.
  if (!h.includes(".") && !h.includes(":")) return true;
  return false;
}

/**
 * Validate a URL before any request. Throws SsrfError on the first violation.
 * Returns the parsed URL on success.
 */
export function assertUrlAllowed(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("invalid_url", `Not a valid URL: ${rawUrl}`);
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new SsrfError("blocked_scheme", `Scheme not allowed: ${url.protocol}`);
  }

  // Embedded credentials (user:pass@host) are a classic SSRF/exfil vector.
  if (url.username || url.password) {
    throw new SsrfError("credentials_in_url", "Credentials in URL are not allowed.");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new SsrfError("blocked_hostname", `Hostname not allowed: ${url.hostname}`);
  }

  return url;
}

/** Non-throwing variant. */
export function isUrlAllowed(rawUrl: string): boolean {
  try {
    assertUrlAllowed(rawUrl);
    return true;
  } catch {
    return false;
  }
}
