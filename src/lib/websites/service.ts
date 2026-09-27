/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Website service — the RBAC + validation + persistence seam for websites.
 * ─────────────────────────────────────────────────────────────────────────
 *  Server actions call these. Every mutation:
 *    1. resolves the caller's role from the DB (never the request),
 *    2. asserts the required permission,
 *    3. validates + normalizes input,
 *    4. writes an audit entry,
 *    5. persists (demo store in demo mode; Supabase under RLS in live mode).
 *
 *  Live persistence is intentionally minimal here; the DB phase expands it.
 */

import { isDemo } from "@/lib/env";
import { audit } from "@/lib/audit-log/log";
import { requirePermission, resolveMembership, DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { AuthorizationError } from "@/lib/rbac/roles";
import { validateWebsite, type WebsiteInput } from "@/lib/websites/validate";
import { seoStore, addDemoWebsite } from "@/lib/seo/demo-store";
import type { OwnershipMethod, Website } from "@/lib/seo/types";

export interface CreateWebsiteResult {
  ok: boolean;
  website?: Website;
  issues?: { field: string; message: string }[];
  warnings?: { field: string; message: string }[];
  error?: string;
}

/** List websites the caller may see in a workspace. */
export async function listWebsites(workspaceId: string): Promise<Website[]> {
  const membership = await resolveMembership(workspaceId);
  if (!membership) return [];
  if (isDemo()) {
    return seoStore().websites.filter((w) => w.workspaceId === DEMO_WORKSPACE_ID);
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = createClient();
  const { data } = await supabase
    .from("websites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as Website[];
}

/** Create a website after permission + validation checks. */
export async function createWebsite(
  workspaceId: string,
  input: WebsiteInput,
): Promise<CreateWebsiteResult> {
  let membership;
  try {
    membership = await requirePermission(workspaceId, "website.create");
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "Not permitted." };
    throw e;
  }

  const validated = validateWebsite(input);
  if (!validated.ok) return { ok: false, issues: validated.issues };

  const ts = new Date().toISOString();
  const website: Website = {
    // Always a UUID: the strict TaskPlan schema requires website_id to be one.
    id: crypto.randomUUID(),
    workspaceId: isDemo() ? DEMO_WORKSPACE_ID : workspaceId,
    name: validated.value.name,
    url: validated.value.url,
    canonicalDomain: validated.value.canonicalDomain,
    cmsType: "unknown",
    environment: "production",
    status: "active",
    primaryCountry: null,
    primaryLanguage: null,
    // New websites are UNVERIFIED — crawl/write are gated until verified.
    ownershipVerifiedAt: null,
    ownershipMethod: null,
    createdAt: ts,
    updatedAt: ts,
  };

  if (isDemo()) {
    addDemoWebsite(website);
  } else {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const { error } = await supabase.from("websites").insert({
      id: website.id,
      workspace_id: workspaceId,
      name: website.name,
      url: website.url,
      canonical_domain: website.canonicalDomain,
      cms_type: website.cmsType,
      environment: website.environment,
      status: website.status,
    });
    if (error) return { ok: false, error: error.message };
  }

  await audit({
    workspaceId,
    userId: membership.userId,
    action: "website.create",
    resourceType: "website",
    resourceId: website.id,
    input: { url: website.url, canonicalDomain: website.canonicalDomain },
    resultSummary: `Created website ${website.canonicalDomain} (unverified).`,
  });

  return { ok: true, website, warnings: validated.warnings };
}

/**
 * Record that a website's ownership has been proven.
 *
 * Callers must have already gathered and checked the evidence — this only
 * persists the outcome, so there is exactly one place that decides ownership
 * (the verification module) and exactly one that records it (here).
 */
export async function markWebsiteVerified(
  workspaceId: string,
  websiteId: string,
  method: OwnershipMethod,
): Promise<{ ok: boolean; error?: string }> {
  let membership;
  try {
    membership = await requirePermission(workspaceId, "website.update");
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "Not permitted." };
    throw e;
  }

  const verifiedAt = new Date().toISOString();
  if (isDemo()) {
    const site = seoStore().websites.find((w) => w.id === websiteId);
    if (!site) return { ok: false, error: "Website not found." };
    site.ownershipVerifiedAt = verifiedAt;
    site.ownershipMethod = method;
    site.updatedAt = verifiedAt;
  } else {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const { error } = await supabase
      .from("websites")
      .update({ ownership_verified_at: verifiedAt, ownership_method: method })
      .eq("id", websiteId)
      .eq("workspace_id", workspaceId);
    if (error) return { ok: false, error: error.message };
  }

  await audit({
    workspaceId,
    userId: membership.userId,
    action: "website.verified",
    resourceType: "website",
    resourceId: websiteId,
    input: { method },
    resultSummary: `Ownership verified via ${method}.`,
  });
  return { ok: true };
}
