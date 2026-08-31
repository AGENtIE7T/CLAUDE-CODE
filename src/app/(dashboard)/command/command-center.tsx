"use client";

import { useState, useTransition } from "react";
import {
  CapabilityCards,
  ModeBadge,
  OutcomeBanner,
  StatusChip,
  StepList,
} from "@/components/seo/status";
import type { CapabilitySnapshot } from "@/lib/status/capabilities";
import type { LinkCandidate } from "@/lib/linking/engine";
import {
  approveWorkOrderAction,
  rejectWorkOrderAction,
  runCommandAction,
  type ApprovalResult,
  type CommandRunResult,
} from "./run-action";

const EXAMPLES = [
  "Automatically add relevant internal links from my blog posts to my service pages. Use natural anchors, maximum three links per article, do not touch /checkout, and only apply links scoring 0.80 or higher.",
  "Find relevant links from blog articles to service pages. Show a preview only.",
  "Audit my website and find internal-link opportunities",
  "Buy 500 backlinks for my homepage",
];

export interface WebsiteChoice {
  id: string;
  name: string;
  url: string;
}

export function CommandCenter({
  initial,
  websites,
}: {
  initial: CapabilitySnapshot;
  websites: WebsiteChoice[];
}) {
  const [text, setText] = useState("");
  const [websiteId, setWebsiteId] = useState(websites[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CommandRunResult | null>(null);
  const [approval, setApproval] = useState<ApprovalResult | null>(null);

  function run(instruction: string) {
    setText(instruction);
    setApproval(null);
    start(async () => setResult(await runCommandAction(instruction, websiteId || undefined)));
  }

  const caps = result?.capabilities ?? initial;

  return (
    <div className="grid gap-6">
      <CapabilityCards snapshot={caps} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text);
        }}
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--line)", background: "var(--card)" }}
      >
        {websites.length > 1 && (
          <label htmlFor="website" className="mb-3 block">
            <span className="text-sm font-medium">Which website?</span>
            <select
              id="website"
              value={websiteId}
              onChange={(e) => setWebsiteId(e.target.value)}
              className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink)" }}
            >
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.url}
                </option>
              ))}
            </select>
          </label>
        )}

        <label htmlFor="instruction" className="text-sm font-medium">
          Tell it what to do, in your own words
        </label>
        <textarea
          id="instruction"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "transparent", color: "var(--ink)" }}
          placeholder="e.g. Add internal links from my blog posts to my service pages, maximum three per article, preview only."
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: "var(--ink)", color: "var(--bg)", opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Working…" : "Run it"}
          </button>
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
            Default mode is AUDIT. A change is only written after an approval bound to the exact preview.
          </span>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => run(ex)}
            className="rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
          >
            {ex.length > 62 ? `${ex.slice(0, 62)}…` : ex}
          </button>
        ))}
      </div>

      {result && (
        <>
          <DecisionPanel result={result} />
          {result.run && <RunPanel result={result} />}
          {result.workOrder && result.workOrder.status === "pending" && !approval && (
            <WorkOrderPanel
              id={result.workOrder.id}
              candidates={result.workOrder.candidates}
              revisionHash={result.workOrder.revision.revisionHash}
              expiresAt={result.workOrder.expiresAt}
              canWrite={caps.canWrite}
              writeBlockedMessage={caps.writeBlockedMessage}
              onDecide={(fn) => start(async () => setApproval(await fn()))}
              pending={pending}
            />
          )}
          {approval && (
            <div className="grid gap-3">
              <OutcomeBanner
                applied={approval.applied}
                rolledBack={approval.rolledBack}
                workOrderOnly={!approval.applied && !approval.rolledBack}
                message={approval.message}
                mock={result.run?.mock ?? false}
              />
              {approval.steps.length > 0 && (
                <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
                  <StepList steps={approval.steps} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── the plan ───────────────────────────────────────────────────────────────

function DecisionPanel({ result }: { result: CommandRunResult }) {
  const d = result.decision;
  const border = d.kind === "refused" ? "var(--crit)" : d.kind === "clarify" ? "var(--warn)" : "var(--line)";

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: border, background: "var(--card)" }}>
      <p className="mb-3 text-xs uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
        {d.kind === "ready" ? "Task plan" : d.kind === "clarify" ? "Needs clarification" : "Refused"}
      </p>

      {d.kind === "refused" && (
        <>
          <p className="text-sm" style={{ color: "var(--crit)" }}>{d.reason}</p>
          {d.alternative && (
            <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
              What can be done instead: {d.alternative}
            </p>
          )}
        </>
      )}

      {d.kind === "clarify" && (
        <>
          <p className="mb-2 text-sm" style={{ color: "var(--ink-soft)" }}>
            Nothing has run. Answer these and send the instruction again:
          </p>
          <ul className="list-disc pl-5 text-sm" style={{ color: "var(--ink)" }}>
            {d.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}

      {d.kind === "ready" && (
        <>
          <div className="mb-3">
            <ModeBadge mode={d.plan.mode} />
          </div>
          <p className="text-sm font-medium">{d.summary}</p>

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Row k="Task" v={d.plan.task_type.replace(/_/g, " ")} />
            <Row k="Approval required" v={d.requiresApproval ? "Yes — an exact revision must be approved" : "No — nothing will be written"} />
            <Row k="Page limit" v={String(d.plan.scope.page_limit)} />
            <Row k="Minimum confidence" v={d.plan.constraints.minimum_confidence.toFixed(2)} />
            {d.plan.constraints.max_links_per_page !== undefined && (
              <Row k="Links per page" v={`≤ ${d.plan.constraints.max_links_per_page}`} />
            )}
            {d.plan.constraints.max_links_to_same_target !== undefined && (
              <Row k="Links to same destination" v={`≤ ${d.plan.constraints.max_links_to_same_target}`} />
            )}
            {d.plan.scope.include_patterns.length > 0 && (
              <Row k="Include" v={d.plan.scope.include_patterns.join(", ")} />
            )}
            {d.plan.scope.exclude_patterns.length > 0 && (
              <Row k="Exclude" v={d.plan.scope.exclude_patterns.join(", ")} />
            )}
            {d.rules.protectedUrls.length > 0 && (
              <Row k="Protected by your instruction" v={d.rules.protectedUrls.join(", ")} />
            )}
            <Row
              k="Unattended requested"
              v={d.rules.autopilotRequested ? "Yes — Autopilot rules will decide" : "No"}
            />
          </dl>

          {d.warnings.length > 0 && (
            <ul className="mt-3 grid gap-1 text-xs" style={{ color: "var(--ink-faint)" }}>
              {d.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
        {k}
      </dt>
      <dd style={{ color: "var(--ink)" }}>{v}</dd>
    </div>
  );
}

// ── what the run actually did ──────────────────────────────────────────────

function RunPanel({ result }: { result: CommandRunResult }) {
  const run = result.run!;
  return (
    <div className="grid gap-4">
      <OutcomeBanner
        applied={run.applied}
        rolledBack={run.rolledBack}
        workOrderOnly={run.workOrderOnly}
        message={run.message}
        mock={run.mock}
      />

      <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-2 font-semibold">What happened, step by step</h3>
          <StatusChip status="limited">{run.pagesRead} page(s) read</StatusChip>
          <StatusChip status={run.approvalSource === "none" ? "off" : "ok"}>
            approval: {run.approvalSource}
          </StatusChip>
          {run.injectionFlags.length > 0 && (
            <StatusChip status="limited">
              {run.injectionFlags.length} page(s) with instruction-like text (ignored)
            </StatusChip>
          )}
        </div>
        <StepList steps={run.steps} />
      </div>

      {run.candidates.length > 0 && <Recommendations candidates={run.candidates} />}
    </div>
  );
}

function Recommendations({ candidates }: { candidates: LinkCandidate[] }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
      <h3 className="mb-1 font-semibold">Internal-link recommendations</h3>
      <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
        Every score is the weighted total of seven measured factors. Nothing here
        has been written to your website.
      </p>
      <div className="grid gap-3">
        {candidates.slice(0, 20).map((c, i) => (
          <div key={i} className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm">
                <strong>“{c.anchor}”</strong> → <span style={{ color: "var(--teal)" }}>{c.targetUrl}</span>
              </span>
              <StatusChip status={c.confidence >= 0.9 ? "ok" : "limited"}>
                {c.confidence.toFixed(2)}
              </StatusChip>
            </div>
            <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
              on {c.sourceUrl}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              {c.reason}
            </p>
            {c.sentence && (
              <p className="mt-1 text-xs italic" style={{ color: "var(--ink-faint)" }}>
                “…{c.sentence.slice(0, 160)}…”
              </p>
            )}
            {c.needsEditorialReview && (
              <p className="mt-1 text-xs" style={{ color: "var(--warn)" }}>
                Needs an editor: no natural anchor was found in the body text.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── approval ───────────────────────────────────────────────────────────────

function WorkOrderPanel({
  id,
  candidates,
  revisionHash,
  expiresAt,
  canWrite,
  writeBlockedMessage,
  onDecide,
  pending,
}: {
  id: string;
  candidates: { sourceUrl: string; targetUrl: string; anchor: string; confidence: number }[];
  revisionHash: string;
  expiresAt: number;
  canWrite: boolean;
  writeBlockedMessage: string | null;
  onDecide: (fn: () => Promise<ApprovalResult>) => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--warn)", background: "var(--card)" }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Work order — awaiting your approval</h3>
        <StatusChip status="limited">nothing written yet</StatusChip>
        <StatusChip status="limited">
          {candidates.length === 1 ? "1 link" : `${candidates.length} links`} ·{" "}
          {new Set(candidates.map((c) => c.sourceUrl)).size} page(s)
        </StatusChip>
      </div>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
        Approving this approves these exact bytes. If any page changes before you
        approve, the write is refused rather than applied to different content.
      </p>

      <ul className="mb-3 grid gap-2">
        {candidates.map((c, i) => (
          <li
            key={`${c.sourceUrl}-${c.targetUrl}-${i}`}
            className="rounded-lg border p-3 text-sm"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <strong>“{c.anchor}”</strong> → <span style={{ color: "var(--teal)" }}>{c.targetUrl}</span>
              </span>
              <StatusChip status={c.confidence >= 0.9 ? "ok" : "limited"}>
                {c.confidence.toFixed(2)}
              </StatusChip>
            </div>
            <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
              on {c.sourceUrl}
            </p>
          </li>
        ))}
      </ul>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Row k="Revision" v={revisionHash.slice(0, 16)} />
        <Row k="Approval expires" v={new Date(expiresAt).toLocaleString()} />
      </dl>

      {!canWrite && writeBlockedMessage && (
        <p className="mt-3 rounded-md border p-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--warn)" }}>
          {writeBlockedMessage}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => onDecide(() => approveWorkOrderAction(id))}
          disabled={pending || !canWrite}
          title={canWrite ? undefined : writeBlockedMessage ?? undefined}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{
            background: canWrite ? "var(--ink)" : "transparent",
            color: canWrite ? "var(--bg)" : "var(--ink-faint)",
            border: canWrite ? "none" : "1px solid var(--line)",
            opacity: pending ? 0.6 : 1,
          }}
        >
          Approve and apply
        </button>
        <button
          onClick={() => onDecide(() => rejectWorkOrderAction(id))}
          disabled={pending}
          className="rounded-md border px-4 py-2 text-sm"
          style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
