import { PageHeader } from "@/components/page-header";
import { getCalendar } from "@/lib/data/queries";
import type { ContentStatus } from "@/lib/types";

const statusColor: Record<ContentStatus, string> = {
  scheduled: "var(--teal)",
  approved: "var(--good)",
  published: "var(--good)",
  pending_approval: "var(--warn)",
  draft: "var(--ink-faint)",
  rejected: "var(--crit)",
  failed: "var(--crit)",
};

export default async function CalendarPage() {
  const items = await getCalendar();
  return (
    <>
      <PageHeader
        eyebrow="03 · Content Calendar"
        title="What's shipping, and when"
        lead="Everything drafted, scheduled, and live across all channels — spaced by the cadence engine so accounts stay human and within platform limits."
      />
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          >
            <div>
              <p className="font-medium">{it.title}</p>
              <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                {it.channel}
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ color: statusColor[it.status], border: `1px solid ${statusColor[it.status]}` }}
            >
              {it.status.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
