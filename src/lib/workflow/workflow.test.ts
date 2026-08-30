/**
 * The mocked WordPress acceptance run.
 *
 * This is the full 15-step workflow the product performs, executed against the
 * fixture WordPress. The same function runs against a real staging site — only
 * the connection differs — so what passes here is the real path, not a stand-in.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockWordPress, type MockWordPress } from "@/lib/cms/wordpress/mock-server";
import { createWordPressConnection } from "@/lib/cms/wordpress/client";
import { WP_ORIGIN } from "@/lib/cms/wordpress/fixtures";
import { createMemoryBackupStore } from "@/lib/backups/snapshot";
import { DEFAULT_AUTOPILOT_RULES, normalizeRules, type AutopilotRules } from "@/lib/autopilot/rules";
import { __resetExecuteLedger } from "@/lib/execute/engine";
import { WORDPRESS_CONNECTION_REQUIRED, WORK_ORDER_ONLY } from "@/lib/status/capabilities";
import { runInternalLinking, type LinkingRunOptions, type LinkingRunResult } from "./linking-run";

let wp: MockWordPress;

function conn(over: Partial<Parameters<typeof createWordPressConnection>[0]> = {}) {
  return createWordPressConnection({
    baseUrl: WP_ORIGIN,
    token: "dXNlcjphcHA=",
    environment: "staging",
    label: "Fixture WP",
    isMock: true,
    access: "read_write",
    fetchImpl: wp.fetch,
    timeoutMs: 200,
    ...over,
  });
}

function rules(over: Partial<AutopilotRules> = {}): AutopilotRules {
  return normalizeRules({ ...DEFAULT_AUTOPILOT_RULES, ...over });
}

function options(over: Partial<LinkingRunOptions> = {}): LinkingRunOptions {
  return {
    websiteId: "site-1",
    workspaceId: "ws-1",
    userId: "user-1",
    role: "OWNER",
    connection: conn(),
    backups: createMemoryBackupStore(),
    rules: rules(),
    protectedUrls: [],
    mode: "execute",
    ...over,
  };
}

/** Find one step by key. */
function step(r: LinkingRunResult, key: string) {
  const s = r.steps.find((x) => x.key === key);
  if (!s) throw new Error(`step ${key} was not recorded`);
  return s;
}

beforeEach(() => {
  wp = createMockWordPress();
  __resetExecuteLedger();
});

describe("workflow: the complete mocked WordPress run", () => {
  it("performs all fifteen steps: connect → apply → verify → roll back → verify", async () => {
    const r = await runInternalLinking(
      options({
        mode: "execute",
        useAutopilot: true,
        rules: rules({ enabled: true, minimumConfidence: 0.5 }),
        undoAfterVerify: true,
      }),
    );

    // Every step is present, in order, whatever happened.
    expect(r.steps).toHaveLength(15);
    expect(r.steps.map((s) => s.n)).toEqual([...Array(15)].map((_, i) => i + 1));

    expect(step(r, "connection").status).toBe("ok");
    expect(step(r, "list").status).toBe("ok");
    expect(step(r, "read").status).toBe("ok");
    expect(step(r, "detect").status).toBe("ok");
    expect(step(r, "preview").status).toBe("ok");
    expect(step(r, "select").status).toBe("ok");
    expect(step(r, "approval").status).toBe("ok");
    expect(step(r, "apply").status).toBe("ok");
    expect(step(r, "reread").status).toBe("ok");
    expect(step(r, "verify").status).toBe("ok");
    expect(step(r, "rollback").status).toBe("ok");
    expect(step(r, "reread2").status).toBe("ok");
    expect(step(r, "verify2").status).toBe("ok");
    expect(step(r, "audit").status).toBe("ok");

    expect(r.approvalSource).toBe("autopilot");
    expect(r.rolledBack).toBe(true);
    // Rolled back means the site is unchanged — so `applied` must be false.
    expect(r.applied).toBe(false);
    expect(r.chosen).not.toBeNull();
    expect(r.revisionHash).toBeTruthy();
  });

  it("really writes the link, and really removes it again", async () => {
    const before = wp.contentOf(20);
    const r = await runInternalLinking(
      options({
        mode: "execute",
        useAutopilot: true,
        rules: rules({ enabled: true, minimumConfidence: 0.5 }),
        undoAfterVerify: true,
      }),
    );
    expect(r.chosen).not.toBeNull();
    // The fixture is byte-identical to where it started.
    expect(wp.contentOf(20)).toBe(before);
    expect(r.message).toMatch(/rollback was verified/i);
  });

  it("leaves the change in place when no undo was requested", async () => {
    const r = await runInternalLinking(
      options({
        mode: "execute",
        useAutopilot: true,
        rules: rules({ enabled: true, minimumConfidence: 0.5 }),
        undoAfterVerify: false,
      }),
    );
    expect(r.applied).toBe(true);
    // The link is genuinely on the live fixture page, read back independently.
    const live = await conn().getByUrl(r.chosen!.sourceUrl);
    expect(live.html).toContain(`href="${r.chosen!.targetUrl}"`);
    expect(step(r, "rollback").status).toBe("skipped");
  });
});

