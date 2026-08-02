import { PageHeader } from "@/components/page-header";
import { getApprovalQueue } from "@/lib/data/queries";
import { ApprovalCard } from "./approval-card";

export default async function ApprovalsPage() {
  const queue = await getApprovalQueue();
  return (
    <>
      <PageHeader
        eyebrow="04 · Approval Queue"
        title="Nothing ships without a human"
        lead="Approval-queue is the default posture. Owned-site and social can be promoted to auto-publish per channel; community and directory always stop here. Safety guards can also demote an auto-publish item to this queue."
      />
      {queue.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-faint)" }}>
          Queue is clear. Run a content cycle from the dashboard to draft new assets.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {queue.map((q) => (
            <ApprovalCard key={q.id} item={{ id: q.id, title: q.title, channel: q.channel, excerpt: q.excerpt }} />
          ))}
        </div>
      )}
    </>
  );
}
