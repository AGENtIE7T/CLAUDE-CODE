import { describe, expect, it } from "vitest";
import { generatorSystem, inputsJson, modeFor, playbookText, viralPatternsText } from "../lib/prompts";
import { BusinessInputSchema } from "../lib/schema";

const creator = {
  kind: "creator",
  business_name: "@fitwithriya",
  niche: "c_fitness",
  sub_niche: "home workouts for working women",
  target_customer: "women 22-35, busy jobs, no gym",
  offer: "reach 10k followers and sell a ₹499 plan",
  usp: "lost 18 kg at home while working full time",
  on_camera: "self",
};

describe("creator mode", () => {
  it("accepts a creator without city/area", () => {
    const r = BusinessInputSchema.safeParse(creator);
    expect(r.success).toBe(true);
    expect(r.success && modeFor(r.data)).toBe("CREATOR");
  });

  it("still requires city/area for businesses", () => {
    const r = BusinessInputSchema.safeParse({ ...creator, kind: "business", niche: "gym", on_camera: "owner" });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["city", "area"]));
  });

  it("rejects a business niche or business on-camera choice in creator mode", () => {
    expect(BusinessInputSchema.safeParse({ ...creator, niche: "gym" }).success).toBe(false);
    expect(BusinessInputSchema.safeParse({ ...creator, on_camera: "staff" }).success).toBe(false);
  });

  it("old records without kind parse as business", () => {
    const r = BusinessInputSchema.parse({ ...creator, kind: undefined, niche: "gym", on_camera: "owner", city: "Noida", area: "Sector 62" });
    expect(r.kind).toBe("business");
  });

  it("builds creator-specific inputs, playbook and patterns", () => {
    const i = BusinessInputSchema.parse(creator);
    const json = JSON.parse(inputsJson(i));
    expect(json).toMatchObject({ creator_name_or_handle: "@fitwithriya", goal_for_this_content: creator.offer, mode: "CREATOR", location: "(not relevant)" });
    expect(json.main_offer).toBeUndefined();
    expect(playbookText(i)).toContain("exact-number transformations");
    const v = viralPatternsText(i);
    expect(v).toContain("Across creator content");
    expect(v).toContain("135 kg to 63 kg");
    const sys = generatorSystem(i);
    expect(sys).toContain("- CREATOR:");
    expect(sys).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("uses the creator 'Other' instruction", () => {
    const i = BusinessInputSchema.parse({ ...creator, niche: "other", custom_niche: "book reviews" });
    expect(playbookText(i)).toContain("follow, save and share");
  });
});
