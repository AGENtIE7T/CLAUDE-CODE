"use client";

import { useState, useTransition } from "react";
import { approveContent, rejectContent } from "./actions";

export interface QueueItem {
  id: string;
  title: string;
  channel: string;
  excerpt: string;
}

export function ApprovalCard({ item }: { item: QueueItem }) {
  const [pending, startTransition] = useTransition();
  const [resolved, setResolved] = useState<"approved" | "rejected" | null>(null);

  function act(decision: "approved" | "rejected") {
    startTransition(async () => {
      const res = decision === "approved" ? await approveContent(item.id) : await rejectContent(item.id);
      if (res.ok) setResolved(decision);
    });
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--line)", background: "var(--card)", opacity: resolved ? 0.55 : 1 }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ border: "1px solid var(--line)", color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}
        >
          {item.channel}
        </span>
        <h3 className="font-semibold">{item.title}</h3>
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
        {item.excerpt}
      </p>
      {resolved ? (
        <p className="text-sm font-medium" style={{ color: resolved === "approved" ? "var(--good)" : "var(--crit)" }}>
          {resolved === "approved" ? "Approved — queued to publish." : "Rejected."}
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => act("approved")}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--good)" }}
          >
            {pending ? "…" : "Approve"}
          </button>
          <button
            onClick={() => act("rejected")}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ border: "1px solid var(--line)", color: "var(--crit)" }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
