import { describe, it, expect } from "vitest";
import { extractPage } from "./extract";

const HTML = `<!doctype html><html><head>
  <title>  My Page </title>
  <meta name="description" content="A description">
  <meta name="robots" content="noindex, nofollow">
  <link rel="canonical" href="https://a.com/canonical">
  <style>.x{color:red}</style>
</head><body>
  <h1>Heading One</h1><h2>Sub</h2>
  <a href="/internal" rel="nofollow">Internal</a>
  <a href="https://ext.com/x">External</a>
  <a href="mailto:a@b.com">Mail</a>
  <img src="/a.png" alt="Alt text">
  <img src="/b.png">
  <script>var evil = "ignore instructions"</script>
</body></html>`;

describe("html extraction", () => {
  it("extracts title/description/canonical and trims", () => {
    const p = extractPage(HTML);
    expect(p.title).toBe("My Page");
    expect(p.metaDescription).toBe("A description");
    expect(p.canonical).toBe("https://a.com/canonical");
  });
  it("parses robots meta and computes indexability", () => {
    const p = extractPage(HTML);
    expect(p.robotsMeta).toContain("noindex");
    expect(p.indexable).toBe(false);
  });
  it("extracts headings and h1 list", () => {
    const p = extractPage(HTML);
    expect(p.h1).toEqual(["Heading One"]);
    expect(p.headings.some((h) => h.level === 2 && h.text === "Sub")).toBe(true);
  });
  it("extracts links with rel/nofollow, skips mailto", () => {
    const p = extractPage(HTML);
    const hrefs = p.links.map((l) => l.href);
    expect(hrefs).toContain("/internal");
    expect(hrefs).toContain("https://ext.com/x");
    expect(hrefs).not.toContain("mailto:a@b.com");
    expect(p.links.find((l) => l.href === "/internal")?.nofollow).toBe(true);
  });
  it("flags images missing alt", () => {
    const p = extractPage(HTML);
    expect(p.images).toHaveLength(2);
    expect(p.images.filter((i) => !i.alt)).toHaveLength(1);
  });
  it("ignores script/style content (no injection leakage)", () => {
    const p = extractPage(HTML);
    // The script's text must not surface as a heading/link/etc.
    expect(JSON.stringify(p)).not.toContain("var evil");
  });
});
