import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeRevision, __resetExecuteLedger, type Approval } from "./engine";
import { buildRevision } from "@/lib/revisions/revision";
import { createMockCms } from "@/lib/cms/mock";
import { __resetAuditForTests } from "@/lib/audit-log/log";

const WS = "ws1";
const URL = "https://s.com/blog/a";

function freshApproval(hash: string): Approval {
  return { approvedRevisionHash: hash, expiresAt: Date.now() + 60_000 };
}

function ctx(role: "OWNER" | "VIEWER", approval: Approval, extra: Partial<Parameters<typeof executeRevision>[2]> = {}) {
  return {
    workspaceId: WS, userId: "u1", role, protectedPatterns: [] as string[],
    approval, idempotencyKey: `k-${Math.random()}`, ...extra,
  };
}

describe("execute engine (demo mode)", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    __resetExecuteLedger();
    __resetAuditForTests();
  });
  afterEach(() => {
    if (saved) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("applies and verifies an approved revision, mutating the CMS", async () => {
    const cms = createMockCms({ [URL]: "<p>services here</p>" });
    const rev = buildRevision("web1", [{ url: URL, beforeHtml: "<p>services here</p>", afterHtml: '<p><a href="/x">services</a> here</p>' }]);
    const r = await executeRevision(rev, cms, ctx("OWNER", freshApproval(rev.revisionHash)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.verified).toBe(true);
    const page = await cms.getPage(URL);
    expect(page?.html).toContain('<a href="/x">');
    expect(page?.revision).toBe(2); // real mutation
  });

  it("rejects a stale preview (content changed since preview)", async () => {
    const cms = createMockCms({ [URL]: "<p>services here</p>" });
    const rev = buildRevision("web1", [{ url: URL, beforeHtml: "<p>services here</p>", afterHtml: "<p>changed</p>" }]);
    // Someone edits the page after the preview was built.
    await cms.writePage(URL, "<p>DIFFERENT now</p>");
    const r = await executeRevision(rev, cms, ctx("OWNER", freshApproval(rev.revisionHash)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/stale/);
  });

  it("rejects when the approval hash doesn't match the revision", async () => {
    const cms = createMockCms({ [URL]: "<p>x</p>" });
    const rev = buildRevision("web1", [{ url: URL, beforeHtml: "<p>x</p>", afterHtml: "<p>y</p>" }]);
    const r = await executeRevision(rev, cms, ctx("OWNER", freshApproval("wronghash")));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/approval does not match/);
  });

  it("rejects an expired approval", async () => {
    const cms = createMockCms({ [URL]: "<p>x</p>" });
    const rev = buildRevision("web1", [{ url: URL, beforeHtml: "<p>x</p>", afterHtml: "<p>y</p>" }]);
    const r = await executeRevision(rev, cms, ctx("OWNER", { approvedRevisionHash: rev.revisionHash, expiresAt: Date.now() - 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/expired/);
  });

  it("blocks execution against a protected URL", async () => {
    const cms = createMockCms({ [URL]: "<p>x</p>" });
    const rev = buildRevision("web1", [{ url: URL, beforeHtml: "<p>x</p>", afterHtml: "<p>y</p>" }]);
    const r = await executeRevision(rev, cms, ctx("OWNER", freshApproval(rev.revisionHash), { protectedPatterns: ["/blog/**"] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/protected/);
  });

  it("denies a role without execute permission", async () => {
    const cms = createMockCms({ [URL]: "<p>x</p>" });
    const rev = buildRevision("web1", [{ url: URL, beforeHtml: "<p>x</p>", afterHtml: "<p>y</p>" }]);
    const r = await executeRevision(rev, cms, ctx("VIEWER", freshApproval(rev.revisionHash)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/may not execute/);
  });

  it("supports dry-run (validates, writes nothing)", async () => {
    const cms = createMockCms({ [URL]: "<p>x</p>" });
    const rev = buildRevision("web1", [{ url: URL, beforeHtml: "<p>x</p>", afterHtml: "<p>y</p>" }]);
    const r = await executeRevision(rev, cms, ctx("OWNER", freshApproval(rev.revisionHash), { dryRun: true }));
    expect(r.ok).toBe(true);
    expect((await cms.getPage(URL))?.revision).toBe(1); // unchanged
  });
});
