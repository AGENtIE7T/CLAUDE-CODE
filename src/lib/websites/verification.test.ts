import { describe, it, expect } from "vitest";
import {
  issueToken,
  checkVerification,
  connectionProvesOwnership,
  verificationInstructions,
} from "./verification";

describe("domain verification", () => {
  it("issues a namespaced token", () => {
    const t = issueToken("web-1");
    expect(t.startsWith("seo-cc-verify=")).toBe(true);
    // Distinct each call.
    expect(issueToken("web-1")).not.toBe(t);
  });

  it("verifies DNS TXT when the token is present", () => {
    const t = issueToken("web-1");
    expect(checkVerification("dns", t, { dnsTxt: ["something-else", t] }).verified).toBe(true);
    expect(checkVerification("dns", t, { dnsTxt: ["nope"] }).verified).toBe(false);
  });

  it("verifies HTML file and meta tag by content", () => {
    const t = issueToken("web-2");
    expect(checkVerification("html_file", t, { fileBody: `${t}\n` }).verified).toBe(true);
    expect(checkVerification("html_file", t, { fileBody: "" }).verified).toBe(false);
    expect(
      checkVerification("meta_tag", t, { homepageHtml: `<head><meta content="${t}"></head>` }).verified,
    ).toBe(true);
    expect(checkVerification("meta_tag", t, { homepageHtml: "<head></head>" }).verified).toBe(false);
  });

  it("verifies integrations only when confirmed", () => {
    const t = issueToken("web-3");
    expect(checkVerification("search_console", t, { integrationConfirmed: true }).verified).toBe(true);
    expect(checkVerification("cms_connection", t, { integrationConfirmed: false }).verified).toBe(false);
  });

  it("produces placement instructions per method", () => {
    const t = issueToken("web-4");
    expect(verificationInstructions("dns", "acme.com", t).value).toBe(t);
    expect(verificationInstructions("meta_tag", "acme.com", t).value).toContain("<meta");
  });
});

describe("a CMS connection only proves ownership of its own site", () => {
  it("accepts a connection pointing at the website's domain", () => {
    const r = connectionProvesOwnership("staging.example.com", "https://staging.example.com");
    expect(r.proves).toBe(true);
    expect(r.reason).toMatch(/staging\.example\.com/);
  });

  it("ignores a leading www. on either side", () => {
    expect(connectionProvesOwnership("example.com", "https://www.example.com").proves).toBe(true);
    expect(connectionProvesOwnership("www.example.com", "https://example.com").proves).toBe(true);
  });

  it("refuses a connection to a DIFFERENT site — this is the whole point", () => {
    const r = connectionProvesOwnership("example.com", "https://someone-elses-site.com");
    expect(r.proves).toBe(false);
    expect(r.reason).toMatch(/never verifies another/);
  });

  it("treats a subdomain as a different site", () => {
    expect(connectionProvesOwnership("example.com", "https://staging.example.com").proves).toBe(false);
    expect(connectionProvesOwnership("staging.example.com", "https://example.com").proves).toBe(false);
  });

  it("refuses when there is no connection or no domain", () => {
    expect(connectionProvesOwnership("example.com", null).proves).toBe(false);
    expect(connectionProvesOwnership("example.com", undefined).proves).toBe(false);
    expect(connectionProvesOwnership("", "https://example.com").proves).toBe(false);
  });

  it("refuses an unreadable connection URL rather than throwing", () => {
    expect(() => connectionProvesOwnership("example.com", "not a url")).not.toThrow();
    expect(connectionProvesOwnership("example.com", "not a url").proves).toBe(false);
  });
});
