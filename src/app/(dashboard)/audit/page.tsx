import { PageHeader } from "@/components/page-header";

const log = [
  { ts: "2026-08-02 09:14", who: "auto", action: "published", detail: "'What is AEO?' → owned_site (fully_auto)" },
  { ts: "2026-08-02 08:50", who: "you@brand.com", action: "approved", detail: "'AEO vs SEO' → owned_site" },
  { ts: "2026-08-01 17:22", who: "auto", action: "drafted", detail: "4 gaps found, 4 assets generated" },
  { ts: "2026-08-01 17:20", who: "auto", action: "measured", detail: "5 engines probed · SoV 29% avg" },
];

export default function AuditPage() {
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
            <span className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)", minWidth: "9.5rem" }}>
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
