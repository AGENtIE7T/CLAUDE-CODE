/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Autopilot — rule-bounded standing approval for low-risk batches.
 * ─────────────────────────────────────────────────────────────────────────
 *  Autopilot lets the operator say "apply internal links within these rules
 *  without asking me about every link". It must NOT become a way to do things a
 *  human approver could not do. So it is deliberately modelled as an
 *  APPROVAL ISSUER, not as a new execution path:
 *
 *      candidates + revision + rules  ──►  evaluate()  ──►  Approval | refusal
 *
 *  The Approval it returns is the ordinary `{approvedRevisionHash, expiresAt}`
 *  that `execute/engine.ts` already demands. Every downstream guarantee —
 *  hash binding, staleness rejection, protected-URL checks, re-read and verify,
 *  rollback — is therefore unchanged and still enforced by the execute engine.
 *  Autopilot only decides *whether* to hand over that approval.
 *
 *  Consequences of that choice, all intentional:
 *    · Autopilot can never widen scope, skip verification, or write to a page
 *      the execute engine would refuse.
 *    · A rule violation produces a refusal with the exact violations listed —
 *      never a partial silent write.
 *    · Turning Autopilot off is total: `enabled: false` short-circuits before
 *      any candidate is considered.
 *
 *  Nothing here performs I/O. It is pure, deterministic, and unit-testable.
 */

import { isProtected, matchesPattern } from "@/lib/websites/protected";
import type { Revision } from "@/lib/revisions/revision";

/** Write tasks Autopilot is ever allowed to cover. Deliberately narrow: only
 *  additive, reversible, low-risk edits. Anything destructive or public-facing
 *  (redirects, robots, publishing, email) is excluded by construction and
 *  cannot be added through configuration. */
export const AUTOPILOT_ELIGIBLE_TASKS = ["insert_internal_links"] as const;
export type AutopilotTask = (typeof AUTOPILOT_ELIGIBLE_TASKS)[number];

export type Environment = "staging" | "production";

/** The operator-configured rule set (the Autopilot Rules screen). */
export interface AutopilotRules {
  enabled: boolean;
  allowedTasks: AutopilotTask[];
  maxPagesPerRun: number;
  maxLinksPerPage: number;
  maxLinksToSameTarget: number;
  maxTotalChanges: number;
  minimumConfidence: number;
  /** Glob patterns that may never be modified. */
  protectedUrls: string[];
  /** Glob patterns excluded from this run. */
  excludedPatterns: string[];
  /** Page types (e.g. "product") excluded as SOURCES of edits. */
  excludedPageTypes: string[];
  allowedCms: string[];
  allowedEnvironments: Environment[];
  requireBackup: boolean;
  requireVerification: boolean;
  stopOnFirstError: boolean;
  rollbackOnVerificationFailure: boolean;
  /** How long an issued approval stays valid, in minutes. */
  approvalTtlMinutes: number;
}

/**
 * Safe defaults, matching the product requirement. Autopilot is OFF until the
 * operator turns it on, and is restricted to staging until they widen it.
 */
export const DEFAULT_AUTOPILOT_RULES: AutopilotRules = {
  enabled: false,
  allowedTasks: ["insert_internal_links"],
  maxPagesPerRun: 20,
  maxLinksPerPage: 3,
  maxLinksToSameTarget: 2,
  maxTotalChanges: 60,
  minimumConfidence: 0.8,
  protectedUrls: [],
  excludedPatterns: [],
  excludedPageTypes: ["product"],
  allowedCms: ["wordpress"],
  allowedEnvironments: ["staging"],
  requireBackup: true,
  requireVerification: true,
  stopOnFirstError: true,
  rollbackOnVerificationFailure: true,
  approvalTtlMinutes: 30,
};

/** One proposed edit, reduced to the facts Autopilot judges. */
export interface AutopilotCandidate {
  sourceUrl: string;
  targetUrl: string;
  sourceType: string;
  targetType: string;
  anchor: string;
  confidence: number;
  /** Destination technical state — all must be healthy to auto-apply. */
  targetIndexable: boolean;
  targetCanonical: boolean;
  targetStatus: number;
  /** True when the target is reached only via a redirect. */
  targetIsRedirect?: boolean;
  /** True when the anchor was not found naturally and needs a human. */
  needsEditorialReview: boolean;
}

