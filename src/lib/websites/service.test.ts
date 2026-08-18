import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createWebsite, listWebsites } from "./service";
import { __resetSeoDemo } from "@/lib/seo/demo-store";
import { __resetAuditForTests, recentAudit } from "@/lib/audit-log/log";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";

describe("website service (demo mode)", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    __resetSeoDemo();
    __resetAuditForTests();
  });
  afterEach(() => {
    if (saved) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("lists the seeded demo website", async () => {
    const list = await listWebsites(DEMO_WORKSPACE_ID);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].workspaceId).toBe(DEMO_WORKSPACE_ID);
  });

  it("creates a valid website (unverified) and writes an audit entry", async () => {
    const before = (await listWebsites(DEMO_WORKSPACE_ID)).length;
    const res = await createWebsite(DEMO_WORKSPACE_ID, {
      name: "New Site",
      url: "https://newsite.example",
    });
    expect(res.ok).toBe(true);
    expect(res.website?.ownershipVerifiedAt).toBeNull(); // must start unverified
    const after = await listWebsites(DEMO_WORKSPACE_ID);
    expect(after.length).toBe(before + 1);

    const log = recentAudit(DEMO_WORKSPACE_ID);
    expect(log.some((e) => e.action === "website.create")).toBe(true);
  });

  it("rejects an invalid (SSRF-unsafe) website and does not persist it", async () => {
    const before = (await listWebsites(DEMO_WORKSPACE_ID)).length;
    const res = await createWebsite(DEMO_WORKSPACE_ID, {
      name: "Bad",
      url: "http://127.0.0.1/",
    });
    expect(res.ok).toBe(false);
    expect(res.issues?.length).toBeGreaterThan(0);
    expect((await listWebsites(DEMO_WORKSPACE_ID)).length).toBe(before);
  });
});
