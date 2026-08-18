/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Command orchestrator — the full NL → safe-plan pipeline.
 * ─────────────────────────────────────────────────────────────────────────
 *    1. parse instruction → TaskPlan candidate
 *    2. validate against the strict schema (rejects malformed plans)
 *    3. validate against policy (prohibited / permission / approval / website)
 *    4. produce a human-readable plan, a refusal, or clarifying questions
 *
 *  The caller (server action) then runs the audit/preview, or asks for
 *  approval, based on the returned decision. Nothing here executes writes.
 */

import type { Role } from "@/lib/seo/types";
import { parseInstruction } from "@/lib/command/parser";
import { parseTaskPlan, type TaskPlan } from "@/lib/command/schema";
import { validatePlan } from "@/lib/command/policy";
import { getTask, isProhibited } from "@/lib/tasks/registry";

export type CommandDecision =
  | { kind: "refused"; reason: string; alternative?: string; plan: TaskPlan }
  | { kind: "clarify"; questions: string[]; plan: TaskPlan }
  | { kind: "ready"; plan: TaskPlan; summary: string; warnings: string[]; requiresApproval: boolean };

export interface ProcessContext {
  role: Role;
  websiteId: string | null;
  websiteCount: number;
}

/** Human-readable one-liner describing what will happen. */
function summarize(plan: TaskPlan): string {
  const modeWord =
    plan.mode === "audit" ? "Audit (read-only)" : plan.mode === "preview" ? "Preview (no changes)" : "Execute (approved changes only)";
  const scopeBits: string[] = [];
  if (plan.scope.include_patterns.length) scopeBits.push(`include ${plan.scope.include_patterns.join(", ")}`);
  if (plan.scope.exclude_patterns.length) scopeBits.push(`exclude ${plan.scope.exclude_patterns.join(", ")}`);
  scopeBits.push(`≤ ${plan.scope.page_limit} pages`);
  const cons: string[] = [`min confidence ${plan.constraints.minimum_confidence}`];
  if (plan.constraints.max_links_per_page !== undefined) cons.push(`≤ ${plan.constraints.max_links_per_page} links/page`);
  return `${modeWord} · ${plan.task_type.replace(/_/g, " ")} · ${scopeBits.join(" · ")} · ${cons.join(" · ")}`;
}

export function processCommand(instruction: string, ctx: ProcessContext): CommandDecision {
  const parsed = parseInstruction(instruction, { websiteId: ctx.websiteId });

  // Early, explicit refusal for prohibited requests — with an alternative.
  if (parsed.prohibitedHint) {
    const def = getTask(parsed.prohibitedHint);
    return {
      kind: "refused",
      reason: `That request is a prohibited SEO operation (${parsed.prohibitedHint.replace(/_/g, " ")}).`,
      alternative: def?.legitimateAlternative ?? "Try a legitimate, review-based alternative instead.",
      plan: parsed.plan,
    };
  }

  // Structural validation.
  const schemaCheck = parseTaskPlan(parsed.plan);
  if (!schemaCheck.ok) {
    return {
      kind: "clarify",
      questions: ["I couldn't build a valid task from that. Can you rephrase with the site/action you want?"],
      plan: parsed.plan,
    };
  }

  // Policy validation.
  const policy = validatePlan(schemaCheck.plan, { role: ctx.role, websiteCount: ctx.websiteCount });
  if (!policy.ok) {
    if (policy.blocked) {
      return { kind: "refused", reason: policy.reason, alternative: policy.alternative, plan: schemaCheck.plan };
    }
    return { kind: "clarify", questions: policy.clarifications, plan: schemaCheck.plan };
  }

  // Extra guard: a resolved write task must be approval-gated (belt and braces).
  const requiresApproval =
    schemaCheck.plan.mode === "execute" || isProhibited(parsed.prohibitedHint ?? "");

  return {
    kind: "ready",
    plan: schemaCheck.plan,
    summary: summarize(schemaCheck.plan),
    warnings: [...parsed.notes, ...policy.warnings],
    requiresApproval,
  };
}
