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
  /** Set once the change has been undone. Never cleared. */
  undoneAt: string | null;
  /** What the undo attempt reported, successful or not. */
  undoOutcome: string | null;
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
    undoneAt: null,
    undoOutcome: null,
  };
  state().runs.unshift(record);
  state().runs.splice(200); // keep the list bounded
  return record;
}

/**
 * Record the outcome of approving a work order.
 *
 * Without this the history lies by omission: `runCommandAction` records the
 * PREVIEW as "work order only — nothing modified", and if the operator then
 * approves it, nothing ever updates that story. The page would have been
 * changed and the history would still say nothing was. It also carries the
 * batch id, which is what makes the change undoable afterwards.
 */
export function recordApplication(input: {
  websiteId: string;
  workspaceId: string;
  instruction: string;
  batchId: string;
  revisionHash: string | null;
  applied: boolean;
  rolledBack: boolean;
  message: string;
  steps: WorkflowStep[];
  mock: boolean;
  candidates: { sourceUrl: string; targetUrl: string; anchor: string; confidence: number }[];
}): RunRecord {
  const record: RunRecord = {
    id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    websiteId: input.websiteId,
    workspaceId: input.workspaceId,
    instruction: input.instruction,
    mode: "execute",
    startedAt: input.steps[0]?.at ?? new Date().toISOString(),
    applied: input.applied,
    rolledBack: input.rolledBack,
    workOrderOnly: false,
    approvalSource: "human",
    revisionHash: input.revisionHash,
    batchId: input.batchId,
    message: input.message,
    candidateCount: input.candidates.length,
    chosen: input.candidates[0] ?? null,
    steps: input.steps,
    mock: input.mock,
    undoneAt: null,
    undoOutcome: null,
  };
  state().runs.unshift(record);
  state().runs.splice(200);
  return record;
}

/** Most recent first. */
export function listRuns(workspaceId: string, limit = 50): RunRecord[] {
  return state().runs.filter((r) => r.workspaceId === workspaceId).slice(0, limit);
}

export function getRun(id: string): RunRecord | null {
  return state().runs.find((r) => r.id === id) ?? null;
}

/**
 * Record the result of undoing a run.
 *
 * `applied` is deliberately left alone: the run DID apply a change, and the
 * history is a record of what happened, not of the current state. A successful
 * undo adds a fact; it does not erase one.
 */
export function markRunUndone(id: string, outcome: string, undone: boolean): RunRecord | null {
  const run = state().runs.find((r) => r.id === id);
  if (!run) return null;
  run.undoOutcome = outcome;
  if (undone) {
    run.undoneAt = new Date().toISOString();
    run.rolledBack = true;
  }
  return run;
}

/** Is this run something that could still be undone? */
export function isUndoable(r: RunRecord): boolean {
  return r.applied && !r.undoneAt;
}

/** One-line summary of what a run actually did. Never optimistic. */
export function outcomeLabel(r: RunRecord): string {
  if (r.undoneAt) return "Applied, then undone";
  if (r.applied) return r.mock ? "Applied (mock site)" : "Applied and verified";
  if (r.rolledBack) return "Applied, then rolled back";
  if (r.workOrderOnly) return "Work order only — nothing modified";
  return "No change";
}

export function __resetRunHistory(): void {
  g.__seoRunHistory = { runs: [] };
}
