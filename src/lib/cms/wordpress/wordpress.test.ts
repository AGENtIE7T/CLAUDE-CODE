import { describe, it, expect, beforeEach } from "vitest";
import { createMockWordPress, type MockWordPress } from "./mock-server";
import { createWordPressConnection } from "./client";
import { createWordPressCmsStore, rollbackFromBackups } from "./store";
import { WP_ORIGIN } from "./fixtures";
import { assertUsable, CmsError, describeCapabilities } from "@/lib/cms/adapter";
import { createMemoryBackupStore } from "@/lib/backups/snapshot";
import { classifyInjection } from "@/lib/injection/classify";

const TOKEN = "dXNlcjphcHAtcGFzc3dvcmQ="; // base64 "user:app-password"

let wp: MockWordPress;

function conn(over: Partial<Parameters<typeof createWordPressConnection>[0]> = {}) {
  return createWordPressConnection({
    baseUrl: WP_ORIGIN,
    token: TOKEN,
    environment: "staging",
    label: "Fixture WP",
    isMock: true,
    fetchImpl: wp.fetch,
    timeoutMs: 50,
    ...over,
  });
}

beforeEach(() => {
  wp = createMockWordPress();
});

describe("wordpress: connection verification", () => {
  it("verifies a healthy connection and reports the site name", async () => {
    const v = await conn().verify();
    expect(v.ok).toBe(true);
    expect(v.siteName).toBe("Fixture WP (mock)");
    expect(v.capabilities.write).toBe(true);
    expect(v.checkedAt).toBeTruthy();
  });

  it("reports auth_failure without throwing", async () => {
    wp.faults.auth = true;
    const v = await conn().verify();
    expect(v.ok).toBe(false);
    expect(v.error?.code).toBe("auth_failed");
  });

  it("describes read-only capability honestly", async () => {
    const c = conn({ access: "read_only" });
    expect(c.capabilities.write).toBe(false);
    expect(describeCapabilities(c.capabilities)).toBe("read-only");
  });
});

