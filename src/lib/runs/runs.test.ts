import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetWorkOrders,
  createWorkOrder,
  getWorkOrder,
  listWorkOrders,
  settleWorkOrder,
} from "./work-orders";
import {
  __resetRunHistory,
  isUndoable,
  listRuns,
  markRunUndone,
  outcomeLabel,
  recordRun,
} from "./history";
import {
  __resetWebsiteConfig,
  getWebsiteConfig,
  parseProtectedUrls,
  saveAutopilotRules,
  saveProtectedUrls,
} from "@/lib/websites/config-store";
import { buildRevision } from "@/lib/revisions/revision";
import type { LinkCandidate } from "@/lib/linking/engine";
import type { LinkingRunResult } from "@/lib/workflow/linking-run";

const revision = buildRevision("site-1", [
  { url: "https://x.test/blog/a", beforeHtml: "<p>before</p>", afterHtml: "<p>after</p>" },
]);

const candidate = {
  sourceUrl: "https://x.test/blog/a",
  targetUrl: "https://x.test/services/b",
  anchor: "estate planning",
  confidence: 0.91,
  reason: "strong topical overlap",
} as unknown as LinkCandidate;

beforeEach(() => {
  __resetWorkOrders();
  __resetRunHistory();
  __resetWebsiteConfig();
});

describe("work orders", () => {
  const base = { websiteId: "site-1", workspaceId: "ws-1", instruction: "add links", revision, candidates: [candidate] };

  it("stores the exact revision so approval binds to what was previewed", () => {
    const o = createWorkOrder(base);
    expect(o.status).toBe("pending");
    expect(o.candidates).toHaveLength(1);
    expect(o.revision.revisionHash).toBe(revision.revisionHash);
    expect(o.revision.items[0].afterHtml).toBe("<p>after</p>");
  });

  it("expires a pending order once its window passes, and refuses to hand it back as pending", () => {
    const t0 = 1_000_000;
    const o = createWorkOrder({ ...base, ttlMinutes: 30, now: () => t0 });
    expect(getWorkOrder(o.id, () => t0 + 29 * 60_000)?.status).toBe("pending");
    expect(getWorkOrder(o.id, () => t0 + 31 * 60_000)?.status).toBe("expired");
  });

  it("records a decision with its outcome", () => {
    const o = createWorkOrder(base);
    settleWorkOrder(o.id, "applied", "Applied and verified.");
    const after = getWorkOrder(o.id);
    expect(after?.status).toBe("applied");
    expect(after?.outcome).toBe("Applied and verified.");
    expect(after?.decidedAt).toBeTruthy();
  });

  it("scopes listing to a workspace", () => {
    createWorkOrder(base);
    createWorkOrder({ ...base, workspaceId: "ws-2" });
    expect(listWorkOrders("ws-1")).toHaveLength(1);
  });
});

describe("run history", () => {
  function result(over: Partial<LinkingRunResult> = {}): LinkingRunResult {
    return {
      steps: [{ n: 1, key: "website", label: "Select website", status: "ok", detail: "ok", at: "t" }],
      mode: "execute",
      applied: false,
      rolledBack: false,
      workOrderOnly: false,
      approvalSource: "none",
      message: "",
      pagesRead: 3,
      candidates: [],
      selected: [],
      chosen: null,
      revisionHash: null,
      revision: null,
      batchId: "b1",
      mock: false,
      injectionFlags: [],
      ...over,
    };
  }

  it("labels a work-order-only run as having modified nothing", () => {
    const r = recordRun(
      { websiteId: "s", workspaceId: "ws-1", instruction: "i" },
      result({ workOrderOnly: true, message: "Work order created." }),
    );
    expect(outcomeLabel(r)).toBe("Work order only — nothing modified");
    expect(r.applied).toBe(false);
  });

  it("never labels a rolled-back run as applied", () => {
    const r = recordRun(
      { websiteId: "s", workspaceId: "ws-1", instruction: "i" },
      result({ applied: false, rolledBack: true }),
    );
    expect(outcomeLabel(r)).toBe("Applied, then rolled back");
  });

  it("marks a mock run as a mock so it cannot be read as a real change", () => {
    const r = recordRun(
      { websiteId: "s", workspaceId: "ws-1", instruction: "i" },
      result({ applied: true, mock: true }),
    );
    expect(outcomeLabel(r)).toBe("Applied (mock site)");
  });

  it("keeps runs newest first, scoped to the workspace", () => {
    recordRun({ websiteId: "s", workspaceId: "ws-1", instruction: "first" }, result());
    recordRun({ websiteId: "s", workspaceId: "ws-1", instruction: "second" }, result());
    recordRun({ websiteId: "s", workspaceId: "ws-2", instruction: "other" }, result());
    const runs = listRuns("ws-1");
    expect(runs.map((r) => r.instruction)).toEqual(["second", "first"]);
  });
});

