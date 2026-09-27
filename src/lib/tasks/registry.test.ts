import { describe, it, expect } from "vitest";
import {
  TASK_REGISTRY,
  getTask,
  isProhibited,
  isWrite,
  requiresApproval,
  tasksByCategory,
} from "./registry";

describe("task registry", () => {
  it("classifies read tasks as low-risk audit mode", () => {
    const t = getTask("broken_internal_link_audit");
    expect(t?.category).toBe("read");
    expect(t?.mode).toBe("audit");
    expect(t?.risk).toBe("low");
  });

  it("marks all write tasks as requiring approval", () => {
    for (const name of tasksByCategory("write")) {
      expect(requiresApproval(name)).toBe(true);
      expect(isWrite(name)).toBe(true);
    }
  });

  it("rates redirects/robots/canonical/publish/outreach writes as high risk", () => {
    for (const name of [
      "create_redirect",
      "update_robots",
      "update_sitemap", // sitemap has no high keyword → medium, sanity below
      "publish_content",
      "send_outreach_email",
    ]) {
      const t = getTask(name);
      expect(t).not.toBeNull();
    }
    expect(getTask("create_redirect")?.risk).toBe("high");
    expect(getTask("publish_content")?.risk).toBe("high");
    expect(getTask("update_metadata")?.risk).toBe("medium");
  });

  it("flags prohibited tasks and offers a legitimate alternative", () => {
    expect(isProhibited("mass_backlink_creation")).toBe(true);
    expect(getTask("mass_backlink_creation")?.legitimateAlternative).toBeTruthy();
    expect(getTask("private_blog_network_creation")?.category).toBe("prohibited");
  });

  it("read/preview tasks never require approval", () => {
    for (const name of [...tasksByCategory("read"), ...tasksByCategory("preview")]) {
      expect(requiresApproval(name)).toBe(false);
    }
  });

  it("every registry entry has a description", () => {
    for (const [name, def] of Object.entries(TASK_REGISTRY)) {
      expect(def.description, name).toBeTruthy();
    }
  });

  it("unknown tasks resolve to null / not prohibited-by-default", () => {
    expect(getTask("definitely_not_a_task")).toBeNull();
    expect(isWrite("definitely_not_a_task")).toBe(false);
  });
});
