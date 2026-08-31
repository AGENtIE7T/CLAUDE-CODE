import { describe, it, expect } from "vitest";
import { matchesPattern, isProtected, partitionProtected } from "./protected";

describe("protected-url matching", () => {
  it("matches a single-segment wildcard without crossing /", () => {
    expect(matchesPattern("/checkout/pay", "/checkout/*")).toBe(true);
    expect(matchesPattern("/checkout/pay/confirm", "/checkout/*")).toBe(false);
  });

  it("matches deep wildcard across /", () => {
    expect(matchesPattern("/checkout/pay/confirm", "/checkout/**")).toBe(true);
  });

  it("matches an exact path", () => {
    expect(matchesPattern("/robots.txt", "/robots.txt")).toBe(true);
    expect(matchesPattern("/robots.txtx", "/robots.txt")).toBe(false);
  });

  it("reduces full URLs to path before matching", () => {
    expect(matchesPattern("https://acme.com/admin/settings", "/admin/**")).toBe(true);
    expect(matchesPattern("/admin/settings", "https://acme.com/admin/**")).toBe(true);
  });

  it("does not treat glob chars as regex injection", () => {
    // A pattern with regex metachars should be matched literally (except globs)
    expect(matchesPattern("/a.b", "/a.b")).toBe(true);
    expect(matchesPattern("/axb", "/a.b")).toBe(false); // "." is literal, not regex-any
  });

  it("isProtected returns true if ANY pattern matches", () => {
    const patterns = ["/checkout/**", "/admin/**", "/cart"];
    expect(isProtected("/admin/x", patterns)).toBe(true);
    expect(isProtected("/blog/post", patterns)).toBe(false);
  });

  it("partitions URLs into allowed and protected", () => {
    const urls = ["/blog/a", "/checkout/pay", "/services/x", "/admin/y"];
    const { allowed, protectedUrls } = partitionProtected(urls, ["/checkout/**", "/admin/**"]);
    expect(allowed).toEqual(["/blog/a", "/services/x"]);
    expect(protectedUrls).toEqual(["/checkout/pay", "/admin/y"]);
  });
});
