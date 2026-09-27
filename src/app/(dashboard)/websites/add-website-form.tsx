"use client";

import { useState, useTransition } from "react";
import { addWebsiteAction } from "./actions";

/** Small client form that calls the server action and surfaces field issues. */
export function AddWebsiteForm() {
  const [pending, startTransition] = useTransition();
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);
  const [warnings, setWarnings] = useState<{ field: string; message: string }[]>([]);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      setOk(null);
      const res = await addWebsiteAction(fd);
      setIssues(res.issues ?? []);
      setWarnings(res.warnings ?? []);
      if (res.ok && res.website) {
        setOk(`Added ${res.website.canonicalDomain} — pending ownership verification.`);
        form.reset();
      } else if (res.error) {
        setIssues([{ field: "form", message: res.error }]);
      }
    });
  }

  const field = (name: string) => issues.find((i) => i.field === name)?.message;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--line)", background: "var(--card)" }}
    >
      <h3 className="mb-3 font-semibold">Add a website</h3>
      <div className="grid gap-3">
        <label className="text-sm">
          Name
          <input name="name" className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "transparent" }} placeholder="Acme Law" />
          {field("name") && <span className="text-xs" style={{ color: "var(--bad, #c0392b)" }}>{field("name")}</span>}
        </label>
        <label className="text-sm">
          Website URL
          <input name="url" className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "transparent" }} placeholder="https://www.acmelaw.com" />
          {field("url") && <span className="text-xs" style={{ color: "var(--bad, #c0392b)" }}>{field("url")}</span>}
        </label>
        <label className="text-sm">
          Sitemap URL <span style={{ color: "var(--ink-faint)" }}>(optional)</span>
          <input name="sitemapUrl" className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "transparent" }} placeholder="https://www.acmelaw.com/sitemap.xml" />
          {field("sitemapUrl") && <span className="text-xs" style={{ color: "var(--bad, #c0392b)" }}>{field("sitemapUrl")}</span>}
        </label>
        <label className="text-sm">
          robots.txt URL <span style={{ color: "var(--ink-faint)" }}>(optional)</span>
          <input name="robotsUrl" className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "transparent" }} placeholder="https://www.acmelaw.com/robots.txt" />
        </label>
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 text-xs" style={{ color: "var(--gold, #b7791f)" }}>
          {warnings.map((w, i) => <li key={i}>⚠ {w.message}</li>)}
        </ul>
      )}
      {field("form") && <p className="mt-3 text-sm" style={{ color: "var(--bad, #c0392b)" }}>{field("form")}</p>}
      {ok && <p className="mt-3 text-sm" style={{ color: "var(--good, #2f855a)" }}>{ok}</p>}

      <button type="submit" disabled={pending}
        className="mt-4 rounded-md px-4 py-2 text-sm font-medium"
        style={{ background: "var(--ink)", color: "var(--bg)", opacity: pending ? 0.6 : 1 }}>
        {pending ? "Adding…" : "Add website"}
      </button>
    </form>
  );
}
