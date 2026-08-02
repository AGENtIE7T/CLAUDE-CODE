import { PageHeader } from "@/components/page-header";
import type { AnswerEngine } from "@/lib/types";

// Placeholder series until the visibility probe writes real rows.
const sov: { engine: AnswerEngine; label: string; now: number; prev: number }[] = [
  { engine: "chatgpt", label: "ChatGPT", now: 34, prev: 11 },
  { engine: "perplexity", label: "Perplexity", now: 41, prev: 18 },
  { engine: "google_ai_overviews", label: "Google AI Overviews", now: 22, prev: 6 },
  { engine: "claude", label: "Claude", now: 29, prev: 14 },
  { engine: "gemini", label: "Gemini", now: 19, prev: 9 },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="01 · Visibility"
        title="Are we getting cited?"
        lead="Share-of-voice per answer engine — the fraction of your target prompts where your brand is mentioned. This is the number the customer renews for."
      />
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
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${s.now}%`, background: "var(--gold)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs" style={{ color: "var(--ink-faint)" }}>
        Sample data. Live figures populate once channels are connected and the
        visibility probe runs its first measurement cycle.
      </p>
    </>
  );
}
