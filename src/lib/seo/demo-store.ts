/**
 * In-memory demo store for SEO Command Center websites.
 *
 * Mirrors the existing AEO demo store pattern: a seeded fixture persisted on
 * globalThis so it survives dev hot-reloads. Used only in demo mode; live mode
 * reads/writes the `websites` table under RLS. Keeps SEO Command Center fully
 * explorable with zero external services.
 */

import type { Website } from "@/lib/seo/types";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";

interface SeoDemoState {
  websites: Website[];
}

const now = () => new Date().toISOString();

function seed(): SeoDemoState {
  const ts = now();
  return {
    websites: [
      {
        id: "web-demo-1",
        workspaceId: DEMO_WORKSPACE_ID,
        name: "Acme Law",
        url: "https://www.acmelaw.example",
        canonicalDomain: "acmelaw.example",
        cmsType: "wordpress",
        environment: "production",
        status: "active",
        primaryCountry: "US",
        primaryLanguage: "en",
        ownershipVerifiedAt: ts,
        ownershipMethod: "cms_connection",
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  };
}

const g = globalThis as unknown as { __seoDemo?: SeoDemoState };
export function seoStore(): SeoDemoState {
  if (!g.__seoDemo) g.__seoDemo = seed();
  return g.__seoDemo;
}

export function addDemoWebsite(w: Website): void {
  seoStore().websites.push(w);
}

/** Test-only: reset the seeded state. */
export function __resetSeoDemo(): void {
  g.__seoDemo = seed();
}
