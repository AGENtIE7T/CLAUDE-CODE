"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit-log/log";
import { DEMO_WORKSPACE_ID, resolveMembership } from "@/lib/rbac/resolve";
import { can } from "@/lib/rbac/roles";
import {
  getWebsiteConfig,
  parseProtectedUrls,
  saveAutopilotRules,
  saveProtectedUrls,
} from "@/lib/websites/config-store";
import type { AutopilotRules } from "@/lib/autopilot/rules";

export interface SaveResult {
  ok: boolean;
  message: string;
  rules?: AutopilotRules;
  protectedUrls?: string[];
}

function num(form: FormData, key: string, fallback: number): number {
  const raw = form.get(key);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Save the Autopilot rule set. The submitted values are treated as a request,
 * not as configuration: `saveAutopilotRules` runs everything through
 * `normalizeRules()`, which clamps limits and drops anything not eligible. A
 * crafted form post can therefore narrow what Autopilot may do, never widen it.
 */
export async function saveAutopilotRulesAction(formData: FormData): Promise<SaveResult> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;
  const role = membership?.role ?? "VIEWER";
  if (!can(role, "website.update")) {
    return { ok: false, message: "Your role may not change Autopilot rules." };
  }

  const websiteId = String(formData.get("websiteId") ?? "");
  if (!websiteId) return { ok: false, message: "No website selected." };

  const current = getWebsiteConfig(websiteId).rules;
  const next = saveAutopilotRules(websiteId, {
    enabled: formData.get("enabled") === "on",
    maxLinksPerPage: num(formData, "maxLinksPerPage", current.maxLinksPerPage),
    maxLinksToSameTarget: num(formData, "maxLinksToSameTarget", current.maxLinksToSameTarget),
    maxPagesPerRun: num(formData, "maxPagesPerRun", current.maxPagesPerRun),
    maxTotalChanges: num(formData, "maxTotalChanges", current.maxTotalChanges),
    minimumConfidence: num(formData, "minimumConfidence", current.minimumConfidence),
    approvalTtlMinutes: num(formData, "approvalTtlMinutes", current.approvalTtlMinutes),
    excludedPageTypes: formData.get("allowProductPages") === "on" ? [] : ["product"],
    allowedEnvironments:
      formData.get("allowProduction") === "on" ? ["staging", "production"] : ["staging"],
    requireBackup: formData.get("requireBackup") !== "off",
    requireVerification: formData.get("requireVerification") !== "off",
    stopOnFirstError: formData.get("stopOnFirstError") === "on",
    rollbackOnVerificationFailure: formData.get("rollbackOnVerificationFailure") === "on",
  });

  await audit({
    workspaceId,
    userId: membership?.userId ?? null,
    action: "autopilot.rules.update",
    resourceType: "website",
    resourceId: websiteId,
    input: {
      enabled: next.rules.enabled,
      maxLinksPerPage: next.rules.maxLinksPerPage,
      minimumConfidence: next.rules.minimumConfidence,
    },
    resultSummary: `Autopilot rules saved (${next.rules.enabled ? "enabled" : "disabled"}).`,
  });

  revalidatePath("/autopilot");
  return {
    ok: true,
    message: next.rules.enabled
      ? "Rules saved. Autopilot is ON — it will still issue an ordinary hash-bound approval for every batch."
      : "Rules saved. Autopilot is OFF, so every change will wait for your approval.",
    rules: next.rules,
  };
}

/** Save the website's protected-URL list. These can only ever add protection. */
export async function saveProtectedUrlsAction(formData: FormData): Promise<SaveResult> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;
  const role = membership?.role ?? "VIEWER";
  if (!can(role, "website.update")) {
    return { ok: false, message: "Your role may not change protected URLs." };
  }

  const websiteId = String(formData.get("websiteId") ?? "");
  if (!websiteId) return { ok: false, message: "No website selected." };

  const patterns = parseProtectedUrls(String(formData.get("protectedUrls") ?? ""));
  const saved = saveProtectedUrls(websiteId, patterns);

  await audit({
    workspaceId,
    userId: membership?.userId ?? null,
    action: "website.protected_urls.update",
    resourceType: "website",
    resourceId: websiteId,
    input: { count: patterns.length },
    resultSummary: `Protected URL list saved (${patterns.length} pattern(s)).`,
  });

  revalidatePath("/autopilot");
  revalidatePath("/websites");
  return {
    ok: true,
    message: patterns.length
      ? `Saved. ${patterns.length} pattern(s) can never be modified, whatever is approved.`
      : "Saved. No URLs are protected — consider protecting checkout, account and legal pages.",
    protectedUrls: saved.protectedUrls,
  };
}