describe("workflow: honest states", () => {
  it("says a connection is required, and does nothing, when there is none", async () => {
    const r = await runInternalLinking(options({ connection: null }));
    expect(r.message).toBe(WORDPRESS_CONNECTION_REQUIRED);
    expect(r.applied).toBe(false);
    expect(r.steps.filter((s) => s.status === "skipped").length).toBeGreaterThan(10);
  });

  it("creates a work order and writes nothing when Autopilot is off", async () => {
    const r = await runInternalLinking(
      options({ mode: "execute", useAutopilot: false, rules: rules({ minimumConfidence: 0.5 }) }),
    );
    expect(r.message).toBe(WORK_ORDER_ONLY);
    expect(r.workOrderOnly).toBe(true);
    expect(r.applied).toBe(false);
    expect(step(r, "apply").status).toBe("skipped");
  });

  it("preview mode writes nothing even when it holds a valid approval", async () => {
    const original = wp.contentOf(20);
    const r = await runInternalLinking(
      options({
        mode: "preview",
        useAutopilot: true,
        rules: rules({ enabled: true, minimumConfidence: 0.5 }),
      }),
    );
    expect(r.message).toBe(WORK_ORDER_ONLY);
    expect(r.applied).toBe(false);
    expect(wp.contentOf(20)).toBe(original);
  });

  it("audit mode reports findings and never builds an edit", async () => {
    const r = await runInternalLinking(options({ mode: "audit", rules: rules({ minimumConfidence: 0.5 }) }));
    expect(r.applied).toBe(false);
    expect(r.message).toMatch(/No website was modified/);
    expect(step(r, "preview").status).toBe("skipped");
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it("refuses to write through a read-only connection", async () => {
    const r = await runInternalLinking(
      options({
        connection: conn({ access: "read_only" }),
        mode: "execute",
        useAutopilot: true,
        rules: rules({ enabled: true, minimumConfidence: 0.5 }),
      }),
    );
    expect(r.applied).toBe(false);
    expect(step(r, "apply").status).toBe("failed");
  });

  it("reports a failed connection instead of proceeding", async () => {
    wp.faults.auth = true;
    const r = await runInternalLinking(options());
    expect(step(r, "connection").status).toBe("failed");
    expect(r.message).toMatch(/Connection test failed/);
    expect(r.applied).toBe(false);
  });

  it("refuses a mock connection pointed at production", async () => {
    const r = await runInternalLinking(
      options({ connection: conn({ environment: "production", isMock: true }) }),
    );
    expect(r.message).toMatch(/never be used against production/);
    expect(r.applied).toBe(false);
  });
});

describe("workflow: safety", () => {
  it("never reads or proposes a protected URL", async () => {
    const r = await runInternalLinking(
      options({
        mode: "preview",
        protectedUrls: ["/services/**"],
        rules: rules({ minimumConfidence: 0.5 }),
      }),
    );
    for (const c of r.candidates) {
      expect(c.sourceUrl).not.toMatch(/\/services\//);
      expect(c.targetUrl).not.toMatch(/\/services\//);
    }
  });

  it("flags injection-style page copy and still treats it only as data", async () => {
    const r = await runInternalLinking(options({ mode: "audit", rules: rules({ minimumConfidence: 0.5 }) }));
    expect(r.injectionFlags.length).toBeGreaterThan(0);
    // Nothing in the flagged content changed the outcome.
    expect(r.applied).toBe(false);
  });

  it("takes a backup before writing, so the undo has real bytes to restore", async () => {
    const backups = createMemoryBackupStore();
    const r = await runInternalLinking(
      options({
        backups,
        mode: "execute",
        useAutopilot: true,
        rules: rules({ enabled: true, minimumConfidence: 0.5 }),
      }),
    );
    const snaps = await backups.byBatch(r.batchId);
    expect(snaps.length).toBe(1);
    expect(snaps[0].html).toBeTruthy();
  });

  it("rolls back and reports failure when the CMS silently ignores the write", async () => {
    // The server accepts the write and changes nothing.
    wp.faults.verifyFailIds = [20, 21, 22];
    const r = await runInternalLinking(
      options({
        mode: "execute",
        useAutopilot: true,
        rules: rules({ enabled: true, minimumConfidence: 0.5 }),
      }),
    );
    expect(r.applied).toBe(false);
    expect(r.message).toMatch(/NOT applied|did not verify/i);
  });
});
