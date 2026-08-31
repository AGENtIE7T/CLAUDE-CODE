/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Job handlers — what the scheduled worker actually does.
 * ─────────────────────────────────────────────────────────────────────────
 *  Separate from the route so it can be tested without HTTP, and separate from
 *  the queue so the queue stays a queue.
 *
 *  Two rules hold here, both inherited rather than re-implemented:
 *
 *   · A background job may READ and PROPOSE, never write. It runs
 *     `runInternalLinking` in audit or preview mode, so the execute engine is
 *     never reached without a human-issued or Autopilot-issued approval. A
 *     scheduled task that could apply changes unattended would be a second
 *     execution path in all but name.
 *
 *   · A job that cannot do its work FAILS. It never records a success it did
 *     not achieve — no connection means the job fails with that reason, and the
 *     queue's backoff decides whether to try again.
 */

import { createMemoryBackupStore } from "@/lib/backups/snapshot";
import { resolveConnection } from "@/lib/connection/resolve";
import { recordRun } from "@/lib/runs/history";
import { getWebsiteConfig } from "@/lib/websites/config-store";
import { runInternalLinking } from "@/lib/workflow/linking-run";
import { reportError } from "@/lib/observability/report";
import type { Job } from "@/lib/jobs/queue";

export interface JobOutcome {
  /** Short line for the worker's response and the log. */
  summary: string;
  /** Set when the job produced something the operator can look at. */
  runId?: string;
}

/** Modes a background job may run in. Deliberately excludes "execute". */
const JOB_MODE = {
  crawl: "audit",
  audit: "audit",
  linking_preview: "preview",
  verify: "audit",
} as const;

export async function handleJob(job: Job): Promise<JobOutcome> {
  const mode = JOB_MODE[job.kind as keyof typeof JOB_MODE];
  if (!mode) throw new Error(`no handler for job kind "${job.kind}"`);

  const resolved = resolveConnection();
  if (!resolved.connection) {
    // Failing is the honest outcome: there is nothing to read, and marking the
    // job done would claim work that did not happen.
    throw new Error(resolved.error?.message ?? "No CMS connection is configured.");
  }

  const config = getWebsiteConfig(job.websiteId);
  const result = await runInternalLinking({
    websiteId: job.websiteId,
    workspaceId: job.workspaceId,
    userId: null,
    role: "SEO_MANAGER",
    connection: resolved.connection,
    backups: createMemoryBackupStore(),
    rules: config.rules,
    protectedUrls: config.protectedUrls,
    // Never "execute": a scheduled job proposes, a human or Autopilot approves.
    mode,
    useAutopilot: false,
  });

  const record = recordRun(
    {
      websiteId: job.websiteId,
      workspaceId: job.workspaceId,
      instruction: `scheduled ${job.kind}`,
    },
    result,
  );

  if (result.applied) {
    // Should be unreachable — the mode above forbids it. If it ever happens,
    // that is a defect worth shouting about rather than logging quietly.
    reportError(new Error("a scheduled job reported applying a change"), {
      kind: "jobs.unexpected_write",
      severity: "fatal",
      context: { jobId: job.id, kind: job.kind, websiteId: job.websiteId },
    });
  }

  return {
    summary: `${job.kind}: ${result.candidates.length} opportunity(ies) across ${result.pagesRead} page(s).`,
    runId: record.id,
  };
}
