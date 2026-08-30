/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Capability status — the single honest answer to "what can this actually do
 *  right now?"
 * ─────────────────────────────────────────────────────────────────────────
 *  Every screen that offers an action reads this first. The rule it exists to
 *  enforce is simple: the interface may never imply a capability the system
 *  does not have. If WordPress is not connected, the UI says so and offers
 *  recommendations instead of changes — it does not show a disabled-looking
 *  button that would have "worked".
 *
 *  Two distinctions matter and are kept separate everywhere:
 *
 *    CONFIGURED  credentials exist in the server environment
 *    VERIFIED    we actually called the CMS and it answered
 *
 *  This module only reports CONFIGURED, because it does no I/O. Verification
 *  is a deliberate action (`/api/connection-test`) whose result is displayed
 *  as its own, separately-timestamped fact.
 *
 *  Nothing here reads, returns, or logs a credential — only whether one is
 *  present.
 */

import { isDemo } from "@/lib/env";

/** The exact sentence shown when a write is impossible. Spec-mandated. */
export const WORDPRESS_CONNECTION_REQUIRED =
  "WordPress connection required. The system can create recommendations, but it cannot modify the website.";

/** The exact sentence shown when nothing was applied. Spec-mandated. */
export const WORK_ORDER_ONLY = "Work order created. No website was modified.";

export type CapabilityStatus =
  /** Fully available. */
  | "ok"
  /** Available but restricted (read-only, mock, staging-only). */
  | "limited"
  /** Not available. */
  | "off";

export type CapabilityKey =
  | "website"
  | "wordpress"
  | "access"
  | "live_crawl"
  | "semrush"
  | "production_writes"
  | "autopilot";

export interface CapabilityCard {
  key: CapabilityKey;
  label: string;
  status: CapabilityStatus;
  /** Short state word shown on the card: "Connected", "Read-only", … */
  value: string;
  /** One sentence of plain-language truth. */
  detail: string;
  /** What the operator would have to do to change it, or null. */
  remedy: string | null;
}

export interface CapabilitySnapshot {
  cards: CapabilityCard[];
  /** Recommendations need no connection at all — always available. */
  canRecommend: boolean;
  /** A preview needs page content: a CMS connection or crawl data. */
  canPreview: boolean;
  /** A write needs a read/write CMS connection that is allowed to be used. */
  canWrite: boolean;
  /** Non-null when a write is impossible; render this verbatim. */
  writeBlockedMessage: string | null;
  checkedAt: string;
}

export interface CapabilityEnv {
  wordpressBaseUrl?: string;
  wordpressUsername?: string;
  wordpressAppPassword?: string;
  wordpressEnvironment?: string;
  wordpressAccess?: string;
  semrushApiKey?: string;
  liveCrawl?: string;
  productionWrites?: string;
  /** True when the fixture WordPress is standing in for a real site. */
  useMockWordPress?: boolean;
  demo?: boolean;
}

/** Read the environment without ever copying a secret value out of it. */
export function readCapabilityEnv(): CapabilityEnv {
  return {
    wordpressBaseUrl: process.env.WORDPRESS_BASE_URL,
    // Presence only — the values themselves are never returned.
    wordpressUsername: process.env.WORDPRESS_USERNAME ? "set" : undefined,
    wordpressAppPassword: process.env.WORDPRESS_APP_PASSWORD ? "set" : undefined,
    wordpressEnvironment: process.env.WORDPRESS_ENVIRONMENT,
    wordpressAccess: process.env.WORDPRESS_ACCESS,
    semrushApiKey: process.env.SEMRUSH_API_KEY ? "set" : undefined,
    liveCrawl: process.env.SEO_ENABLE_LIVE_CRAWL,
    productionWrites: process.env.SEO_ENABLE_PRODUCTION_WRITES,
    useMockWordPress: process.env.WORDPRESS_USE_MOCK === "1",
    demo: isDemo(),
  };
}

export interface CapabilityInput {
  env?: CapabilityEnv;
  /** Number of websites registered in the workspace. */
  websiteCount?: number;
  /** Name of the selected website, when one is selected. */
  websiteLabel?: string | null;
  /** Whether the selected website's ownership has been verified. */
  websiteVerified?: boolean;
  now?: () => number;
}

function wordpressConfigured(e: CapabilityEnv): boolean {
  return Boolean(e.wordpressBaseUrl && e.wordpressUsername && e.wordpressAppPassword);
}

/** True when the fixture server is standing in for a real WordPress. */
export function usingMockWordPress(e: CapabilityEnv): boolean {
  return Boolean(e.useMockWordPress || (e.demo && !wordpressConfigured(e)));
}

