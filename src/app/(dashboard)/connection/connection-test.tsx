"use client";

import { useState, useTransition } from "react";
import { StatusChip } from "@/components/seo/status";
import { testConnectionAction, type ConnectionTestResult } from "./actions";

/**
 * The connection test. It reports what the CMS actually said — including
 * "nothing is configured" — and never turns a failure into a softer message.
 */
export function ConnectionTest() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
      <h3 className="mb-1 font-semibold">Test the connection</h3>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
        Calls the CMS and reports what came back. Until this passes, the system
        treats the site as unreachable — having credentials on file is not the
        same as being able to use them.
      </p>

      <button
        onClick={() => start(async () => setResult(await testConnectionAction()))}
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-medium"
        style={{ background: "var(--ink)", color: "var(--bg)", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Testing…" : "Run connection test"}
      </button>

      {result && (
        <div className="mt-4 grid gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={result.ok ? (result.isMock ? "limited" : "ok") : "off"}>
              {result.ok ? "Reachable" : "Not reachable"}
            </StatusChip>
            {result.isMock && <StatusChip status="limited">MOCK fixture</StatusChip>}
            {result.access && (
              <StatusChip status={result.access === "read/write" ? "ok" : "limited"}>
                {result.access}
              </StatusChip>
            )}
            {result.environment && <StatusChip status="limited">{result.environment}</StatusChip>}
          </div>

          {result.ok ? (
            <p style={{ color: "var(--ink-soft)" }}>
              {result.siteName ? `Site reports its name as “${result.siteName}”. ` : ""}
              {result.contentCount === null
                ? "Content could not be listed."
                : `${result.contentCount} page(s) and post(s) are readable.`}
            </p>
          ) : (
            <p style={{ color: "var(--crit)" }}>
              {result.error?.message ?? "The connection test failed."}
              {result.error?.code ? ` (${result.error.code})` : ""}
            </p>
          )}

          <p className="text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
            {result.description} · checked {new Date(result.checkedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
