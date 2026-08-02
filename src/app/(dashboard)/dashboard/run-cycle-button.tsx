"use client";

import { useState, useTransition } from "react";
import { triggerCycle } from "./actions";

export function RunCycleButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mb-6 flex items-center gap-3">
      <button
        onClick={() =>
          start(async () => {
            const res = await triggerCycle();
            setMsg(res.ok ? `Drafted “${res.title}” → approval queue` : "Cycle not available in live mode yet.");
          })
        }
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--teal)" }}
      >
        {pending ? "Running cycle…" : "▶ Run a content cycle"}
      </button>
      {msg && (
        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
