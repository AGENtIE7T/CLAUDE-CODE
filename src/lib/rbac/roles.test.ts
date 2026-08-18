import { describe, it, expect } from "vitest";
import { can, assertCan, AuthorizationError, outranks, roleRank } from "./roles";

describe("rbac: permission matrix", () => {
  it("OWNER can do everything sensitive", () => {
    expect(can("OWNER", "revision.execute")).toBe(true);
    expect(can("OWNER", "billing.manage")).toBe(true);
    expect(can("OWNER", "ownership.transfer")).toBe(true);
  });

  it("SEO_MANAGER can run audits and previews but NOT approve or execute", () => {
    expect(can("SEO_MANAGER", "audit.run")).toBe(true);
    expect(can("SEO_MANAGER", "preview.create")).toBe(true);
    expect(can("SEO_MANAGER", "preview.approve")).toBe(false);
    expect(can("SEO_MANAGER", "revision.execute")).toBe(false);
  });

  it("EDITOR can approve/reject but not manage connections or execute writes", () => {
    expect(can("EDITOR", "preview.approve")).toBe(true);
    expect(can("EDITOR", "preview.reject")).toBe(true);
    expect(can("EDITOR", "connection.manage")).toBe(false);
    expect(can("EDITOR", "revision.execute")).toBe(false);
  });

  it("VIEWER is read-only", () => {
    expect(can("VIEWER", "report.read")).toBe(true);
    expect(can("VIEWER", "task.read")).toBe(true);
    expect(can("VIEWER", "crawl.run")).toBe(false);
    expect(can("VIEWER", "preview.create")).toBe(false);
  });

  it("assertCan throws AuthorizationError when denied", () => {
    expect(() => assertCan("VIEWER", "revision.execute")).toThrow(AuthorizationError);
    expect(() => assertCan("OWNER", "revision.execute")).not.toThrow();
  });

  it("role ranking: OWNER outranks everyone; VIEWER outranks no one", () => {
    expect(roleRank("OWNER")).toBeLessThan(roleRank("VIEWER"));
    expect(outranks("OWNER", "ADMIN")).toBe(true);
    expect(outranks("ADMIN", "OWNER")).toBe(false);
    expect(outranks("VIEWER", "EDITOR")).toBe(false);
  });
});
