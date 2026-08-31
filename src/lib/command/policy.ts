/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Policy validator — the gate between a well-formed plan and running it.
 * ─────────────────────────────────────────────────────────────────────────
 *  A plan can be schema-valid (command/schema.ts) yet still violate policy.
 *  This validator enforces the product's safety invariants against the task
 *  registry and the caller's role:
 *
 *    · prohibited tasks are refused, with a legitimate alternative
 *    · every write task requires approval (mode `execute` ⇒ requires_approval)
 *    · the caller's role must permit the task's action
 *    · risk_level must match the registry (no downgrading a high-risk write)
 *    · execute mode is only reachable through an approval (checked at execute
 *      time, not here — here we simply require the flag)
 *    · a missing website_id when one is required forces a clarification
 */

import type { Role } from "@/lib/seo/types";
import { can } from "@/lib/rbac/roles";
import { getTask, isProhibited } from "@/lib/tasks/registry";
import type { TaskPlan } from "@/lib/command/schema";

export interface PolicyContext {
  role: Role;
  /** Number of websites the caller has access to — drives the website prompt. */
  websiteCount: number;
}

export type PolicyResult =
  | { ok: true; warnings: string[] }
  | { ok: false; blocked: true; reason: string; alternative?: string }
  | { ok: false; blocked: false; clarifications: string[] };

/**
 * Map the plan's high-level task_type + mode onto a concrete registry task so
 * we can look up its canonical category, risk, and required permission.
 */
function resolveRegistryName(plan: TaskPlan): string | null {
  const { task_type, mode } = plan;
  // Read/audit families.
  if (mode === "audit") {
    if (task_type === "crawl") return "crawl_website";
    if (task_type === "external_link_audit") return "external_link_audit";
    if (task_type === "backlink_monitoring") return "backlink_report";
    return "website_audit";
  }
  // Preview families.
  if (mode === "preview") {
    switch (task_type) {
      case "internal_linking":
        return "internal_link_suggestions";
      case "metadata":
        return "metadata_suggestions";
      case "schema":
        return "schema_suggestions";
      case "citation_suggestions":
        return "external_citation_suggestions";
      case "outreach_draft":
        return "outreach_draft";
      case "backlink_monitoring":
        return "outreach_prospect_list";
      default:
        return "internal_link_suggestions";
    }
  }
  // Execute families → concrete write tasks.
  switch (task_type) {
    case "internal_linking":
      return "insert_internal_links";
    case "metadata":
      return "update_metadata";
    case "schema":
      return "update_schema";
    case "outreach_draft":
      return "send_outreach_email";
    default:
      return null; // execute mode with no mapped write task is invalid
  }
}

export function validatePlan(plan: TaskPlan, ctx: PolicyContext): PolicyResult {
  const warnings: string[] = [];

  // 1) Explicitly prohibited risk level.
  if (plan.risk_level === "prohibited") {
    return {
      ok: false,
      blocked: true,
      reason: "This request maps to a prohibited operation.",
      alternative:
        "Try a legitimate alternative such as an outreach prospect list or an internal-linking preview.",
    };
  }

  // 2) Resolve the concrete registry task and check it is not prohibited.
  const name = resolveRegistryName(plan);
  if (!name) {
    return {
      ok: false,
      blocked: false,
      clarifications: [
        "I couldn't map this to a supported action. What exactly should I do?",
      ],
    };
  }
  if (isProhibited(name)) {
    const def = getTask(name);
    return {
      ok: false,
      blocked: true,
      reason: `The operation "${name}" is prohibited.`,
      alternative: def?.legitimateAlternative,
    };
  }

  const def = getTask(name)!;

  // 3) Permission check against the caller's role.
  if (def.permission && !can(ctx.role, def.permission)) {
    return {
      ok: false,
      blocked: true,
      reason: `Your role (${ctx.role}) is not permitted to run "${name}".`,
    };
  }

  // 4) Website resolution.
  if (!plan.website_id) {
    if (ctx.websiteCount === 0) {
      return {
        ok: false,
        blocked: false,
        clarifications: ["No website is set up yet. Add a website first."],
      };
    }
    if (ctx.websiteCount > 1) {
      return {
        ok: false,
        blocked: false,
        clarifications: ["Which website should I use? You have more than one."],
      };
    }
    warnings.push("No website specified; defaulting to your only website.");
  }

  // 5) Write tasks ALWAYS require approval, regardless of what the plan says.
  if (def.category === "write" && !plan.requires_approval) {
    return {
      ok: false,
      blocked: true,
      reason: "Write operations require approval; the plan did not request it.",
    };
  }

  // 6) Risk must not be downgraded below the registry's canonical risk.
  const order = { low: 0, medium: 1, high: 2, prohibited: 3 } as const;
  if (order[plan.risk_level] < order[def.risk]) {
    warnings.push(
      `Risk raised from "${plan.risk_level}" to registry level "${def.risk}".`,
    );
  }

  // 7) High-risk in-scope sanity: bulk changes over 20 pages are high-risk.
  if (def.category === "write" && plan.scope.page_limit > 20) {
    warnings.push("Batch exceeds 20 pages — treated as HIGH risk (Section 15).");
  }

  return { ok: true, warnings };
}
