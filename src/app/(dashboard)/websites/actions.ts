"use server";

import { revalidatePath } from "next/cache";
import { createWebsite, listWebsites, markWebsiteVerified } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID, resolveMembership } from "@/lib/rbac/resolve";
import { resolveConnection } from "@/lib/connection/resolve";
import { checkVerification, connectionProvesOwnership } from "@/lib/websites/verification";
import { WORDPRESS_CONNECTION_REQUIRED } from "@/lib/status/capabilities";

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

/**
 * Prove ownership through the authenticated CMS connection.
 *
 * This is the one verification method that needs nothing placed on the site:
 * holding working credentials for a WordPress install IS evidence of control.
 * It is only accepted when the connection points at this website's own domain,
 * and only when the credentials actually work — a configured-but-unreachable
 * connection proves nothing.
 */
export async function verifyViaCmsAction(websiteId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;

  const website = (await listWebsites(workspaceId)).find((w) => w.id === websiteId);
  if (!website) return { ok: false, message: "That website is not in this workspace." };

  const resolved = resolveConnection();
  if (!resolved.connection) {
    return {
      ok: false,
      message: resolved.error?.message ?? WORDPRESS_CONNECTION_REQUIRED,
    };
  }

  // 1. The connection must be for THIS site.
  const match = connectionProvesOwnership(website.canonicalDomain, resolved.connection.siteUrl);
  if (!match.proves) return { ok: false, message: match.reason };

  // 2. The credentials must actually work right now.
  const verified = await resolved.connection.verify();
  const outcome = checkVerification("cms_connection", "", {
    integrationConfirmed: verified.ok,
  });
  if (!outcome.verified) {
    return {
      ok: false,
      message: `The CMS connection did not confirm ownership: ${verified.error?.message ?? outcome.reason}`,
    };
  }

  const saved = await markWebsiteVerified(workspaceId, websiteId, "cms_connection");
  if (!saved.ok) return { ok: false, message: saved.error ?? "Could not record the verification." };

  revalidatePath("/websites");
  revalidatePath("/connection");
  return {
    ok: true,
    message: `Verified. ${match.reason}${resolved.connection.isMock ? " (This is the fixture connection, so it verifies the fixture — not a real site.)" : ""}`,
  };
}