describe("website config", () => {
  it("defaults to no protected URLs and Autopilot off", () => {
    const c = getWebsiteConfig("site-1");
    expect(c.protectedUrls).toEqual([]);
    expect(c.rules.enabled).toBe(false);
  });

  it("parses protected URLs from prose input, ignoring blanks and comments", () => {
    expect(
      parseProtectedUrls("/checkout**\n\n# comment\ncart\nhttps://x.test/my-account/settings\n"),
    ).toEqual(["/checkout**", "/cart", "/my-account/settings"]);
  });

  it("persists protected URLs per website", () => {
    saveProtectedUrls("site-1", ["/checkout**"]);
    expect(getWebsiteConfig("site-1").protectedUrls).toEqual(["/checkout**"]);
    expect(getWebsiteConfig("site-2").protectedUrls).toEqual([]);
  });

  it("clamps a submitted rule set instead of trusting it", () => {
    const c = saveAutopilotRules("site-1", {
      maxLinksPerPage: 999,
      maxPagesPerRun: 100_000,
      minimumConfidence: 0.01,
      allowLinkRemoval: true,
    });
    expect(c.rules.maxLinksPerPage).toBe(10);
    expect(c.rules.maxPagesPerRun).toBe(200);
    expect(c.rules.minimumConfidence).toBe(0.5);
    expect(c.rules.allowLinkRemoval).toBe(false);
  });

  it("keeps enabling Autopilot an explicit act", () => {
    expect(getWebsiteConfig("site-1").rules.enabled).toBe(false);
    expect(saveAutopilotRules("site-1", { enabled: true }).rules.enabled).toBe(true);
  });
});

describe("undoing a run", () => {
  function result(over: Partial<LinkingRunResult> = {}): LinkingRunResult {
    return {
      steps: [],
      mode: "execute",
      applied: true,
      rolledBack: false,
      workOrderOnly: false,
      approvalSource: "human",
      message: "Applied and verified.",
      pagesRead: 3,
      candidates: [],
      selected: [],
      chosen: null,
      revisionHash: "hash",
      revision: null,
      batchId: "b1",
      mock: false,
      injectionFlags: [],
      ...over,
    };
  }

  it("marks an applied run undoable, and a work order not", () => {
    const applied = recordRun({ websiteId: "s", workspaceId: "ws-1", instruction: "i" }, result());
    expect(isUndoable(applied)).toBe(true);

    const order = recordRun(
      { websiteId: "s", workspaceId: "ws-1", instruction: "i" },
      result({ applied: false, workOrderOnly: true }),
    );
    expect(isUndoable(order)).toBe(false);
  });

  it("records a successful undo as a new fact, without erasing that it applied", () => {
    const run = recordRun({ websiteId: "s", workspaceId: "ws-1", instruction: "i" }, result());
    markRunUndone(run.id, "Undone. 1 page(s) restored.", true);

    const after = listRuns("ws-1")[0];
    // It DID apply — the history records what happened, not the current state.
    expect(after.applied).toBe(true);
    expect(after.undoneAt).toBeTruthy();
    expect(after.rolledBack).toBe(true);
    expect(outcomeLabel(after)).toBe("Applied, then undone");
    // And it cannot be undone twice.
    expect(isUndoable(after)).toBe(false);
  });

  it("records a FAILED undo without marking the run undone", () => {
    const run = recordRun({ websiteId: "s", workspaceId: "ws-1", instruction: "i" }, result());
    markRunUndone(run.id, "Partly undone: restored 1, FAILED on /blog/b.", false);

    const after = listRuns("ws-1")[0];
    expect(after.undoneAt).toBeNull();
    expect(after.undoOutcome).toMatch(/FAILED/);
    // Still undoable, because it still needs undoing.
    expect(isUndoable(after)).toBe(true);
    expect(outcomeLabel(after)).not.toBe("Applied, then undone");
  });

  it("a mock run is still labelled a mock after being undone", () => {
    const run = recordRun(
      { websiteId: "s", workspaceId: "ws-1", instruction: "i" },
      result({ mock: true }),
    );
    markRunUndone(run.id, "Undone.", true);
    expect(listRuns("ws-1")[0].mock).toBe(true);
  });
});
