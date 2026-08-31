/**
 * A scheduled job may read and propose. It may never write, and it may never
 * record a success it did not achieve.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleJob } from "./handlers";
import { createMemoryJobQueue, type Job } from "./queue";
import { __resetMockWordPress } from "@/lib/connection/resolve";
import { __resetRunHistory, listRuns } from "@/lib/runs/history";
import { __resetWebsiteConfig, saveAutopilotRules } from "@/lib/websites/config-store";

const KEYS = [
  "WORDPRESS_BASE_URL",
  "WORDPRESS_USERNAME",
  "WORDPRESS_APP_PASSWORD",
  "WORDPRESS_USE_MOCK",
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;
const saved: Record<string, string | undefined> = {};

function job(kind: Job["kind"]): Job {
  return createMemoryJobQueue().enqueue({ kind, workspaceId: "ws-1", websiteId: "site-1" });
}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.WORDPRESS_USE_MOCK = "1";
  __resetMockWordPress();
  __resetRunHistory();
  __resetWebsiteConfig();
  // The fixture's best candidate sits just above 0.80; keep the shipped floor.
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("scheduled jobs", () => {
  it("runs an audit against the connection and records the run", async () => {
    const out = await handleJob(job("audit"));
    expect(out.summary).toMatch(/opportunity\(ies\)/);
    expect(out.runId).toBeTruthy();

    const runs = listRuns("ws-1");
    expect(runs).toHaveLength(1);
    expect(runs[0].instruction).toBe("scheduled audit");
    expect(runs[0].applied).toBe(false);
  });

  it("runs linking_preview in preview mode — a work order, never a write", async () => {
    const out = await handleJob(job("linking_preview"));
    expect(out.runId).toBeTruthy();
    const run = listRuns("ws-1")[0];
    expect(run.mode).toBe("preview");
    expect(run.applied).toBe(false);
  });

  it("never writes, even with Autopilot fully enabled on the website", async () => {
    saveAutopilotRules("site-1", { enabled: true, minimumConfidence: 0.5 });
    for (const kind of ["crawl", "audit", "linking_preview", "verify"] as const) {
      __resetRunHistory();
      await handleJob(job(kind));
      const run = listRuns("ws-1")[0];
      expect(run.applied, kind).toBe(false);
      expect(run.mode, kind).not.toBe("execute");
    }
  });

  it("fails rather than reporting success when there is no connection", async () => {
    delete process.env.WORDPRESS_USE_MOCK;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"; // not demo, no creds
    await expect(handleJob(job("audit"))).rejects.toThrow(/No CMS connection/);
    expect(listRuns("ws-1")).toHaveLength(0);
  });

  it("throws on an unknown job kind rather than silently completing", async () => {
    await expect(handleJob({ ...job("audit"), kind: "nonsense" as Job["kind"] })).rejects.toThrow(
      /no handler/,
    );
  });
});
