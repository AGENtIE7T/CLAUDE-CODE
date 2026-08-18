import { describe, it, expect } from "vitest";
import { normalizeUrl, resolveUrl, sameHost } from "./normalize";

describe("url normalization", () => {
  it("strips tracking params and sorts the rest", () => {
    expect(normalizeUrl("https://a.com/p?utm_source=x&b=2&a=1"))
      .toBe("https://a.com/p?a=1&b=2");
  });
  it("drops fragments and default ports", () => {
    expect(normalizeUrl("https://a.com:443/p#section")).toBe("https://a.com/p");
    expect(normalizeUrl("http://a.com:80/")).toBe("http://a.com/");
  });
  it("collapses trailing slash except root", () => {
    expect(normalizeUrl("https://a.com/path/")).toBe("https://a.com/path");
    expect(normalizeUrl("https://a.com/")).toBe("https://a.com/");
  });
  it("dedupes identical-after-normalization URLs", () => {
    const a = normalizeUrl("https://a.com/p/?utm_medium=x");
    const b = normalizeUrl("https://a.com/p#top");
    expect(a).toBe(b);
  });
  it("rejects non-http and invalid", () => {
    expect(normalizeUrl("ftp://a.com")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
  it("strips configured extra params", () => {
    expect(normalizeUrl("https://a.com/p?sid=123&a=1", { stripParams: ["sid"] }))
      .toBe("https://a.com/p?a=1");
  });
  it("resolves relative and compares hosts", () => {
    expect(resolveUrl("/x", "https://a.com/y")).toBe("https://a.com/x");
    expect(sameHost("https://www.a.com/x", "https://a.com/y")).toBe(true);
    expect(sameHost("https://a.com", "https://b.com")).toBe(false);
  });
});
