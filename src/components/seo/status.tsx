/**
 * Shared status primitives for the SEO Command Center.
 *
 * These exist so that "connected", "read-only", "nothing was modified" look
 * the same on every screen and are never re-worded into something more
 * flattering. A status is rendered from data, never from an optimistic guess
 * about what an action probably did.
 */

import type { CapabilityCard, CapabilitySnapshot, CapabilityStatus } from "@/lib/status/capabilities";
import type { RunMode, StepStatus, WorkflowStep } from "@/lib/workflow/linking-run";

const TONE: Record<CapabilityStatus, { fg: string; dot: string }> = {
  ok: { fg: "var(--good)", dot: "var(--good)" },
  limited: { fg: "var(--warn)", dot: "var(--warn)" },
  off: { fg: "var(--ink-faint)", dot: "var(--ink-faint)" },
};

export function StatusChip({
  status,
  children,
}: {
  status: CapabilityStatus;
  children: React.ReactNode;
}) {
  const tone = TONE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
      style={{ borderColor: "var(--line)", color: tone.fg }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: tone.dot,
          display: "inline-block",
        }}
      />
      {children}
    </span>
  );
}

export function CapabilityCards({ snapshot }: { snapshot: CapabilitySnapshot }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(15rem,1fr))" }}>
      {snapshot.cards.map((c) => (
        <CapabilityTile key={c.key} card={c} />
      ))}
    </div>
  );
}

export function CapabilityTile({ card }: { card: CapabilityCard }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--line)", background: "var(--card)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
          {card.label}
        </span>
        <StatusChip status={card.status}>{card.value}</StatusChip>
      </div>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {card.detail}
      </p>
      {card.remedy && (
        <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
          → {card.remedy}
        </p>
      )}
    </div>
  );
}

const MODE_COPY: Record<RunMode, { label: string; detail: string; status: CapabilityStatus }> = {
  audit: {
    label: "AUDIT",
    detail: "Reads and reports. Nothing is written under any circumstances.",
    status: "ok",
  },
  preview: {
    label: "PREVIEW",
    detail: "Builds the exact change and shows it. Still writes nothing.",
    status: "limited",
  },
  execute: {
    label: "EXECUTE",
    detail: "Writes an approved revision, then verifies it on the live page.",
    status: "limited",
  },
};

export function ModeBadge({ mode }: { mode: RunMode }) {
  const m = MODE_COPY[mode];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="rounded px-2 py-0.5 text-xs font-semibold tracking-widest"
        style={{
          fontFamily: "var(--font-mono)",
          border: "1px solid var(--line)",
          color: mode === "execute" ? "var(--gold)" : "var(--teal)",
        }}
      >
        {m.label}
      </span>
      <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
        {m.detail}
      </span>
    </span>
  );
}

const STEP_MARK: Record<StepStatus, { mark: string; color: string }> = {
  ok: { mark: "✓", color: "var(--good)" },
  skipped: { mark: "—", color: "var(--ink-faint)" },
  failed: { mark: "✕", color: "var(--crit)" },
};

export function StepList({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="grid gap-1.5">
      {steps.map((s) => {
        const m = STEP_MARK[s.status];
        return (
          <li key={s.n} className="flex gap-3 text-sm">
            <span
              aria-hidden
              style={{ color: m.color, fontFamily: "var(--font-mono)", minWidth: "2.5rem" }}
            >
              {String(s.n).padStart(2, "0")} {m.mark}
            </span>
            <span style={{ color: s.status === "skipped" ? "var(--ink-faint)" : "var(--ink)" }}>
              <strong className="font-medium">{s.label}</strong>
              <span style={{ color: "var(--ink-faint)" }}> — {s.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The outcome banner. Deliberately the only place a run's result is phrased,
 * so "applied" can never be shown for a run that merely created a work order.
 */
export function OutcomeBanner({
  applied,
  rolledBack,
  workOrderOnly,
  message,
  mock,
}: {
  applied: boolean;
  rolledBack: boolean;
  workOrderOnly: boolean;
  message: string;
  mock: boolean;
}) {
  const tone: CapabilityStatus = applied ? "ok" : workOrderOnly || rolledBack ? "limited" : "off";
  const heading = applied
    ? mock
      ? "Applied to the mock site"
      : "Applied and verified"
    : rolledBack
      ? "Applied, then rolled back"
      : workOrderOnly
        ? "Work order created"
        : "No change made";
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: tone === "ok" ? "var(--good)" : tone === "limited" ? "var(--warn)" : "var(--line)",
        background: "var(--card)",
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <StatusChip status={tone}>{heading}</StatusChip>
        {mock && <StatusChip status="limited">MOCK — not a real website</StatusChip>}
      </div>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {message}
      </p>
    </div>
  );
}
