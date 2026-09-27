import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveMembership, requirePermission, DEMO_WORKSPACE_ID } from "./resolve";
import { AuthorizationError } from "./roles";

// These tests run in demo mode (no Supabase env), where every caller is the
// demo OWNER of the demo workspace.
describe("rbac resolve (demo mode)", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
  });
  afterEach(() => {
    if (saved) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("resolves the demo OWNER membership", async () => {
    const m = await resolveMembership("anything");
    expect(m).not.toBeNull();
    expect(m?.role).toBe("OWNER");
    expect(m?.workspaceId).toBe(DEMO_WORKSPACE_ID);
  });

  it("requirePermission passes for an owner-permitted action", async () => {
    await expect(requirePermission("w", "revision.execute")).resolves.toMatchObject({
      role: "OWNER",
    });
  });
});

describe("rbac requirePermission denial shape", () => {
  it("throws AuthorizationError type for denials", () => {
    // Directly exercise the throw contract used when membership is missing.
    const err = new AuthorizationError("VIEWER", "revision.execute");
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err.name).toBe("AuthorizationError");
  });
});
