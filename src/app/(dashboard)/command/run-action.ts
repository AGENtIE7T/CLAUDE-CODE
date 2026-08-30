"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit-log/log";
import { DEMO_WORKSPACE_ID, resolveMembership } from "@/lib/rbac/resolve";
import { listWebsites } from "@/lib/websites/service";
import { processCommand, type CommandDecision } from "@/lib/command/process";
import { getWebsiteConfig } from "@/lib/websites/config-store";
import { resolveConnection } from "@/lib/connection/resolve";
import { createMemoryBackupStore } from "@/lib/backups/snapshot";
import {
  buildCapabilitySnapshot,
  WORK_ORDER_ONLY,
  type CapabilitySnapshot,
} from "@/lib/status/capabilities";
import { runInternalLinking, applyApprovedRevision, type LinkingRunResult } from "@/lib/workflow/linking-run";
import { recordRun, type RunRecord } from "@/lib/runs/history";
import {
  createWorkOrder,
  getWorkOrder,
  settleWorkOrder,
  type WorkOrder,
} from "@/lib/runs/work-orders";
import type { LinkCandidate } from "@/lib/linking/engine";
import type { WorkflowStep } from "@/lib/workflow/linking-run";

/**
 * Backups are held per process alongside the mock CMS. A durable store swaps
 * in behind the same interface; the ordering guarantee (backup, then write)
 * lives in the CMS store, not here.
 */
const g = globalThis as unknown as { __seoBackups?: ReturnType<typeof createMemoryBackupStore> };
function backups() {
  if (!g.__seoBackups) g.__seoBackups = createMemoryBackupStore();
  return g.__seoBackups;
}

export interface CommandRunResult {
  instruction: string;
  decision: CommandDecision;
  capabilities: CapabilitySnapshot;
  /** Present only when the plan was executable and a run took place. */
  run: {
    mode: LinkingRunResult["mode"];
    applied: boolean;
    rolledBack: boolean;
    workOrderOnly: boolean;
    approvalSource: LinkingRunResult["approvalSource"];
    message: string;
    pagesRead: number;
    candidates: LinkCandidate[];
    steps: WorkflowStep[];
    mock: boolean;
    injectionFlags: { url: string; score: number }[];
  } | null;
  /** Present when the run produced something awaiting a decision. */
  workOrder: WorkOrder | null;
  runId: string | null;
}

/**
 * Turn an instruction into a plan and, when the plan is executable, actually
 * run it. Nothing here decides what is permitted: the plan is validated by the
 * policy layer, the capability snapshot decides what is possible, and the
 * execute engine decides what is written.
 */
