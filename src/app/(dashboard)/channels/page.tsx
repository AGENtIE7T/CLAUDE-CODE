import { PageHeader } from "@/components/page-header";
import type { AutonomyLevel, ChannelKind } from "@/lib/types";

const channels: {
  kind: ChannelKind;
  label: string;
  connected: boolean;
  autonomy: AutonomyLevel;
  note: string;
}[] = [
  { kind: "owned_site", label: "Owned site / blog", connected: true, autonomy: "fully_auto", note: "Your property — safe to auto-publish." },
  { kind: "social", label: "LinkedIn / X", connected: false, autonomy: "approval_queue", note: "Auto with cadence limits once connected." },
  { kind: "directory", label: "Directories (G2, Capterra)", connected: false, autonomy: "approval_queue", note: "Assisted, one-time, human-verified." },
  { kind: "community", label: "Reddit / Quora", connected: false, autonomy: "approval_queue", note: "Draft-only. Auto-posting disabled by policy (ToS)." },
];

const autonomyLabel: Record<AutonomyLevel, string> = {
  approval_queue: "Approval queue",
  semi_auto: "Semi-auto",
  fully_auto: "Fully auto",
};

export default function ChannelsPage() {
  return (
    <>
      <PageHeader
        eyebrow="05 · Channels"
        title="Where we publish, and how autonomously"
        lead="Connect destinations and set a per-channel autonomy level. Community and directory are capped at approval-queue by policy, whatever the level says."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {channels.map((c) => (
          <div
            key={c.kind}
            className="rounded-xl border p-5"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold">{c.label}</h3>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background: c.connected ? "var(--good)" : "transparent",
                  color: c.connected ? "#fff" : "var(--ink-faint)",
                  border: c.connected ? "none" : "1px solid var(--line)",
                }}
              >
                {c.connected ? "connected" : "not connected"}
              </span>
            </div>
            <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
              {c.note}
            </p>
            <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
              autonomy: {autonomyLabel[c.autonomy]}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
