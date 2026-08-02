export function PageHeader({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="mb-8">
      <p
        className="mb-2 text-xs uppercase tracking-[0.18em]"
        style={{ color: "var(--teal)", fontFamily: "var(--font-mono)" }}
      >
        {eyebrow}
      </p>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="max-w-2xl" style={{ color: "var(--ink-soft)" }}>
        {lead}
      </p>
    </header>
  );
}
