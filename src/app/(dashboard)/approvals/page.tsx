import { PageHeader } from "@/components/page-header";
import { ApprovalCard, type QueueItem } from "./approval-card";

// Default posture = approval queue: nothing off the owned domain publishes
// until a human approves it here. Sample rows until the pipeline fills the queue.
const queue: QueueItem[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    title: "How we think about AI citations",
    channel: "social",
    excerpt:
      "Answer engines don't rank pages — they synthesize answers from a few trusted sources. Here's how we earn that trust...",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
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
        lead="Approval-queue is the default posture. Owned-site and social can be promoted to auto-publish per channel; community and directory always stop here. Safety guards can also demote an auto-publish item to this queue."
      />
      <div className="flex flex-col gap-3">
        {queue.map((q) => (
          <ApprovalCard key={q.id} item={q} />
        ))}
      </div>
    </>
  );
}
