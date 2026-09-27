"use client";

import { useState, useTransition } from "react";
import { StatusChip } from "@/components/seo/status";
import { undoRunAction } from "../command/run-action";

/**
 * Undo a run that actually applied a change.
 *
 * Restores the exact bytes captured before the write. A partial restore is
 * reported as a failure naming the pages that did not come back — "mostly
 * undone" is not undone, and the operator needs to know which pages to look at.
 */
export function UndoRunButton({ runId }: { runId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof undoRunAction>> | null>(null);

  if (result?.ok) {
    return (
      <p className="text-sm" style={{ color: "var(--good)" }}>
        {result.message}
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <button
        onClick={() => start(async () => setResult(await undoRunAction(runId)))}
        disabled={pending}
        className="justify-self-start rounded-md border px-3 py-1.5 text-xs"
        style={{ borderColor: "var(--line)", color: "var(--ink-soft)", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Undoing…" : "Undo this change"}
      </button>
      {result && !result.ok && (
        <div className="grid gap-1">
          <StatusChip status="off">Not undone</StatusChip>
          <p className="text-xs" style={{ color: "var(--crit)" }}>
            {result.message}
          </p>
          {result.restored.length > 0 && (
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              Restored: {result.restored.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
