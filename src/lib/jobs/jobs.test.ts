import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryJobQueue, runWorker, type Job } from "./queue";
import { redact, reportError, resetErrorSink, setErrorSink, type ErrorReport } from "@/lib/observability/report";

function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("job queue", () => {
  it("claims a job once, so overlapping workers cannot double-process it", () => {
    const c = clock();
    const q = createMemoryJobQueue(c.now);
    q.enqueue({ kind: "crawl", workspaceId: "ws", websiteId: "site" });

    const first = q.claim();
    expect(first?.status).toBe("running");
    expect(q.claim()).toBeNull();
  });

  it("reclaims a job whose worker died and left the lease to expire", () => {
    const c = clock();
    const q = createMemoryJobQueue(c.now);
    q.enqueue({ kind: "crawl", workspaceId: "ws", websiteId: "site" });
    const first = q.claim(30_000);
    expect(first).not.toBeNull();

    c.advance(29_000);
    expect(q.claim()).toBeNull();
    c.advance(2_000);
    const retry = q.claim();
    expect(retry?.id).toBe(first!.id);
    expect(retry?.attempts).toBe(2);
  });

  it("retries with backoff and then parks the job instead of retrying forever", () => {
    const c = clock();
    const q = createMemoryJobQueue(c.now);
    const job = q.enqueue({ kind: "crawl", workspaceId: "ws", websiteId: "site", maxAttempts: 2 });

    q.claim();
    let after = q.fail(job.id, "boom");
    expect(after?.status).toBe("queued");
    expect(after!.runAfter).toBeGreaterThan(c.now()); // backoff applied
    expect(q.claim()).toBeNull(); // not runnable yet

    c.advance(10_000);
    q.claim();
    after = q.fail(job.id, "boom again");
    expect(after?.status).toBe("dead");
    c.advance(600_000);
    expect(q.claim()).toBeNull();
  });

  it("does not run a delayed job before its time", () => {
    const c = clock();
    const q = createMemoryJobQueue(c.now);
    q.enqueue({ kind: "audit", workspaceId: "ws", websiteId: "site", delayMs: 5_000 });
    expect(q.claim()).toBeNull();
    c.advance(5_000);
    expect(q.claim()).not.toBeNull();
  });
});

describe("worker", () => {
  it("drains the queue and reports what it did", async () => {
    const c = clock();
    const q = createMemoryJobQueue(c.now);
    for (let i = 0; i < 3; i++) q.enqueue({ kind: "crawl", workspaceId: "ws", websiteId: "s" });

    const seen: Job[] = [];
    const out = await runWorker(q, async (j) => void seen.push(j), { now: c.now });
    expect(out).toMatchObject({ processed: 3, succeeded: 3, failed: 0, moreWork: false });
    expect(seen).toHaveLength(3);
  });

  it("stops at the budget and says there is more work, without starting a job it cannot finish", async () => {
    const c = clock();
    const q = createMemoryJobQueue(c.now);
    for (let i = 0; i < 5; i++) q.enqueue({ kind: "crawl", workspaceId: "ws", websiteId: "s" });

    let handled = 0;
    const out = await runWorker(
      q,
      async () => {
        handled++;
        c.advance(600); // each job costs time
      },
      { budgetMs: 1_000, now: c.now },
    );
    expect(out.moreWork).toBe(true);
    expect(handled).toBeLessThan(5);
    // Whatever it did start, it finished.
    expect(out.processed).toBe(handled);
  });

  it("records a handler failure without losing the job", async () => {
    const c = clock();
    const q = createMemoryJobQueue(c.now);
    const job = q.enqueue({ kind: "crawl", workspaceId: "ws", websiteId: "s" });
    const out = await runWorker(q, async () => {
      throw new Error("crawl exploded");
    }, { now: c.now });
    expect(out.failed).toBe(1);
    expect(q.get(job.id)?.status).toBe("queued");
    expect(q.get(job.id)?.lastError).toBe("crawl exploded");
  });
});

describe("error reporting", () => {
  const captured: ErrorReport[] = [];
  beforeEach(() => {
    captured.length = 0;
    setErrorSink((r) => captured.push(r));
  });
  afterEach(() => resetErrorSink());

  it("redacts credential-shaped text from the message, stack and context", () => {
    const err = new Error("failed with Authorization: Bearer abc123def456ghi789 while calling /x?key=supersecret");
    const report = reportError(err, {
      kind: "cms.write_failed",
      context: { url: "https://x.test/wp-json?token=abc123def456", pages: 3 },
    });
    const json = JSON.stringify(report);
    expect(json).not.toContain("abc123def456ghi789");
    expect(json).not.toContain("supersecret");
    expect(json).toContain("[redacted]");
    expect(report.context.pages).toBe(3);
    expect(captured).toHaveLength(1);
  });

  it("redacts a JWT and an sk- style key", () => {
    expect(redact("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc")).toContain("[redacted]");
    expect(redact("key sk-abcdefghijklmnopqrstuvwxyz")).toContain("[redacted]");
  });

  it("redacts a configured secret even when it looks like ordinary text", () => {
    const saved = process.env.SEMRUSH_API_KEY;
    process.env.SEMRUSH_API_KEY = "plainlookingvalue123";
    try {
      expect(redact("call failed for plainlookingvalue123")).toBe("call failed for [redacted]");
    } finally {
      if (saved === undefined) delete process.env.SEMRUSH_API_KEY;
      else process.env.SEMRUSH_API_KEY = saved;
    }
  });

  it("drops undefined context values rather than emitting nulls", () => {
    const r = reportError(new Error("x"), { kind: "k", context: { a: undefined, b: "y" } });
    expect(Object.keys(r.context)).toEqual(["b"]);
  });
});
