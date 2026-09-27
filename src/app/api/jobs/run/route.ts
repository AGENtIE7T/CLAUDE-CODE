import { NextResponse } from "next/server";
import { runWorker, sharedJobQueue } from "@/lib/jobs/queue";
import { handleJob } from "@/lib/jobs/handlers";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The background worker, invoked on a schedule (Vercel Cron) rather than run
 * as a daemon — a serverless host has no daemon to run.
 *
 * It is authenticated with CRON_SECRET and compared in constant time, because
 * an unauthenticated worker endpoint is a free denial-of-service lever: anyone
 * who can call it can make the app do outbound work on demand. If the secret
 * is not configured the endpoint refuses rather than defaulting to open.
 */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWorker(sharedJobQueue(), (job) => handleJob(job).then(() => undefined), {
      budgetMs: 25_000,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    reportError(e, { kind: "jobs.worker_failed", severity: "error" });
    return NextResponse.json({ error: "worker failed" }, { status: 500 });
  }
}

/** Vercel Cron issues GET; same auth, same work. */
export function GET(request: Request) {
  return POST(request);
}
