import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p
        className="mb-4 text-xs uppercase tracking-[0.22em]"
        style={{ color: "var(--gold)", fontFamily: "var(--font-mono)" }}
      >
        AEO Autopilot
      </p>
      <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
        Get your brand <span style={{ color: "var(--gold)" }}>cited by AI</span>.
      </h1>
      <p className="mb-8 text-lg" style={{ color: "var(--ink-soft)" }}>
        We continuously generate, publish, and measure the content that answer
        engines — ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini —
        pull from. You show up inside the answer, not just on page two of Google.
      </p>
      <Link
        href="/dashboard"
        className="inline-block rounded-lg px-5 py-3 font-semibold text-white"
        style={{ background: "var(--teal)" }}
      >
        Open the dashboard →
      </Link>
    </main>
  );
}
