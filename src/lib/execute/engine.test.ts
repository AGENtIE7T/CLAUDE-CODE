import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  executeRevision,
  __resetExecuteLedger,
  type Approval,
  type ExecuteTarget,
} from "./engine";
import { buildRevision } from "@/lib/revisions/revision";
import { createMockCms } from "@/lib/cms/mock";
import { __resetAuditForTests } from "@/lib/audit-log/log";

const WS = "ws1";
const URL = "https://s.com/blog/a";

function freshApproval(hash: string): Approval {
  return { approvedRevisionHash: hash, expiresAt: Date.now() + 60_000 };
}

/** A permitted staging target. Individual tests override it to probe the gate. */
const STAGING: ExecuteTarget = { environment: "staging", isMock: true, writable: true };

function ctx(role: "OWNER" | "VIEWER", approval: Approval, extra: Partial<Parameters<typeof executeRevision>[2]> = {}) {
  return {
    workspaceId: WS, userId: "u1", role, protectedPatterns: [] as string[],
    approval, idempotencyKey: `k-${Math.random()}`, target: STAGING, ...extra,
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

/**
 * The write-target gate.
 *
 * Demo mode exists to bypass authentication for local UI work. It must not
 * bypass anything else, and these tests are what hold that line.
 */
describe("execute engine: the write target gate", () => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
  const savedProd = process.env.SEO_ENABLE_PRODUCTION_WRITES;

  function demoMode() {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
  }
  function liveMode() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
  }

  beforeEach(() => {
    __resetExecuteLedger();
    __resetAuditForTests();
    delete process.env.SEO_ENABLE_PRODUCTION_WRITES;
  });

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedDemo === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = savedDemo;
    if (savedProd === undefined) delete process.env.SEO_ENABLE_PRODUCTION_WRITES;
    else process.env.SEO_ENABLE_PRODUCTION_WRITES = savedProd;
  });

  /** A revision whose write would be visible in the CMS if it went through. */
  function scenario() {
    const cms = createMockCms({ [URL]: "<p>services here</p>" });
    const rev = buildRevision("web1", [
      { url: URL, beforeHtml: "<p>services here</p>", afterHtml: "<p>changed</p>" },
    ]);
    return { cms, rev };
  }

  const REAL_PROD: ExecuteTarget = { environment: "production", isMock: false, writable: true };
  const REAL_STAGING: ExecuteTarget = { environment: "staging", isMock: false, writable: true };

  it("demo mode does NOT bypass production-write protection", async () => {
    demoMode();
    const { cms, rev } = scenario();
    const r = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_PROD }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/production writes are disabled/);
    // And the page is untouched.
    expect((await cms.getPage(URL))?.html).toBe("<p>services here</p>");
  });

  it("demo mode is refused for production even when the flag IS set", async () => {
    demoMode();
    process.env.SEO_ENABLE_PRODUCTION_WRITES = "1";
    const { cms, rev } = scenario();
    const r = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_PROD }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/demo mode is not permitted/);
    expect((await cms.getPage(URL))?.html).toBe("<p>services here</p>");
  });

  it("production writes stay blocked in live mode while the flag is 0", async () => {
    liveMode();
    process.env.SEO_ENABLE_PRODUCTION_WRITES = "0";
    const { cms, rev } = scenario();
    const r = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_PROD }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/production writes are disabled/);
  });

  it("a production write succeeds only in live mode with the flag explicitly 1", async () => {
    liveMode();
    process.env.SEO_ENABLE_PRODUCTION_WRITES = "1";
    const { cms, rev } = scenario();
    const r = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_PROD }),
    );
    expect(r.ok).toBe(true);
  });

  it("a mock connection can never be used against production", async () => {
    liveMode();
    process.env.SEO_ENABLE_PRODUCTION_WRITES = "1";
    const { cms, rev } = scenario();
    const r = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval(rev.revisionHash), {
        target: { environment: "production", isMock: true, writable: true },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/mock connection can never be used against production/);
  });

  it("a staging write needs no production flag — but does need read/write", async () => {
    demoMode();
    process.env.SEO_ENABLE_PRODUCTION_WRITES = "0";
    const { cms, rev } = scenario();

    const readOnly = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval(rev.revisionHash), {
        target: { ...REAL_STAGING, writable: false },
      }),
    );
    expect(readOnly.ok).toBe(false);
    if (!readOnly.ok) expect(readOnly.reason).toMatch(/read-only/);
    expect((await cms.getPage(URL))?.html).toBe("<p>services here</p>");

    const writable = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_STAGING }),
    );
    expect(writable.ok).toBe(true);
    expect((await cms.getPage(URL))?.html).toBe("<p>changed</p>");
  });

  it("fails closed on an ambiguous or missing target", async () => {
    demoMode();
    const cases: [string, unknown][] = [
      ["missing", undefined],
      ["null", null],
      ["unknown environment", { environment: "dev", isMock: false, writable: true }],
      ["empty environment", { environment: "", isMock: false, writable: true }],
      ["non-boolean isMock", { environment: "staging", isMock: "no", writable: true }],
      ["non-boolean writable", { environment: "staging", isMock: false, writable: "yes" }],
    ];
    for (const [label, target] of cases) {
      const { cms, rev } = scenario();
      const r = await executeRevision(
        rev,
        cms,
        ctx("OWNER", freshApproval(rev.revisionHash), { target: target as ExecuteTarget }),
      );
      expect(r.ok, label).toBe(false);
      if (!r.ok) expect(r.reason, label).toMatch(/ambiguous|no write target/);
      expect((await cms.getPage(URL))?.html, label).toBe("<p>services here</p>");
    }
  });

  it("the target gate runs BEFORE the approval, so a bad target is refused first", async () => {
    demoMode();
    const { cms, rev } = scenario();
    // Both a wrong approval AND a read-only target: the target must win.
    const r = await executeRevision(
      rev,
      cms,
      ctx("OWNER", freshApproval("wronghash"), {
        target: { ...REAL_STAGING, writable: false },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/read-only/);
  });

  it("every downstream check is still enforced on a permitted staging target", async () => {
    demoMode();

    // permission
    {
      const { cms, rev } = scenario();
      const r = await executeRevision(
        rev, cms, ctx("VIEWER", freshApproval(rev.revisionHash), { target: REAL_STAGING }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/may not execute/);
    }
    // approval hash
    {
      const { cms, rev } = scenario();
      const r = await executeRevision(
        rev, cms, ctx("OWNER", freshApproval("nope"), { target: REAL_STAGING }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/approval does not match/);
    }
    // expiry
    {
      const { cms, rev } = scenario();
      const r = await executeRevision(
        rev, cms,
        ctx("OWNER", { approvedRevisionHash: rev.revisionHash, expiresAt: Date.now() - 1 }, { target: REAL_STAGING }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/expired/);
    }
    // protected URL
    {
      const { cms, rev } = scenario();
      const r = await executeRevision(
        rev, cms,
        ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_STAGING, protectedPatterns: ["/blog/**"] }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/protected URL/);
    }
    // freshness
    {
      const { cms, rev } = scenario();
      await cms.writePage(URL, "<p>someone else edited this</p>");
      const r = await executeRevision(
        rev, cms, ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_STAGING }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/stale/);
    }
    // idempotency
    {
      const { cms, rev } = scenario();
      const key = `idem-${Math.random()}`;
      const first = await executeRevision(
        rev, cms, ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_STAGING, idempotencyKey: key }),
      );
      expect(first.ok).toBe(true);
      const replay = await executeRevision(
        rev, cms, ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_STAGING, idempotencyKey: key }),
      );
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.reason).toMatch(/idempotent replay/);
    }
    // dry run validates everything and writes nothing
    {
      const { cms, rev } = scenario();
      const r = await executeRevision(
        rev, cms, ctx("OWNER", freshApproval(rev.revisionHash), { target: REAL_STAGING, dryRun: true }),
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.dryRun).toBe(true);
      expect((await cms.getPage(URL))?.html).toBe("<p>services here</p>");
    }
  });
});
