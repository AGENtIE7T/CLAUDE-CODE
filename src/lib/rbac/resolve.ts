/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Per-request role & membership resolution.
 * ─────────────────────────────────────────────────────────────────────────
 *  The bridge between "who is calling" and the RBAC matrix. Server actions and
 *  route handlers call `resolveMembership()` at the top, then pass the returned
 *  role into `can()` / `assertCan()`. The role is read from the database
 *  (memberships.seo_role), NEVER from the request — this is where the
 *  "never trust the frontend" rule is honoured.
 *
 *  Demo mode returns a fixed OWNER membership for the seeded workspace so the
 *  whole app is explorable without auth, exactly like the existing product.
 */

import { isDemo } from "@/lib/env";
import type { Role } from "@/lib/seo/types";
import { AuthorizationError, type Permission, assertCan } from "@/lib/rbac/roles";

export interface Membership {
  userId: string;
  workspaceId: string;
  role: Role;
}

export const DEMO_WORKSPACE_ID = "demo-org";
export const DEMO_USER_ID = "demo-user";

/**
 * Resolve the caller's membership in a workspace. Returns null when the caller
 * is not a member (caller must treat null as "no access"). In demo mode every
 * request is the demo OWNER of the demo workspace.
 */
export async function resolveMembership(
  workspaceId: string,
): Promise<Membership | null> {
  if (isDemo()) {
    return { userId: DEMO_USER_ID, workspaceId: DEMO_WORKSPACE_ID, role: "OWNER" };
  }

  // Live mode: read from Supabase, scoped by the authenticated user.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select("seo_role")
    .eq("org_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return { userId: user.id, workspaceId, role: data.seo_role as Role };
}

/**
 * Resolve membership AND assert a permission in one call — the common pattern
 * at the top of a mutation. Throws AuthorizationError if the caller is not a
 * member or lacks the permission.
 */
export async function requirePermission(
  workspaceId: string,
  permission: Permission,
): Promise<Membership> {
  const membership = await resolveMembership(workspaceId);
  if (!membership) {
    // Not a member: deny without revealing whether the workspace exists.
    throw new AuthorizationError("VIEWER", permission);
  }
  assertCan(membership.role, permission);
  return membership;
}
