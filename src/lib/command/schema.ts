/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Task-plan schema (strict) — the contract between the NL layer and execution.
 * ─────────────────────────────────────────────────────────────────────────
 *  A natural-language instruction is NEVER executed. It is first converted into
 *  a TaskPlan and validated by this schema (Section 17 of the spec). The schema
 *  is deliberately strict: unknown fields are rejected, enums are closed, and
 *  limits are clamped by min/max. `.strict()` on every object rejects any key
 *  the model tries to smuggle in.
 */

import { z } from "zod";

export const modeSchema = z.enum(["audit", "preview", "execute"]);
export const riskSchema = z.enum(["low", "medium", "high", "prohibited"]);

/** High-level task families the parser emits (Section 17 enum). */
export const taskTypeSchema = z.enum([
  "audit",
  "crawl",
  "internal_linking",
  "external_link_audit",
  "citation_suggestions",
  "metadata",
  "schema",
  "backlink_monitoring",
  "outreach_draft",
]);

export const scopeSchema = z
  .object({
    include_patterns: z.array(z.string().max(200)).max(50),
    exclude_patterns: z.array(z.string().max(200)).max(50),
    page_limit: z.number().int().min(1).max(1000),
  })
  .strict();

export const constraintsSchema = z
  .object({
    max_changes: z.number().int().min(0).max(100),
    // Optional, only meaningful for linking tasks; still bounded when present.
    max_links_per_page: z.number().int().min(0).max(10).optional(),
    max_links_to_same_target: z.number().int().min(0).max(10).optional(),
    minimum_confidence: z.number().min(0).max(1),
  })
  .strict();

export const actionSchema = z
  .object({
    action_type: z.string().min(1).max(80),
    reason: z.string().min(1).max(1000),
    requires_approval: z.boolean(),
  })
  .strict();

export const taskPlanSchema = z
  .object({
    task_type: taskTypeSchema,
    mode: modeSchema,
    risk_level: riskSchema,
    website_id: z.string().uuid().nullable(),
    scope: scopeSchema,
    constraints: constraintsSchema,
    actions: z.array(actionSchema).max(100),
    requires_approval: z.boolean(),
    clarifications: z.array(z.string().max(500)).max(20),
  })
  .strict();

export type TaskPlan = z.infer<typeof taskPlanSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type Constraints = z.infer<typeof constraintsSchema>;
export type PlanAction = z.infer<typeof actionSchema>;

/**
 * Parse and validate raw plan JSON. Returns a discriminated result rather than
 * throwing, so callers can turn validation failures into clarification prompts.
 */
export function parseTaskPlan(
  raw: unknown,
): { ok: true; plan: TaskPlan } | { ok: false; errors: string[] } {
  const result = taskPlanSchema.safeParse(raw);
  if (result.success) return { ok: true, plan: result.data };
  const errors = result.error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
  );
  return { ok: false, errors };
}
