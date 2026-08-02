import { PageHeader } from "@/components/page-header";

// Default posture = approval queue: nothing off the owned domain publishes
// until a human approves it here.
const queue = [
  {
    title: "How we think about AI citations",
    channel: "social",
    excerpt:
      "Answer engines don't rank pages — they synthesize answers from a few trusted sources. Here's how we earn that trust...",
  },
  {
    title: "Reply: 'What's the best way to show up in Perplexity?'",
    channel: "community",
    excerpt:
      "Draft answer for r/SEO citing our glossary page. Human must post — community auto-posting is disabled by policy.",
  },
];

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        eyebrow="04 · Approval Queue"
        title="Nothing ships without a human"
        lead="Approval-queue is the default posture. Owned-site and social can be promoted to auto-publish per channel; community and directory always stop here."
      />
      <div className="flex flex-col gap-3">
        {queue.map((q) => (
          <div
            key={q.title}
            className="rounded-xl border p-5"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}
              >
                {q.channel}
              </span>
              <h3 className="font-semibold">{q.title}</h3>
            </div>
            <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
              {q.excerpt}
            </p>
            <div className="flex gap-2">
              <button className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--good)" }}>
                Approve
              </button>
              <button className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ border: "1px solid var(--line)", color: "var(--ink)" }}>
                Edit
              </button>
              <button className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ border: "1px solid var(--line)", color: "var(--crit)" }}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
