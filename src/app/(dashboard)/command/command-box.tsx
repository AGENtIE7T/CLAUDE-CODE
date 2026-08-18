"use client";

import { useState, useTransition } from "react";
import { planCommandAction } from "./actions";
import type { CommandDecision } from "@/lib/command/process";

const EXAMPLES = [
  "Audit my website and find broken internal links",
  "Find relevant links from blog articles to service category pages. Do not touch product pages. No more than two links per article. Show a preview only.",
  "Suggest title tags and meta descriptions for the blog, limit to 20 pages",
  "Buy 500 backlinks for my homepage",
];

export function CommandBox() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [decision, setDecision] = useState<(CommandDecision & { echo: string }) | null>(null);

  function run(instruction: string) {
    setText(instruction);
    start(async () => setDecision(await planCommandAction(instruction)));
  }

  return (
    <div className="grid gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text);
        }}
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--line)", background: "var(--card)" }}
      >
        <label className="text-sm font-medium">Type a command in plain English</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "transparent" }}
          placeholder="e.g. Audit my website and find orphan pages"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: "var(--ink)", color: "var(--bg)", opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Planning…" : "Plan it"}
          </button>
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
            Default mode is AUDIT. Nothing runs until you review the plan.
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
            {ex.length > 48 ? ex.slice(0, 48) + "…" : ex}
          </button>
        ))}
      </div>

      {decision && <DecisionCard decision={decision} />}
    </div>
  );
}

function DecisionCard({ decision }: { decision: CommandDecision & { echo: string } }) {
  const border =
    decision.kind === "refused" ? "#c0392b" : decision.kind === "clarify" ? "#b7791f" : "var(--line)";
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: border, background: "var(--card)" }}>
      <p className="mb-2 text-xs uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
        {decision.kind === "ready" ? "Plan ready" : decision.kind === "clarify" ? "Needs clarification" : "Refused"}
      </p>

      {decision.kind === "refused" && (
        <>
          <p className="text-sm" style={{ color: "#c0392b" }}>{decision.reason}</p>
          {decision.alternative && (
            <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
              ✅ Legitimate alternative: {decision.alternative}
            </p>
          )}
        </>
      )}

      {decision.kind === "clarify" && (
        <ul className="list-disc pl-5 text-sm" style={{ color: "var(--ink-soft)" }}>
          {decision.questions.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      )}

      {decision.kind === "ready" && (
        <>
          <p className="text-sm font-medium">{decision.summary}</p>
          {decision.requiresApproval && (
            <p className="mt-2 text-sm" style={{ color: "var(--gold, #b7791f)" }}>
              ⚠ This is a write operation — it will require explicit approval of an exact revision before anything changes.
            </p>
          )}
          {decision.warnings.length > 0 && (
            <ul className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
              {decision.warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}
          <pre
            className="mt-3 overflow-x-auto rounded-md p-3 text-xs"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", fontFamily: "var(--font-mono)" }}
          >
            {JSON.stringify(decision.plan, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