export function buildCapabilitySnapshot(input: CapabilityInput = {}): CapabilitySnapshot {
  const e = input.env ?? readCapabilityEnv();
  const now = input.now ?? Date.now;
  const cards: CapabilityCard[] = [];

  // ── website ───────────────────────────────────────────────────────────
  const count = input.websiteCount ?? 0;
  if (count === 0) {
    cards.push({
      key: "website",
      label: "Website",
      status: "off",
      value: "None added",
      detail: "No website has been added yet, so there is nothing to analyse.",
      remedy: "Add a website on the Websites screen.",
    });
  } else {
    cards.push({
      key: "website",
      label: "Website",
      status: input.websiteVerified ? "ok" : "limited",
      value: input.websiteLabel ?? `${count} registered`,
      detail: input.websiteVerified
        ? "Ownership is verified, so crawling and writing are permitted for this site."
        : "Ownership is not verified yet. Recommendations are available; writes are not.",
      remedy: input.websiteVerified ? null : "Verify ownership on the Websites screen.",
    });
  }

  // ── wordpress connection ──────────────────────────────────────────────
  const mock = usingMockWordPress(e);
  const configured = wordpressConfigured(e);
  if (mock) {
    cards.push({
      key: "wordpress",
      label: "WordPress",
      status: "limited",
      value: "Mock (fixture)",
      detail:
        "Connected to the in-process fixture WordPress, not a real site. Every change here is simulated and no real page can be reached.",
      remedy: "Add real WORDPRESS_* environment variables to connect a staging site.",
    });
  } else if (configured) {
    cards.push({
      key: "wordpress",
      label: "WordPress",
      status: "ok",
      value: "Configured",
      detail: `Credentials are present for ${e.wordpressBaseUrl}. Configured is not the same as reachable — run a connection test to confirm.`,
      remedy: "Run the connection test to verify the credentials actually work.",
    });
  } else {
    cards.push({
      key: "wordpress",
      label: "WordPress",
      status: "off",
      value: "Not connected",
      detail: WORDPRESS_CONNECTION_REQUIRED,
      remedy: "Set WORDPRESS_BASE_URL, WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD on the server.",
    });
  }

  // ── access level ──────────────────────────────────────────────────────
  const readWrite = (e.wordpressAccess ?? "read_only") === "read_write";
  const connected = mock || configured;
  cards.push({
    key: "access",
    label: "Connection access",
    status: !connected ? "off" : readWrite ? "ok" : "limited",
    value: !connected ? "No connection" : readWrite ? "Read / write" : "Read-only",
    detail: !connected
      ? "There is no connection, so nothing can be read from or written to the CMS."
      : readWrite
        ? "The connection may read pages and write approved changes."
        : "The connection may read pages but every write is refused, whatever else is approved.",
    remedy: connected && !readWrite ? "Set WORDPRESS_ACCESS=read_write once a staging test has passed." : null,
  });

  // ── live crawling ─────────────────────────────────────────────────────
  const liveCrawl = e.liveCrawl === "1";
  cards.push({
    key: "live_crawl",
    label: "Live crawling",
    status: liveCrawl ? "ok" : connected ? "limited" : "off",
    value: liveCrawl ? "Enabled" : connected ? "CMS reads only" : "Disabled",
    detail: liveCrawl
      ? "The crawler may fetch verified domains over the network."
      : connected
        ? "Network crawling is off. Page content comes from the CMS connection instead, which is what internal linking needs."
        : "Network crawling is off and there is no CMS connection, so no page content can be read.",
    remedy: liveCrawl ? null : "Set SEO_ENABLE_LIVE_CRAWL=1 to allow network crawling of verified domains.",
  });

  // ── semrush ───────────────────────────────────────────────────────────
  const semrush = Boolean(e.semrushApiKey);
  cards.push({
    key: "semrush",
    label: "Semrush",
    status: semrush ? "ok" : "off",
    value: semrush ? "Connected" : "Not connected",
    detail: semrush
      ? "Semrush API key is configured; authority and backlink figures are live."
      : "No Semrush API key. Internal linking does not need one — it runs on the site's own page content. No Semrush figures are shown.",
    remedy: semrush ? null : "Optional. Add SEMRUSH_API_KEY later for authority and backlink data.",
  });

  // ── production writes ─────────────────────────────────────────────────
  const prodWrites = e.productionWrites === "1";
  cards.push({
    key: "production_writes",
    label: "Production writes",
    status: prodWrites ? "ok" : "off",
    value: prodWrites ? "ENABLED" : "Disabled",
    detail: prodWrites
      ? "Writes to a production environment are permitted. Every other check still applies."
      : "Writes to production are refused at the engine, regardless of approval. Staging and mock writes are unaffected.",
    remedy: prodWrites ? null : "Deliberately off. Set SEO_ENABLE_PRODUCTION_WRITES=1 only after a staging test passes.",
  });

  // ── autopilot ─────────────────────────────────────────────────────────
  cards.push({
    key: "autopilot",
    label: "Autopilot",
    status: "off",
    value: "Disabled by default",
    detail:
      "Autopilot is off until you enable it per website. Even enabled, it only issues an ordinary approval — it cannot bypass a single safety check.",
    remedy: "Enable and configure it on the Autopilot screen.",
  });

  const canWrite = connected && readWrite;
  return {
    cards,
    canRecommend: true,
    canPreview: connected || liveCrawl,
    canWrite,
    writeBlockedMessage: canWrite
      ? null
      : !connected
        ? WORDPRESS_CONNECTION_REQUIRED
        : "The WordPress connection is read-only, so no change can be written.",
    checkedAt: new Date(now()).toISOString(),
  };
}

/** Look one card up by key. */
export function card(snapshot: CapabilitySnapshot, key: CapabilityKey): CapabilityCard {
  const found = snapshot.cards.find((c) => c.key === key);
  if (!found) throw new Error(`unknown capability card: ${key}`);
  return found;
}
