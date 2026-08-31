"use client";

import { useState, useTransition } from "react";
import { verifyViaCmsAction } from "./actions";

/**
 * Ownership verification through the CMS connection.
 *
 * The button is the only place the claim "this site is yours" can be made, and
 * it makes it from evidence: working credentials for a WordPress install at
 * this website's own domain. Everything it reports is the action's own answer,
 * including its refusals.
 */
export function VerifyViaCmsButton({ websiteId, verified }: { websiteId: string; verified: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (verified && !result) {
    return (
      <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
        Ownership is verified. Crawling and approved writes are permitted for this site.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => start(async () => setResult(await verifyViaCmsAction(websiteId)))}
        disabled={pending}
        className="rounded-md border px-3 py-1.5 text-xs"
        style={{ borderColor: "var(--line)", color: "var(--ink-soft)", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Checking…" : "Verify ownership via the CMS connection"}
      </button>
      {result && (
        <p className="mt-2 text-xs" style={{ color: result.ok ? "var(--good)" : "var(--crit)" }}>
          {result.message}
        </p>
      )}
      {!result && (
        <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
          Accepted only when the connection points at this website&rsquo;s own domain and the
          credentials actually work.
        </p>
      )}
    </div>
  );
}
