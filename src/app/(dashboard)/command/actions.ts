"use server";

import { processCommand, type CommandDecision } from "@/lib/command/process";
import { resolveMembership, DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { listWebsites } from "@/lib/websites/service";
import { audit } from "@/lib/audit-log/log";

/**
 * Parse a natural-language command into a validated, human-readable plan.
 * This NEVER executes anything — it returns a decision (ready/clarify/refused)
 * that the UI shows. Role and website context are resolved server-side.
 */
export async function planCommandAction(
  instruction: string,
): Promise<CommandDecision & { echo: string }> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const role = membership?.role ?? "VIEWER";
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;

  const websites = await listWebsites(workspaceId);
  const websiteId = websites.length === 1 ? websites[0].id : null;

  const decision = processCommand(instruction, {
    role,
    websiteId,
    websiteCount: websites.length,
  });

  await audit({
    workspaceId,
    userId: membership?.userId ?? null,
    action: "command.plan",
    resourceType: "seo_task",
    input: { instruction },
    resultSummary: `Command parsed → ${decision.kind}.`,
  });

  return { ...decision, echo: instruction };
}
