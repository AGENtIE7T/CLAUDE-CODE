"use client";

import { useEffect, useState, type ReactNode } from "react";
import { STAGE_COPY, type Stage } from "@/lib/client";

export function Collapsible({ title, children, defaultOpen = false, badge }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card p-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="h2">{title}</span>
        <span className="flex items-center gap-2">
          {badge}
          <span className={`text-zinc-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>
      {open && <div className="border-t border-zinc-100 p-4 pt-3 dark:border-zinc-800">{children}</div>}
    </section>
  );
}

export function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-zinc-500">—</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function CopyButton({ getText, label, className = "btn-ghost" }: { getText: () => string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const { copyText } = await import("@/lib/client");
        const ok = await copyText(getText());
        setState(ok ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      {state === "ok" ? "Copied ✓" : state === "fail" ? "Copy failed" : label}
    </button>
  );
}

const ORDER: Stage[] = ["audience", "writing", "critic", "finalising"];

export function Progress({ stage }: { stage: Stage }) {
  const idx = ORDER.indexOf(stage);
  return (
    <div className="card space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <p className="text-lg font-bold">{STAGE_COPY[stage]}</p>
      </div>
      <ol className="space-y-1 text-sm">
        {ORDER.map((s, i) => (
          <li key={s} className={i < idx ? "text-emerald-600 dark:text-emerald-400" : i === idx ? "font-semibold" : "text-zinc-400"}>
            {i < idx ? "✓" : i === idx ? "•" : "○"} {STAGE_COPY[s]}
          </li>
        ))}
      </ol>
      <p className="hint">Usually 1-3 minutes. Don&apos;t close this tab.</p>
    </div>
  );
}

export function ErrorBox({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry?: () => void }) {
  return (
    <div className="card border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" role="alert">
      <p className="font-semibold text-red-700 dark:text-red-300">Arre, kuch gadbad ho gayi.</p>
      <p className="mt-1 text-sm">{message}</p>
      {requestId && <p className="hint">Request id: {requestId}</p>}
      {onRetry && (
        <button type="button" className="btn-primary mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card py-10 text-center">
      <p className="text-lg font-bold">{title}</p>
      <div className="mx-auto mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{children}</div>
    </div>
  );
}

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}
