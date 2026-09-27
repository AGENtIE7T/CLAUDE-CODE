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

describe("matching real-world content", () => {
  it("links a phrase that wraps across a newline, as stored WordPress content does", () => {
    const html = "<p>We handle probate\nadministration for local families.</p>";
    const r = applyLinks(html, [{ anchor: "probate administration", targetUrl: "/services/probate" }]);
    expect(r.applied).toHaveLength(1);
    expect(r.html).toContain('<a href="/services/probate">probate\nadministration</a>');
    // The page's own spacing survives inside the link.
    expect(r.applied[0].text).toBe("probate\nadministration");
  });

  it("tolerates multiple spaces and tabs between words", () => {
    const html = "<p>Our estate   planning\tservice covers wills.</p>";
    const r = applyLinks(html, [{ anchor: "estate planning service", targetUrl: "/x" }]);
    expect(r.applied).toHaveLength(1);
  });

  it("reports the REQUESTED anchor, so a caller can match an edit to its candidate", () => {
    // The page capitalises differently from the proposed anchor. Reporting the
    // page's casing here would break the caller's candidate lookup, and the
    // link would be written but never verified.
    const html = "<p>Our Emergency Roof Repair team is on call.</p>";
    const r = applyLinks(html, [{ anchor: "emergency roof repair", targetUrl: "/services/roof" }]);
    expect(r.applied[0].anchor).toBe("emergency roof repair");
    expect(r.applied[0].text).toBe("Emergency Roof Repair");
    expect(r.html).toContain(">Emergency Roof Repair</a>");
  });

  it("still refuses a phrase that only exists inside a heading", () => {
    const html = "<h2>Probate Administration</h2><p>Nothing relevant here.</p>";
    const r = applyLinks(html, [{ anchor: "Probate Administration", targetUrl: "/services/probate" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/no safe occurrence/);
  });

  it("skips past a protected occurrence to find a later safe one", () => {
    const html = "<h2>Estate Planning</h2><p>We do estate planning properly.</p>";
    const r = applyLinks(html, [{ anchor: "estate planning", targetUrl: "/services/ep" }]);
    expect(r.applied).toHaveLength(1);
    // The heading is untouched; the paragraph carries the link.
    expect(r.html).toContain("<h2>Estate Planning</h2>");
    expect(r.html).toContain('<p>We do <a href="/services/ep">estate planning</a> properly.</p>');
  });
});
