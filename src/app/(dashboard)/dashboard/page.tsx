import { PageHeader } from "@/components/page-header";
import { getVisibility } from "@/lib/data/queries";
import { RunCycleButton } from "./run-cycle-button";

export default async function DashboardPage() {
  const sov = await getVisibility();

  return (
    <>
      <PageHeader
        eyebrow="01 · Visibility"
        title="Are we getting cited?"
        lead="Share-of-voice per answer engine — the fraction of your target prompts where your brand is mentioned. This is the number the customer renews for."
      />
      <RunCycleButton />
      {sov.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-faint)" }}>
          No measurements yet. Connect channels and run a cycle to populate this.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sov.map((s) => {
            const delta = s.now - s.prev;
            return (
              <div
                key={s.engine}
                className="rounded-xl border p-5"
                style={{ borderColor: "var(--line)", background: "var(--card)" }}
              >
                <p className="text-sm" style={{ color: "var(--ink-faint)" }}>
                  {s.label}
                </p>
                <p className="my-1 text-3xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {s.now}%
                </p>
                <p className="text-xs" style={{ color: delta >= 0 ? "var(--good)" : "var(--crit)" }}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs. last cycle
                </p>
                <div className="mt-3 h-1.5 w-full rounded-full" style={{ background: "var(--line)" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${s.now}%`, background: "var(--gold)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
