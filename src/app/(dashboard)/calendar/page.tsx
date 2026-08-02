import { PageHeader } from "@/components/page-header";

const items = [
  { title: "What is answer engine optimization?", channel: "owned_site", when: "Today", status: "scheduled" },
  { title: "AEO vs SEO", channel: "owned_site", when: "Tomorrow", status: "approved" },
  { title: "How we think about AI citations", channel: "social", when: "Wed", status: "pending_approval" },
  { title: "Best AEO tools in 2026", channel: "owned_site", when: "Thu", status: "draft" },
];

const statusColor: Record<string, string> = {
  scheduled: "var(--teal)",
  approved: "var(--good)",
  pending_approval: "var(--warn)",
  draft: "var(--ink-faint)",
};

export default function CalendarPage() {
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
            key={it.title}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          >
            <div>
              <p className="font-medium">{it.title}</p>
              <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                {it.channel} · {it.when}
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
