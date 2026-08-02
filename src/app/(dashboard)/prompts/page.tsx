import { PageHeader } from "@/components/page-header";

const gaps = [
  { q: "What is answer engine optimization?", intent: "definitional", appears: false, queued: "faq_page" },
  { q: "AEO vs SEO — what's the difference?", intent: "comparative", appears: false, queued: "comparison" },
  { q: "How do I get cited by ChatGPT?", intent: "how_to", appears: true, queued: "—" },
  { q: "Best AEO tools in 2026", intent: "commercial", appears: false, queued: "stat_roundup" },
];

export default function PromptsPage() {
  return (
    <>
      <PageHeader
        eyebrow="02 · Prompts & Gaps"
        title="Where are we absent?"
        lead="The real questions people ask AI about your category, whether your brand appears in the current answer, and the asset queued to close each gap."
      />
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-sm" style={{ minWidth: "40rem" }}>
          <thead>
            <tr style={{ background: "var(--card)" }}>
              {["Target prompt", "Intent", "You appear?", "Queued fix"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs uppercase tracking-wide"
                  style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gaps.map((g) => (
              <tr key={g.q} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 font-medium">{g.q}</td>
                <td className="px-4 py-3" style={{ color: "var(--ink-soft)" }}>{g.intent}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      background: g.appears ? "var(--good)" : "var(--rust)",
                      color: "#fff",
                    }}
                  >
                    {g.appears ? "cited" : "missing"}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                  {g.queued}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
