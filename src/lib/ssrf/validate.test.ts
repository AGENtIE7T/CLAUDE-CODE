import { describe, it, expect } from "vitest";
import {
  assertUrlAllowed,
  isUrlAllowed,
  isBlockedIp,
  isPrivateIpv4,
  isBlockedIpv6,
  parseIpv4,
  SsrfError,
} from "./validate";

describe("ssrf: scheme enforcement", () => {
  it("allows http and https", () => {
    expect(isUrlAllowed("https://example.com/page")).toBe(true);
    expect(isUrlAllowed("http://example.com")).toBe(true);
  });
  it("blocks non-http schemes", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://example.com",
      "gopher://example.com",
      "data:text/html,hi",
    ]) {
      expect(isUrlAllowed(u)).toBe(false);
    }
  });
});

describe("ssrf: hostname / IP blocking", () => {
  it("blocks localhost and loopback forms", () => {
    expect(isUrlAllowed("http://localhost/")).toBe(false);
    expect(isUrlAllowed("http://127.0.0.1/")).toBe(false);
    expect(isUrlAllowed("http://127.5.5.5/")).toBe(false);
    expect(isUrlAllowed("http://[::1]/")).toBe(false);
  });
  it("blocks private IPv4 ranges", () => {
    expect(isUrlAllowed("http://10.0.0.1/")).toBe(false);
    expect(isUrlAllowed("http://192.168.1.1/")).toBe(false);
    expect(isUrlAllowed("http://172.16.0.1/")).toBe(false);
    expect(isUrlAllowed("http://169.254.0.1/")).toBe(false);
  });
  it("blocks the cloud metadata endpoint", () => {
    expect(isUrlAllowed("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });
  it("blocks internal-looking hostnames", () => {
    expect(isUrlAllowed("http://db.internal/")).toBe(false);
    expect(isUrlAllowed("http://server.local/")).toBe(false);
    expect(isUrlAllowed("http://metadata.google.internal/")).toBe(false);
  });
  it("blocks single-label (intranet) hostnames but allows public domains", () => {
    expect(isUrlAllowed("http://intranetbox/")).toBe(false);
    expect(isUrlAllowed("http://jenkins/")).toBe(false);
    expect(isUrlAllowed("https://example.com/")).toBe(true);
  });
  it("normalizes and blocks integer/hex/octal IPv4 localhost forms", () => {
    expect(isUrlAllowed("http://2130706433/")).toBe(false);
    expect(isUrlAllowed("http://0x7f000001/")).toBe(false);
    expect(isUrlAllowed("http://0177.0.0.1/")).toBe(false);
  });
  it("blocks credentials embedded in the URL", () => {
    expect(isUrlAllowed("http://user:pass@example.com/")).toBe(false);
  });
  it("allows a normal public host", () => {
    expect(isUrlAllowed("https://www.example.com/blog/post")).toBe(true);
    expect(isUrlAllowed("https://8.8.8.8/")).toBe(true);
  });
  it("throws SsrfError with a reason", () => {
    try {
      assertUrlAllowed("http://10.0.0.1/");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SsrfError);
      expect((e as SsrfError).reason).toBe("blocked_hostname");
    }
  });
});

describe("ssrf: IP helpers", () => {
  it("parses IPv4", () => {
    expect(parseIpv4("1.2.3.4")).toBe(((1 << 24) | (2 << 16) | (3 << 8) | 4) >>> 0);
    expect(parseIpv4("999.1.1.1")).toBeNull();
    expect(parseIpv4("not-an-ip")).toBeNull();
  });
  it("classifies private IPv4", () => {
    expect(isPrivateIpv4("10.1.2.3")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
  });
  it("classifies blocked IPv6", () => {
    expect(isBlockedIpv6("::1")).toBe(true);
    expect(isBlockedIpv6("fe80::1")).toBe(true);
    expect(isBlockedIpv6("fd00::1")).toBe(true);
    expect(isBlockedIpv6("2606:4700:4700::1111")).toBe(false);
  });
});