export interface AutopilotContext {
  task: string;
  cms: string;
  environment: Environment;
  /** Whether a durable backup of every affected page exists. */
  backupPresent: boolean;
  /** Whether post-write verification is available on this connection. */
  verificationAvailable: boolean;
  /** Production writes flag — Autopilot never overrides it. */
  productionWritesEnabled: boolean;
  now?: number;
}

export interface SkippedCandidate {
  candidate: AutopilotCandidate;
  reason: string;
}

/** The approval shape `execute/engine.ts` consumes. */
export interface IssuedApproval {
  approvedRevisionHash: string;
  expiresAt: number;
}

export type AutopilotDecision =
  | {
      ok: true;
      approval: IssuedApproval;
      accepted: AutopilotCandidate[];
      skipped: SkippedCandidate[];
      notes: string[];
    }
  | { ok: false; reason: string; violations: string[]; skipped: SkippedCandidate[] };

/**
 * Preconditions that make the WHOLE run ineligible. These are checked before
 * any candidate, so a misconfigured run fails fast and loudly.
 */
function runBlockers(rules: AutopilotRules, ctx: AutopilotContext): string[] {
  const v: string[] = [];
  if (!rules.enabled) v.push("Autopilot is disabled.");
  if (!AUTOPILOT_ELIGIBLE_TASKS.includes(ctx.task as AutopilotTask)) {
    v.push(`Task "${ctx.task}" is never eligible for Autopilot.`);
  } else if (!rules.allowedTasks.includes(ctx.task as AutopilotTask)) {
    v.push(`Task "${ctx.task}" is not in the allowed task list.`);
  }
  if (!rules.allowedCms.includes(ctx.cms)) {
    v.push(`CMS "${ctx.cms}" is not in the allowed CMS list.`);
  }
  if (!rules.allowedEnvironments.includes(ctx.environment)) {
    v.push(`Environment "${ctx.environment}" is not permitted for Autopilot.`);
  }
  if (ctx.environment === "production" && !ctx.productionWritesEnabled) {
    v.push("Production writes are disabled.");
  }
  if (rules.requireBackup && !ctx.backupPresent) {
    v.push("A backup is required but none is available.");
  }
  if (rules.requireVerification && !ctx.verificationAvailable) {
    v.push("Post-write verification is required but not available on this connection.");
  }
  return v;
}

/** Per-candidate rejection reason, or null when the candidate is acceptable. */
function candidateBlocker(
  c: AutopilotCandidate,
  rules: AutopilotRules,
): string | null {
  if (c.sourceUrl === c.targetUrl) return "source and target are the same page";
  if (c.confidence < rules.minimumConfidence) {
    return `confidence ${c.confidence.toFixed(2)} is below the ${rules.minimumConfidence.toFixed(2)} floor`;
  }
  if (c.needsEditorialReview) return "anchor needs editorial review";
  if (c.targetStatus < 200 || c.targetStatus >= 300) {
    return `destination returns HTTP ${c.targetStatus}`;
  }
  if (c.targetIsRedirect) return "destination is a redirect";
  if (!c.targetIndexable) return "destination is noindex";
  if (!c.targetCanonical) return "destination is not the canonical URL";
  if (rules.excludedPageTypes.includes(c.sourceType)) {
    return `source page type "${c.sourceType}" is excluded`;
  }
  const guarded = [...rules.protectedUrls];
  if (guarded.length && (isProtected(c.sourceUrl, guarded) || isProtected(c.targetUrl, guarded))) {
    return "a protected URL is involved";
  }
  if (
    rules.excludedPatterns.some(
      (p) => matchesPattern(c.sourceUrl, p) || matchesPattern(c.targetUrl, p),
    )
  ) {
    return "matches an excluded URL pattern";
  }
  return null;
}

/**
 * Decide whether a batch may run unattended, and issue the approval if so.
 *
 * `revision` must already be built from the exact before/after content, so the
 * approval binds to `revision.revisionHash` — the same value the execute engine
 * re-checks. An approval is never issued for an empty batch.
 */
