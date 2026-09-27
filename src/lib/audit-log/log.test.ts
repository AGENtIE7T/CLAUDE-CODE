import { describe, it, expect, beforeEach } from "vitest";
import { audit, redact, hashInput, recentAudit, __resetAuditForTests } from "./log";

describe("audit log: secret redaction", () => {
  it("redacts API keys, bearer/basic tokens, and creds in URLs", () => {
    expect(redact("key sk-ant-abcdef1234567890abcd")).toContain("[REDACTED]");
    expect(redact("Authorization: Bearer abcdef1234567890")).toContain("[REDACTED]");
    expect(redact("auth Basic YWxhZGRpbjpvcGVuc2VzYW1l")).toContain("[REDACTED]");
    expect(redact('{"token":"supersecretvalue"}')).toContain("[REDACTED]");
    expect(redact("https://user:pass@example.com")).toContain("[REDACTED]");
  });

  it("does not alter clean text", () => {
    expect(redact("crawled 42 pages, 3 broken links")).toBe("crawled 42 pages, 3 broken links");
  });
});

describe("audit log: hashing", () => {
  it("hashes deterministically and redacts before hashing", () => {
    const a = hashInput({ token: "sk-ant-abcdefghijklmnop", n: 1 });
    const b = hashInput({ token: "sk-ant-ZZZZZZZZZZZZZZZZ", n: 1 });
    // Both token values are redacted to the same string before hashing.
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });
});

describe("audit log: recording (demo mode)", () => {
  beforeEach(() => __resetAuditForTests());

  it("records and reads back scoped by workspace", async () => {
    await audit({
      workspaceId: "w1",
      userId: "u1",
      action: "crawl.start",
      resourceType: "crawl_run",
      resourceId: "c1",
      input: { url: "https://example.com", token: "sk-ant-secretsecretsecret" },
      resultSummary: "queued crawl",
    });
    await audit({
      workspaceId: "w2",
      userId: "u2",
      action: "crawl.start",
      resourceType: "crawl_run",
      resultSummary: "other workspace",
    });

    const w1 = recentAudit("w1");
    expect(w1).toHaveLength(1);
    expect(w1[0].action).toBe("crawl.start");
    expect(w1[0].inputHash).toHaveLength(64);
    // Cross-tenant isolation: w2's entry does not appear under w1.
    expect(recentAudit("w2")).toHaveLength(1);
  });
});
