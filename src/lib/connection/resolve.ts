/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Connection resolution — SERVER ONLY.
 * ─────────────────────────────────────────────────────────────────────────
 *  This is the one module that touches the WordPress credential. It must never
 *  be imported from a client component: it reads process.env and passes the
 *  Application Password into a closure inside the client, and nothing it
 *  returns carries the secret.
 *
 *  Three outcomes, and they are kept distinct because the UI shows them
 *  differently:
 *
 *    real     WORDPRESS_* is configured → a live connection to that site.
 *    mock     the fixture server stands in, clearly labelled, never usable
 *             against production (assertUsable enforces that, not this file).
 *    none     nothing is configured → null, and the caller says "connection
 *             required" rather than quietly doing nothing.
 *
 *  A mock is chosen ONLY when explicitly requested (WORDPRESS_USE_MOCK=1) or
 *  in demo mode with no real credentials. It is never a fallback for a real
 *  connection that failed — a broken real connection stays broken and visible.
 *
 *  Order matters. The mock check runs FIRST, so WORDPRESS_USE_MOCK=1 wins even
 *  when real credentials are also present. Two reasons: it fails safe (the
 *  explicit "use the fixture" instruction can never be quietly overridden into
 *  touching a live site), and it keeps the UI honest — the capability card
 *  derives "Mock (fixture)" from the same flag, so the label and the adapter
 *  can never disagree. Demo mode alone does NOT force the mock: demo plus real
 *  credentials is the supported way to exercise a staging site locally.
 */

import { createWordPressConnection } from "@/lib/cms/wordpress/client";
import { createMockWordPress } from "@/lib/cms/wordpress/mock-server";
import { WP_ORIGIN } from "@/lib/cms/wordpress/fixtures";
import type { CmsConnection, CmsEnvironment } from "@/lib/cms/adapter";
import { readCapabilityEnv, usingMockWordPress } from "@/lib/status/capabilities";

export type ConnectionKind = "real" | "mock" | "none";

export interface ResolvedConnection {
  kind: ConnectionKind;
  connection: CmsConnection | null;
  /** Operator-facing description. Never contains a credential. */
  description: string;
}

/** Shared fixture server, so a mock write persists across requests in a session. */
const g = globalThis as unknown as { __seoMockWp?: ReturnType<typeof createMockWordPress> };

function mockServer() {
  if (!g.__seoMockWp) g.__seoMockWp = createMockWordPress();
  return g.__seoMockWp;
}

/** Test-only: forget the shared fixture so a run starts from clean content. */
export function __resetMockWordPress(): void {
  g.__seoMockWp = undefined;
}

export function resolveConnection(): ResolvedConnection {
  const env = readCapabilityEnv();
  const baseUrl = process.env.WORDPRESS_BASE_URL;
  const username = process.env.WORDPRESS_USERNAME;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;
  const access = process.env.WORDPRESS_ACCESS === "read_write" ? "read_write" : "read_only";
  const environment: CmsEnvironment =
    process.env.WORDPRESS_ENVIRONMENT === "production" ? "production" : "staging";

  if (usingMockWordPress(env)) {
    return {
      kind: "mock",
      connection: createWordPressConnection({
        baseUrl: WP_ORIGIN,
        token: "bW9jazptb2Nr",
        environment: "staging",
        label: "Fixture WordPress",
        access: "read_write",
        isMock: true,
        fetchImpl: mockServer().fetch,
      }),
      description:
        "Fixture WordPress — an in-process mock. Changes here are simulated and no real website is reachable.",
    };
  }

  if (baseUrl && username && appPassword) {
    return {
      kind: "real",
      connection: createWordPressConnection({
        baseUrl,
        // Built here and immediately closed over; never stored or returned.
        token: Buffer.from(`${username}:${appPassword}`).toString("base64"),
        environment,
        label: baseUrl,
        access,
        isMock: false,
      }),
      description: `WordPress at ${baseUrl} (${environment}, ${access === "read_write" ? "read/write" : "read-only"}).`,
    };
  }

  return {
    kind: "none",
    connection: null,
    description: "No WordPress connection is configured.",
  };
}
