import { PageHeader } from "@/components/page-header";
import { StatusChip, StepList } from "@/components/seo/status";
import { listRuns, outcomeLabel } from "@/lib/runs/history";
import { listWorkOrders } from "@/lib/runs/work-orders";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";

export const dynamic = "force-dynamic";

const ORDER_TONE = {
  pending: "limited",
  approved: "limited",
  applied: "ok",
  rejected: "off",
  expired: "off",
  failed: "off",
} as const;

export default async function RunsPage() {
  const runs = listRuns(DEMO_WORKSPACE_ID);
  const orders = listWorkOrders(DEMO_WORKSPACE_ID);

  return (
    <>
      <PageHeader
        eyebrow="SEO · History"
        title="Everything that ran, and what it actually changed"
        lead="A run is recorded by what was observed, not by what was attempted. “Applied” appears only after the page was re-read and matched the approved revision; a run that produced a work order is recorded as exactly that."
      />

      <div className="grid gap-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Work orders</h2>
          {orders.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              No work orders yet. One is created whenever a change is proposed but not applied.
            </p>
          ) : (
            <div className="grid gap-3">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--line)", background: "var(--card)" }}
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      {o.candidates.length === 1 ? (
                        <>
                          <strong>“{o.candidates[0].anchor}”</strong> → {o.candidates[0].targetUrl}
                        </>
                      ) : (
                        <strong>
                          {o.candidates.length} links across{" "}
                          {new Set(o.candidates.map((c) => c.sourceUrl)).size} page(s)
                        </strong>
                      )}
                    </span>
                    <StatusChip status={ORDER_TONE[o.status]}>{o.status}</StatusChip>
                  </div>
                  {o.candidates.length > 1 && (
                    <ul className="mb-1 grid gap-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>
                      {o.candidates.map((c, i) => (
                        <li key={`${c.sourceUrl}-${c.targetUrl}-${i}`}>
                          “{c.anchor}” → {c.targetUrl}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                    {o.candidates.length === 1 ? `on ${o.candidates[0].sourceUrl} · ` : ""}revision{" "}
                    {o.revision.revisionHash.slice(0, 16)} · created{" "}
                    {new Date(o.createdAt).toLocaleString()}
                  </p>
                  {o.outcome && (
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
                      {o.outcome}
                    </p>
                  )}
                  {o.status === "expired" && (
                    <p className="mt-1 text-sm" style={{ color: "var(--warn)" }}>
                      The preview is too old to trust. Regenerate it so the change is checked
                      against the page as it is now.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Execution history</h2>
          {runs.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Nothing has run yet. Type an instruction on the Command screen.
            </p>
          ) : (
            <div className="grid gap-4">
              {runs.map((r) => (
                <details
                  key={r.id}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--line)", background: "var(--card)" }}
                >
                  <summary className="cursor-pointer">
                    <span className="mr-2 text-sm font-medium">{r.instruction.slice(0, 90)}</span>
                    <span className="inline-flex flex-wrap gap-2 align-middle">
                      <StatusChip status={r.applied ? "ok" : r.rolledBack ? "limited" : "off"}>
                        {outcomeLabel(r)}
                      </StatusChip>
                      <StatusChip status="limited">{r.mode}</StatusChip>
                      {r.mock && <StatusChip status="limited">mock</StatusChip>}
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      {r.message}
                    </p>
                    <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                      {new Date(r.startedAt).toLocaleString()} · {r.candidateCount} candidate(s) ·
                      approval: {r.approvalSource}
                      {r.revisionHash ? ` · revision ${r.revisionHash.slice(0, 12)}` : ""}
                      {r.rolledBack ? " · ROLLED BACK" : ""}
                    </p>
                    <StepList steps={r.steps} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
