import { describe, it, expect } from "vitest";
import { shareOfVoice } from "./probe";

describe("shareOfVoice", () => {
  it("is 0 with no probes", () => {
    expect(shareOfVoice([])).toBe(0);
  });
  it("is a rounded percentage of mentioned rows", () => {
    expect(
      shareOfVoice([{ mentioned: true }, { mentioned: false }, { mentioned: true }]),
    ).toBe(67);
  });
  it("is 100 when every row mentions the brand", () => {
    expect(shareOfVoice([{ mentioned: true }, { mentioned: true }])).toBe(100);
  });
});
