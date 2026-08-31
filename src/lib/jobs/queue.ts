/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Background jobs — crawling and other work that outlives a request.
 * ─────────────────────────────────────────────────────────────────────────
 *  On a serverless host a request has seconds, and a crawl has minutes. So a
 *  long task is not "run in the background" — it is split into a queue plus a
 *  worker that a scheduler invokes repeatedly, each invocation doing as much
 *  as it safely can inside a time budget and then stopping cleanly.
 *
 *  Three properties this design has to hold:
 *
 *   · At-most-once handoff. `claim()` marks a job running with a lease before
 *     the handler sees it, so two overlapping cron invocations cannot process
 *     the same job twice. A lease that expires is reclaimable, so a worker
 *     that died mid-job does not strand it forever.
 *   · Bounded retries. A job that fails is retried with backoff up to
 *     `maxAttempts`, then parked as `dead` — never retried forever.
 *   · No payload secrets. A job payload is data the queue persists and the
 *     logs may echo; credentials are resolved server-side at run time from the
 *     environment instead of being carried in the job.
 */

export type JobStatus = "queued" | "running" | "done" | "failed" | "dead";

export type JobKind = "crawl" | "audit" | "linking_preview" | "verify";

export interface Job {
  id: string;
  kind: JobKind;
  workspaceId: string;
  websiteId: string;
  /** Plain data only. Never a credential. */
  payload: Record<string, string | number | boolean>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  /** Epoch ms before which the job must not run. */
  runAfter: number;
  /** Epoch ms a claim expires, so a dead worker's job can be reclaimed. */
  leaseUntil: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobQueue {
  enqueue(input: {
    kind: JobKind;
    workspaceId: string;
    websiteId: string;
    payload?: Job["payload"];
    maxAttempts?: number;
    delayMs?: number;
  }): Job;
  /** Take one runnable job and lease it. Null when there is nothing to do. */
  claim(leaseMs?: number): Job | null;
  complete(id: string): Job | null;
  /** Record a failure; re-queues with backoff until maxAttempts is spent. */
  fail(id: string, error: string): Job | null;
  list(workspaceId: string): Job[];
  get(id: string): Job | null;
}

export const DEFAULT_LEASE_MS = 60_000;
const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000];

export function createMemoryJobQueue(now: () => number = Date.now): JobQueue {
  const jobs: Job[] = [];

  const touch = (j: Job) => {
    j.updatedAt = new Date(now()).toISOString();
    return j;
  };

  return {
    enqueue(input) {
      const ts = new Date(now()).toISOString();
      const job: Job = {
        id: `job-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        kind: input.kind,
        workspaceId: input.workspaceId,
        websiteId: input.websiteId,
        payload: input.payload ?? {},
        status: "queued",
        attempts: 0,
        maxAttempts: Math.min(10, Math.max(1, input.maxAttempts ?? 3)),
        runAfter: now() + (input.delayMs ?? 0),
        leaseUntil: null,
        lastError: null,
        createdAt: ts,
        updatedAt: ts,
      };
      jobs.push(job);
      return job;
    },

    claim(leaseMs = DEFAULT_LEASE_MS) {
      const t = now();
      const job = jobs.find(
        (j) =>
          (j.status === "queued" && j.runAfter <= t) ||
          // Reclaim a job whose worker died: its lease has expired.
          (j.status === "running" && j.leaseUntil !== null && j.leaseUntil <= t),
      );
      if (!job) return null;
      job.status = "running";
      job.attempts += 1;
      job.leaseUntil = t + leaseMs;
      return touch(job);
    },

    complete(id) {
      const job = jobs.find((j) => j.id === id);
      if (!job) return null;
      job.status = "done";
      job.leaseUntil = null;
      job.lastError = null;
      return touch(job);
    },

    fail(id, error) {
      const job = jobs.find((j) => j.id === id);
      if (!job) return null;
      job.lastError = error.slice(0, 500);
      job.leaseUntil = null;
      if (job.attempts >= job.maxAttempts) {
        job.status = "dead";
      } else {
        job.status = "queued";
        job.runAfter = now() + (BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)] ?? 600_000);
      }
      return touch(job);
    },

    list(workspaceId) {
      return jobs.filter((j) => j.workspaceId === workspaceId);
    },

    get(id) {
      return jobs.find((j) => j.id === id) ?? null;
    },
  };
}

/** Process-wide queue, so an enqueue in a request is visible to the worker. */
const g = globalThis as unknown as { __seoJobQueue?: JobQueue };

export function sharedJobQueue(): JobQueue {
  if (!g.__seoJobQueue) g.__seoJobQueue = createMemoryJobQueue();
  return g.__seoJobQueue;
}

export function __resetJobQueue(): void {
  g.__seoJobQueue = undefined;
}

export interface WorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  /** True when the budget ran out with work still queued. */
  moreWork: boolean;
}

/**
 * Drain the queue within a time budget.
 *
 * The budget is checked BEFORE claiming the next job, never mid-job, so a job
 * is either not started or run to completion — a half-run crawl that is
 * recorded as done would be worse than a slow one.
 */
export async function runWorker(
  queue: JobQueue,
  handler: (job: Job) => Promise<void>,
  opts: { budgetMs?: number; maxJobs?: number; now?: () => number } = {},
): Promise<WorkerResult> {
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? 25_000);
  const maxJobs = opts.maxJobs ?? 25;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  while (processed < maxJobs && now() < deadline) {
    const job = queue.claim();
    if (!job) return { processed, succeeded, failed, moreWork: false };
    processed++;
    try {
      await handler(job);
      queue.complete(job.id);
      succeeded++;
    } catch (e) {
      queue.fail(job.id, e instanceof Error ? e.message : "job failed");
      failed++;
    }
  }
  return { processed, succeeded, failed, moreWork: true };
}
