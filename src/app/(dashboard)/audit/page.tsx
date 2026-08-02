import { PageHeader } from "@/components/page-header";
import { getAuditLog } from "@/lib/data/queries";

export default async function AuditPage() {
  const log = await getAuditLog();
  return (
    <>
      <PageHeader
        eyebrow="06 · Audit Log"
        title="Every action, traceable"
        lead="Each published item traces back to a draft, an approver (or the automation), and a timestamp. Trust and compliance in one place."
      />
      <div className="flex flex-col">
        {log.map((l, i) => (
          <div
            key={i}
            className="flex gap-4 py-3"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
          >
            <span
              className="text-xs"
              style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)", minWidth: "9.5rem" }}
            >
              {l.ts}
            </span>
            <span
              className="text-xs font-semibold"
              style={{ color: l.who === "auto" ? "var(--teal)" : "var(--gold)", minWidth: "5rem" }}
            >
              {l.action}
            </span>
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {l.detail} <span style={{ color: "var(--ink-faint)" }}>· {l.who}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
