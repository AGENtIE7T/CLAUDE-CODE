import { describe, it, expect } from "vitest";
import { resolveStatus } from "./run";

describe("resolveStatus — the approval-queue default is enforced", () => {
  it("approval_queue always parks for review", () => {
    expect(resolveStatus("approval_queue", "owned_site")).toBe("pending_approval");
    expect(resolveStatus("approval_queue", "social")).toBe("pending_approval");
  });

  it("community and directory never auto-publish, even at fully_auto", () => {
    expect(resolveStatus("fully_auto", "community")).toBe("pending_approval");
    expect(resolveStatus("fully_auto", "directory")).toBe("pending_approval");
    expect(resolveStatus("semi_auto", "community")).toBe("pending_approval");
  });

  it("semi_auto auto-approves owned_site and social only", () => {
    expect(resolveStatus("semi_auto", "owned_site")).toBe("approved");
    expect(resolveStatus("semi_auto", "social")).toBe("approved");
  });

  it("fully_auto approves owned_site and social", () => {
    expect(resolveStatus("fully_auto", "owned_site")).toBe("approved");
    expect(resolveStatus("fully_auto", "social")).toBe("approved");
  });
});
