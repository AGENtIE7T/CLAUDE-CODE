import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetWorkOrders,
  createWorkOrder,
  getWorkOrder,
  listWorkOrders,
  settleWorkOrder,
} from "./work-orders";
import { __resetRunHistory, listRuns, outcomeLabel, recordRun } from "./history";
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
