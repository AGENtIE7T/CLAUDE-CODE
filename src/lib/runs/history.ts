/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Execution history — what was proposed, what was applied, what was undone.
 * ─────────────────────────────────────────────────────────────────────────
 *  The history is the answer to "did that actually change my website?", so it
 *  stores only observed outcomes. `applied` comes from the execute engine's
 *  post-write verification, never from the fact that a write was attempted,
 *  and `rolledBack` comes from a verified restore. A run that produced a work
 *  order and nothing else is recorded as exactly that.
 *
 *  Every record keeps its full step list, so the UI can show why a run stopped
 *  where it did rather than just that it "failed".
 */

import type { LinkingRunResult, RunMode, WorkflowStep } from "@/lib/workflow/linking-run";

export interface RunRecord {
  id: string;
  websiteId: string;
  workspaceId: string;
  instruction: string;
  mode: RunMode;
  startedAt: string;
  /** Observed, not intended. */
  applied: boolean;
  rolledBack: boolean;
  workOrderOnly: boolean;
  approvalSource: LinkingRunResult["approvalSource"];
  revisionHash: string | null;
  batchId: string;
  message: string;
  candidateCount: number;
  chosen: { sourceUrl: string; targetUrl: string; anchor: string; confidence: number } | null;
  steps: WorkflowStep[];
  mock: boolean;
}

interface HistoryState {
  runs: RunRecord[];
}

const g = globalThis as unknown as { __seoRunHistory?: HistoryState };

function state(): HistoryState {
  if (!g.__seoRunHistory) g.__seoRunHistory = { runs: [] };
  return g.__seoRunHistory;
}

export function recordRun(
  input: { websiteId: string; workspaceId: string; instruction: string },
  result: LinkingRunResult,
): RunRecord {
  const record: RunRecord = {
    id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    websiteId: input.websiteId,
    workspaceId: input.workspaceId,
    instruction: input.instruction,
    mode: result.mode,
    startedAt: result.steps[0]?.at ?? new Date().toISOString(),
    applied: result.applied,
    rolledBack: result.rolledBack,
    workOrderOnly: result.workOrderOnly,
    approvalSource: result.approvalSource,
    revisionHash: result.revisionHash,
    batchId: result.batchId,
    message: result.message,
    candidateCount: result.candidates.length,
    chosen: result.chosen
      ? {
          sourceUrl: result.chosen.sourceUrl,
          targetUrl: result.chosen.targetUrl,
          anchor: result.chosen.anchor,
          confidence: result.chosen.confidence,
        }
      : null,
    steps: result.steps,
    mock: result.mock,
  };
  state().runs.unshift(record);
  state().runs.splice(200); // keep the list bounded
  return record;
}

/** Most recent first. */
export function listRuns(workspaceId: string, limit = 50): RunRecord[] {
  return state().runs.filter((r) => r.workspaceId === workspaceId).slice(0, limit);
}

export function getRun(id: string): RunRecord | null {
  return state().runs.find((r) => r.id === id) ?? null;
}

/** One-line summary of what a run actually did. Never optimistic. */
export function outcomeLabel(r: RunRecord): string {
  if (r.applied) return r.mock ? "Applied (mock site)" : "Applied and verified";
  if (r.rolledBack) return "Applied, then rolled back";
  if (r.workOrderOnly) return "Work order only — nothing modified";
  return "No change";
}

export function __resetRunHistory(): void {
  g.__seoRunHistory = { runs: [] };
}
