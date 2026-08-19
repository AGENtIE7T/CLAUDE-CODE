import { describe, it, expect } from "vitest";
import { applyLinks } from "./apply";

describe("html-safe link application", () => {
  it("links the first safe occurrence of the anchor in body text", () => {
    const html = "<p>We offer estate planning services to families.</p>";
    const r = applyLinks(html, [{ anchor: "estate planning services", targetUrl: "https://s.com/estate" }]);
    expect(r.applied).toHaveLength(1);
    expect(r.html).toContain('<a href="https://s.com/estate">estate planning services</a>');
  });

  it("never inserts inside an existing anchor, heading, or code block", () => {
    const html =
      '<h1>estate planning services</h1><a href="/x">estate planning services</a><code>estate planning services</code><p>estate planning services here</p>';
    const r = applyLinks(html, [{ anchor: "estate planning services", targetUrl: "https://s.com/estate" }]);
    // Heading, existing anchor and code untouched; only the <p> occurrence links.
    expect(r.html).toMatch(/<h1>estate planning services<\/h1>/);
    expect(r.html).toMatch(/<code>estate planning services<\/code>/);
    expect((r.html.match(/href="https:\/\/s\.com\/estate"/g) ?? [])).toHaveLength(1);
  });

  it("does not double-link the same target", () => {
    const html = '<p>estate planning services</p><a href="https://s.com/estate">already</a>';
    const r = applyLinks(html, [{ anchor: "estate planning services", targetUrl: "https://s.com/estate" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/already linked/);
  });

  it("skips when no safe occurrence exists", () => {
    const html = "<h1>estate planning services</h1>";
    const r = applyLinks(html, [{ anchor: "estate planning services", targetUrl: "https://s.com/estate" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/no safe occurrence/);
  });

  it("escapes the target url in the href", () => {
    const html = "<p>see services now</p>";
    const r = applyLinks(html, [{ anchor: "services", targetUrl: 'https://s.com/a?b=1&c="x"' }]);
    expect(r.html).toContain("&amp;");
    expect(r.html).not.toContain('c="x""'); // quote escaped
  });
});