export function evaluateAutopilotBatch(
  candidates: AutopilotCandidate[],
  revision: Revision,
  rules: AutopilotRules,
  ctx: AutopilotContext,
): AutopilotDecision {
  const skipped: SkippedCandidate[] = [];

  const blockers = runBlockers(rules, ctx);
  if (blockers.length) {
    return {
      ok: false,
      reason: "Autopilot cannot run this batch.",
      violations: blockers,
      skipped: candidates.map((c) => ({ candidate: c, reason: "run was blocked" })),
    };
  }

  // Per-candidate filtering with running per-page and per-target counters.
  const perPage = new Map<string, number>();
  const perPair = new Map<string, number>();
  const accepted: AutopilotCandidate[] = [];
  const pages = new Set<string>();

  for (const c of candidates) {
    const why = candidateBlocker(c, rules);
    if (why) {
      skipped.push({ candidate: c, reason: why });
      if (rules.stopOnFirstError) {
        return {
          ok: false,
          reason: "A candidate violated the rules and Autopilot is set to stop on the first error.",
          violations: [`${c.sourceUrl} → ${c.targetUrl}: ${why}`],
          skipped,
        };
      }
      continue;
    }

    const onPage = perPage.get(c.sourceUrl) ?? 0;
    if (onPage >= rules.maxLinksPerPage) {
      skipped.push({ candidate: c, reason: `page already has ${rules.maxLinksPerPage} new links` });
      continue;
    }
    const pairKey = `${c.sourceUrl} ${c.targetUrl}`;
    const onPair = perPair.get(pairKey) ?? 0;
    if (onPair >= rules.maxLinksToSameTarget) {
      skipped.push({
        candidate: c,
        reason: `already links to this destination ${rules.maxLinksToSameTarget}×`,
      });
      continue;
    }
    if (!pages.has(c.sourceUrl) && pages.size >= rules.maxPagesPerRun) {
      skipped.push({ candidate: c, reason: `run already covers ${rules.maxPagesPerRun} pages` });
      continue;
    }
    if (accepted.length >= rules.maxTotalChanges) {
      skipped.push({ candidate: c, reason: `run already has ${rules.maxTotalChanges} changes` });
      continue;
    }

    accepted.push(c);
    pages.add(c.sourceUrl);
    perPage.set(c.sourceUrl, onPage + 1);
    perPair.set(pairKey, onPair + 1);
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      reason: "No candidate satisfied the Autopilot rules.",
      violations: ["Nothing was eligible to apply."],
      skipped,
    };
  }

  // The revision must describe exactly the pages we accepted — never more.
  const revisionUrls = new Set(revision.items.map((i) => i.url));
  const extra = [...revisionUrls].filter((u) => !pages.has(u));
  if (extra.length) {
    return {
      ok: false,
      reason: "The revision covers pages Autopilot did not accept.",
      violations: extra.map((u) => `${u} is in the revision but not in the accepted set`),
      skipped,
    };
  }

  const now = ctx.now ?? Date.now();
  const notes = [
    `Autopilot approved ${accepted.length} change(s) across ${pages.size} page(s).`,
    `Bound to revision ${revision.revisionHash.slice(0, 12)}; expires in ${rules.approvalTtlMinutes} min.`,
  ];
  if (skipped.length) notes.push(`${skipped.length} candidate(s) skipped by rule.`);

  return {
    ok: true,
    approval: {
      approvedRevisionHash: revision.revisionHash,
      expiresAt: now + rules.approvalTtlMinutes * 60_000,
    },
    accepted,
    skipped,
    notes,
  };
}

/** Validate a rule set before saving it, clamping to safe bounds. */
export function normalizeRules(input: Partial<AutopilotRules>): AutopilotRules {
  const r = { ...DEFAULT_AUTOPILOT_RULES, ...input };
  const clamp = (n: number, lo: number, hi: number, dflt: number) =>
    Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : dflt;
  return {
    ...r,
    // Only ever-eligible tasks survive, whatever was stored.
    allowedTasks: r.allowedTasks.filter((t): t is AutopilotTask =>
      AUTOPILOT_ELIGIBLE_TASKS.includes(t as AutopilotTask),
    ),
    maxPagesPerRun: clamp(r.maxPagesPerRun, 1, 200, 20),
    maxLinksPerPage: clamp(r.maxLinksPerPage, 1, 10, 3),
    maxLinksToSameTarget: clamp(r.maxLinksToSameTarget, 1, 5, 2),
    maxTotalChanges: clamp(r.maxTotalChanges, 1, 500, 60),
    approvalTtlMinutes: clamp(r.approvalTtlMinutes, 1, 240, 30),
    // Confidence floor can be raised but never dropped below 0.5.
    minimumConfidence: Number.isFinite(r.minimumConfidence)
      ? Math.min(1, Math.max(0.5, r.minimumConfidence))
      : 0.8,
  };
}