describe("wordpress: reading", () => {
  it("lists posts and pages", async () => {
    const refs = await conn().list();
    expect(refs.length).toBeGreaterThan(8);
    expect(refs.some((r) => r.type === "post")).toBe(true);
    expect(refs.some((r) => r.type === "page")).toBe(true);
  });

  it("fetches content by id and by url", async () => {
    const c = conn();
    const byId = await c.get(10);
    expect(byId.title).toBe("Emergency Roof Repair");
    const byUrl = await c.getByUrl(`${WP_ORIGIN}/services/roof-repair`);
    expect(byUrl.id).toBe(10);
    expect(byUrl.html).toContain("emergency roof repair team");
  });

  it("surfaces a missing title as null (not an empty string)", async () => {
    const notes = await conn().get(30);
    expect(notes.title).toBeNull();
  });

  it("reads the noindex directive", async () => {
    expect((await conn().get(31)).noindex).toBe(true);
    expect((await conn().get(10)).noindex).toBe(false);
  });

  it("exposes existing internal links in the body", async () => {
    const post = await conn().get(20);
    expect(post.html).toContain(`href="${WP_ORIGIN}/services/gutter-cleaning"`);
  });

  it("exposes a broken internal link for the audit to find", async () => {
    const post = await conn().get(21);
    expect(post.html).toContain(`${WP_ORIGIN}/blog/old-guide`);
    const urls = await conn().list();
    expect(urls.some((u) => u.url.endsWith("/blog/old-guide"))).toBe(false);
  });

  it("404s a resource that does not exist", async () => {
    await expect(conn().get(9999)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("wordpress: failure modes", () => {
  it("maps 401 to auth_failed and does not retry it", async () => {
    wp.faults.auth = true;
    await expect(conn().list()).rejects.toMatchObject({ code: "auth_failed", retryable: false });
  });

  it("maps 429 to rate_limited with a retry delay", async () => {
    wp.faults.rateLimitAfter = 1;
    const c = conn();
    await c.verify();
    await expect(c.list()).rejects.toMatchObject({ code: "rate_limited", retryable: true });
    await c.list().catch((e: CmsError) => {
      expect(e.retryAfterMs).toBeGreaterThan(0);
    });
  });

  it("maps a hung request to timeout", async () => {
    wp.faults.timeoutOn = "/wp/v2/posts";
    await expect(conn().list()).rejects.toMatchObject({ code: "timeout" });
  });

  it("maps a 500 on write to write_failed", async () => {
    wp.faults.writeFailIds = [10];
    await expect(conn().update(10, "<p>x</p>")).rejects.toMatchObject({ code: "write_failed" });
  });

  it("refuses a write on a read-only connection", async () => {
    await expect(conn({ access: "read_only" }).update(10, "<p>x</p>")).rejects.toMatchObject({
      code: "read_only",
    });
  });
});

describe("wordpress: optimistic concurrency", () => {
  it("updates content and returns the new version", async () => {
    const c = conn();
    const before = await c.get(10);
    const res = await c.update(10, "<p>rewritten</p>", { expectedVersion: before.version });
    expect(res.html).toBe("<p>rewritten</p>");
    expect(res.version).not.toBe(before.version);
    expect(wp.contentOf(10)).toBe("<p>rewritten</p>");
  });

  it("rejects a stale write when the page changed after the preview", async () => {
    const c = conn();
    const before = await c.get(10);
    wp.touch(10); // someone else edits between preview and write
    await expect(
      c.update(10, "<p>rewritten</p>", { expectedVersion: before.version }),
    ).rejects.toMatchObject({ code: "stale_content", retryable: false });
    // and nothing was written
    expect(wp.contentOf(10)).not.toBe("<p>rewritten</p>");
  });

  it("dryRun never writes", async () => {
    const c = conn();
    const before = await c.get(10);
    const res = await c.update(10, "<p>nope</p>", { expectedVersion: before.version, dryRun: true });
    expect(res.ok).toBe(true);
    expect(wp.contentOf(10)).toBe(before.html);
  });

  it("detects a write the server silently ignored (verification failure)", async () => {
    wp.faults.verifyFailIds = [10];
    const c = conn();
    const before = await c.get(10);
    await c.update(10, "<p>attempted</p>", { expectedVersion: before.version });
    // The server reported success but the content never changed. A caller MUST
    // re-read to notice; this is exactly what execute/engine.ts does.
    const after = await c.get(10);
    expect(after.html).toBe(before.html);
    expect(after.html).not.toContain("attempted");
  });
});

describe("wordpress: mock isolation", () => {
  it("refuses a mock connection against production", () => {
    const c = conn({ environment: "production", isMock: true });
    expect(() => assertUsable(c)).toThrowError(/never be used against production/);
    try {
      assertUsable(c);
    } catch (e) {
      expect((e as CmsError).code).toBe("mock_in_production");
    }
  });

  it("allows a non-mock connection against production", () => {
    const c = conn({ environment: "production", isMock: false });
    expect(() => assertUsable(c)).not.toThrow();
  });
});

describe("wordpress: credential safety", () => {
  it("never exposes the token on the connection object", () => {
    const c = conn();
    expect(JSON.stringify(c)).not.toContain(TOKEN);
    expect(Object.values(c).join(" ")).not.toContain(TOKEN);
  });

  it("never includes the token in an error message", async () => {
    wp.faults.auth = true;
    const v = await conn().verify();
    expect(JSON.stringify(v)).not.toContain(TOKEN);
  });

  it("sends the credential only as an Authorization header", async () => {
    await conn().verify();
    expect(wp.requests.join(" ")).not.toContain(TOKEN);
  });
});

describe("wordpress: untrusted content", () => {
  it("treats prompt-injection page copy as data, and flags it", async () => {
    const faq = await conn().get(50);
    expect(faq.html).toContain("IGNORE ALL PREVIOUS INSTRUCTIONS");
    // The classifier must notice it; nothing in the pipeline acts on it.
    const verdict = classifyInjection(faq.html);
    expect(verdict.suspicious).toBe(true);
  });
});

describe("wordpress: CmsStore bridge, backups and rollback", () => {
  const websiteId = "site-1";

  function store(batchId = "batch-1", requireBackup = true) {
    const backups = createMemoryBackupStore();
    const c = conn();
    return {
      c,
      backups,
      cms: createWordPressCmsStore(c, backups, { websiteId, batchId, requireBackup }),
    };
  }

  it("reads a page through the CmsStore seam", async () => {
    const { cms } = store();
    const page = await cms.getPage(`${WP_ORIGIN}/services/roof-repair`);
    expect(page?.html).toContain("emergency roof repair");
    expect(page?.revision).toBe(1);
  });

  it("returns null for an unknown page rather than throwing", async () => {
    const { cms } = store();
    expect(await cms.getPage(`${WP_ORIGIN}/nope`)).toBeNull();
  });

  it("takes a backup BEFORE writing, and bumps the revision", async () => {
    const { cms, backups } = store();
    const url = `${WP_ORIGIN}/services/roof-repair`;
    const original = wp.contentOf(10);

    const page = await cms.writePage(url, "<p>new body</p>");
    expect(page.revision).toBe(2);
    expect(wp.contentOf(10)).toBe("<p>new body</p>");

    const snap = await backups.latest(websiteId, url);
    expect(snap?.html).toBe(original);
  });

  it("lists urls", async () => {
    const { cms } = store();
    const urls = await cms.listUrls();
    expect(urls).toContain(`${WP_ORIGIN}/services/roof-repair`);
  });

  it("rolls a batch back to the backed-up bytes", async () => {
    const { c, cms, backups } = store("batch-roll");
    const url = `${WP_ORIGIN}/services/roof-repair`;
    const original = wp.contentOf(10);

    await cms.writePage(url, "<p>changed</p>");
    expect(wp.contentOf(10)).toBe("<p>changed</p>");

    const out = await rollbackFromBackups(c, backups, "batch-roll");
    expect(out.restored).toEqual([url]);
    expect(out.failed).toEqual([]);
    expect(wp.contentOf(10)).toBe(original);
  });

  it("reports a page it could not roll back instead of claiming success", async () => {
    const { c, cms, backups } = store("batch-fail");
    const url = `${WP_ORIGIN}/services/roof-repair`;
    await cms.writePage(url, "<p>changed</p>");

    wp.faults.writeFailIds = [10]; // rollback write now fails
    const out = await rollbackFromBackups(c, backups, "batch-fail");
    expect(out.restored).toEqual([]);
    expect(out.failed[0]).toMatchObject({ url, reason: "write_failed" });
  });
});
