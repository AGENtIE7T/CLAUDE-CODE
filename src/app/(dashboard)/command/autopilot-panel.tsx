"use client";

import { useState, useTransition } from "react";
import { runAutopilotAction, type AutopilotReport } from "./autopilot-action";

/**
 * One-click autopilot demo: runs the full autonomous loop and shows the
 * before/after HTML of the page it edited, proving the end-to-end write path.
 */
export function AutopilotPanel() {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<AutopilotReport | null>(null);

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold">Autopilot (demo)</h3>
        <span className="rounded-full px-2 py-0.5 text-xs"
          style={{ border: "1px solid var(--line)", color: "var(--ink-faint)" }}>
          crawl → audit → link → approve → execute → verify
        </span>
      </div>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
        Runs the entire internal-linking loop by itself on a seeded demo site and
        actually inserts + verifies the link. In production this same loop holds
        for human approval until writes are explicitly enabled.
      </p>

      <button
        onClick={() => start(async () => setReport(await runAutopilotAction()))}
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-medium"
        style={{ background: "var(--ink)", color: "var(--bg)", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Running…" : "▶ Run autopilot"}
      </button>

      {report && (
        <div className="mt-4 text-sm">
          <p style={{ color: report.executed ? "var(--good, #2f855a)" : "var(--gold, #b7791f)" }}>
            {report.executed ? "✓ " : "• "}{report.message}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
            stage: {report.stage} · candidates: {report.candidateCount} · audit findings: {report.auditFindings}
          </p>
          {report.before && report.after && report.before !== report.after && (
            <div className="mt-3 grid gap-2">
              <div>
                <p className="text-xs" style={{ color: "var(--ink-faint)" }}>before</p>
                <pre className="overflow-x-auto rounded-md p-2 text-xs"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", fontFamily: "var(--font-mono)" }}>{report.before}</pre>
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--ink-faint)" }}>after (autopilot inserted the link)</p>
                <pre className="overflow-x-auto rounded-md p-2 text-xs"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", fontFamily: "var(--font-mono)" }}>{report.after}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
