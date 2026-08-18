"use server";

import { revalidatePath } from "next/cache";
import { createWebsite } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID, resolveMembership } from "@/lib/rbac/resolve";

/**
 * Add-website server action. Resolves the caller's workspace + role on the
 * server, runs validation, and persists. The frontend never supplies the role.
 */
export async function addWebsiteAction(formData: FormData) {
  // In demo mode the workspace is fixed; in live mode we resolve the caller's
  // first workspace membership. (Multi-workspace switching is a later phase.)
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;

  const result = await createWebsite(workspaceId, {
    name: String(formData.get("name") ?? ""),
    url: String(formData.get("url") ?? ""),
    sitemapUrl: (formData.get("sitemapUrl") as string) || null,
    robotsUrl: (formData.get("robotsUrl") as string) || null,
  });

  revalidatePath("/websites");
  return result;
}