export async function runCommandAction(instruction: string): Promise<CommandRunResult> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;
  const role = membership?.role ?? "VIEWER";

  const websites = await listWebsites(workspaceId);
  const website = websites.length === 1 ? websites[0] : null;

  const capabilities = buildCapabilitySnapshot({
    websiteCount: websites.length,
    websiteLabel: website?.name ?? null,
    websiteVerified: Boolean(website?.ownershipVerifiedAt),
  });

  const decision = processCommand(instruction, {
    role,
    websiteId: website?.id ?? null,
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

  const empty: CommandRunResult = {
    instruction,
    decision,
    capabilities,
    run: null,
    workOrder: null,
    runId: null,
  };

  // A refusal or a clarification stops here — there is nothing to run.
  if (decision.kind !== "ready" || !website) return empty;

  const config = getWebsiteConfig(website.id);
  const resolved = resolveConnection();

  // Protected URLs from the instruction ADD to the stored list; they never
  // replace it, so a phrasing slip cannot un-protect a page.
  const protectedUrls = [...new Set([...config.protectedUrls, ...decision.rules.protectedUrls])];

  const result = await runInternalLinking({
    websiteId: website.id,
    workspaceId,
    userId: membership?.userId ?? null,
    role,
    connection: resolved.connection,
    backups: backups(),
    rules: config.rules,
    protectedUrls,
    mode: decision.plan.mode,
    useAutopilot: config.rules.enabled && decision.rules.autopilotRequested,
    limits: {
      ...(decision.plan.constraints.max_links_per_page !== undefined
        ? { maxLinksPerPage: decision.plan.constraints.max_links_per_page }
        : {}),
      ...(decision.plan.constraints.max_links_to_same_target !== undefined
        ? { maxLinksToSameTarget: decision.plan.constraints.max_links_to_same_target }
        : {}),
      minConfidence: decision.plan.constraints.minimum_confidence,
      maxPagesPerBatch: Math.min(config.rules.maxPagesPerRun, decision.plan.scope.page_limit),
    },
    includePatterns: decision.plan.scope.include_patterns,
  });

  const record: RunRecord = recordRun(
    { websiteId: website.id, workspaceId, instruction },
    result,
  );

  // Something was previewed but not applied → it becomes a work order the
  // operator can approve. The revision is stored as-is, never re-derived.
  let workOrder: WorkOrder | null = null;
  if (!result.applied && result.revision && result.chosen && decision.plan.mode !== "audit") {
    workOrder = createWorkOrder({
      websiteId: website.id,
      workspaceId,
      instruction,
      revision: result.revision,
      candidate: result.chosen,
      ttlMinutes: config.rules.approvalTtlMinutes,
    });
  }

  revalidatePath("/runs");

  return {
    instruction,
    decision,
    capabilities,
    run: {
      mode: result.mode,
      applied: result.applied,
      rolledBack: result.rolledBack,
      workOrderOnly: result.workOrderOnly,
      approvalSource: result.approvalSource,
      message: result.message,
      pagesRead: result.pagesRead,
      candidates: result.candidates,
      steps: result.steps,
      mock: result.mock,
      injectionFlags: result.injectionFlags,
    },
    workOrder,
    runId: record.id,
  };
}

export interface ApprovalResult {
  ok: boolean;
  applied: boolean;
  rolledBack: boolean;
  message: string;
  steps: WorkflowStep[];
  status: WorkOrder["status"];
}

/**
 * Approve and apply a work order.
 *
 * The approval binds to the stored revision's hash. If the page changed since
 * the preview, the execute engine's freshness check rejects the write — the
 * operator is told to regenerate rather than being silently given a different
 * edit than the one they looked at.
 */
export async function approveWorkOrderAction(id: string): Promise<ApprovalResult> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;
  const role = membership?.role ?? "VIEWER";

  const order = getWorkOrder(id);
  if (!order) {
    return { ok: false, applied: false, rolledBack: false, message: "That work order no longer exists.", steps: [], status: "expired" };
  }
  if (order.status !== "pending") {
    return {
      ok: false,
      applied: false,
      rolledBack: false,
      message:
        order.status === "expired"
          ? "This work order expired. Regenerate the preview so the change is checked against the page as it is now."
          : `This work order is already ${order.status}.`,
      steps: [],
      status: order.status,
    };
  }

  const config = getWebsiteConfig(order.websiteId);
  const resolved = resolveConnection();

  const outcome = await applyApprovedRevision({
    websiteId: order.websiteId,
    workspaceId,
    userId: membership?.userId ?? null,
    role,
    connection: resolved.connection,
    backups: backups(),
    revision: order.revision,
    approval: {
      approvedRevisionHash: order.revision.revisionHash,
      expiresAt: order.expiresAt,
    },
    protectedUrls: [...config.protectedUrls, ...config.rules.protectedUrls],
    requireBackup: config.rules.requireBackup,
    expectTargetUrl: order.candidate.targetUrl,
  });

  settleWorkOrder(id, outcome.applied ? "applied" : "failed", outcome.message);

  await audit({
    workspaceId,
    userId: membership?.userId ?? null,
    action: outcome.applied ? "work_order.applied" : "work_order.failed",
    resourceType: "revision",
    resourceId: order.revision.revisionHash.slice(0, 12),
    resultSummary: outcome.message,
  });

  revalidatePath("/runs");
  return {
    ok: outcome.applied,
    applied: outcome.applied,
    rolledBack: outcome.rolledBack,
    message: outcome.message,
    steps: outcome.steps,
    status: outcome.applied ? "applied" : "failed",
  };
}

export async function rejectWorkOrderAction(id: string): Promise<ApprovalResult> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;
  settleWorkOrder(id, "rejected", "Rejected by the operator.");
  await audit({
    workspaceId,
    userId: membership?.userId ?? null,
    action: "work_order.rejected",
    resourceType: "revision",
    resourceId: id,
    resultSummary: "Work order rejected; nothing was written.",
  });
  revalidatePath("/runs");
  return {
    ok: true,
    applied: false,
    rolledBack: false,
    message: WORK_ORDER_ONLY,
    steps: [],
    status: "rejected",
  };
}
