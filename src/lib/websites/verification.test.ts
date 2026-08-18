import { describe, it, expect } from "vitest";
import { issueToken, checkVerification, verificationInstructions } from "./verification";

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
