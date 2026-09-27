/**
 * Does the staging content pack actually produce work for the system to do?
 *
 * This runs the SHIPPED scoring engine over the exact content the pack imports,
 * at the SHIPPED 0.80 confidence floor and the shipped Autopilot limits. It is
 * the difference between handing someone content and telling them it will work,
 * and knowing it will.
 *
 * If this test ever fails, the pack is the thing to fix — never the threshold.
 */
import { describe, it, expect } from "vitest";
import { SEED_CONTENT, toWxr, FIRM, TOWN } from "../../../../scripts/staging-seed.mjs";
import { toLinkingPage } from "@/lib/workflow/linking-run";
import { generateLinkingPreview } from "@/lib/linking/engine";
import { DEFAULT_AUTOPILOT_RULES } from "@/lib/autopilot/rules";
import { applyLinks } from "@/lib/linking/apply";

const ORIGIN = "https://staging.example.com";

const pages = SEED_CONTENT.map((c) =>
  toLinkingPage({ url: `${ORIGIN}${c.path}`, title: c.title, html: c.html }),
);

function previewAtShippedDefaults() {
  return generateLinkingPreview({
    pages,
    sourceUrls: pages.filter((p) => p.type === "blog").map((p) => p.url),
    protectedPatterns: [],
    limits: {
      maxLinksPerPage: DEFAULT_AUTOPILOT_RULES.maxLinksPerPage,
      maxLinksToSameTarget: DEFAULT_AUTOPILOT_RULES.maxLinksToSameTarget,
      maxPagesPerBatch: DEFAULT_AUTOPILOT_RULES.maxPagesPerRun,
      minConfidence: DEFAULT_AUTOPILOT_RULES.minimumConfidence,
    },
  });
}

describe("the staging content pack", () => {
  it("is classified the way the engine expects: blog sources, service targets", () => {
    expect(pages.filter((p) => p.type === "blog")).toHaveLength(4);
    expect(pages.filter((p) => p.type === "service")).toHaveLength(3);
    expect(pages.every((p) => p.indexable && p.canonicalIsSelf)).toBe(true);
  });

  it("has enough prose per page to be scoreable at all", () => {
    for (const p of pages) {
      const words = p.text.split(/\s+/).filter(Boolean).length;
      expect(words, p.url).toBeGreaterThan(150);
    }
  });

  it("produces real opportunities at the SHIPPED 0.80 floor — no threshold relaxation", () => {
    expect(DEFAULT_AUTOPILOT_RULES.minimumConfidence).toBe(0.8);
    const preview = previewAtShippedDefaults();
    expect(preview.candidates.length).toBeGreaterThanOrEqual(3);
    expect(preview.candidates.every((c) => c.confidence >= 0.8)).toBe(true);
  });

  it("spreads the work across several posts, not all from one", () => {
    const preview = previewAtShippedDefaults();
    const sources = new Set(preview.candidates.map((c) => c.sourceUrl));
    expect(sources.size).toBeGreaterThanOrEqual(2);
  });

  it("links blog posts to service pages — the editorially valuable direction", () => {
    for (const c of previewAtShippedDefaults().candidates) {
      expect(c.sourceUrl, c.sourceUrl).toContain("/blog/");
      expect(c.targetUrl, c.targetUrl).toContain("/services/");
    }
  });

  it("every proposed anchor can actually be placed in the page body", () => {
    // A candidate whose anchor only exists in a heading can never be linked,
    // because the applier refuses to edit inside headings. This proves the
    // pack's phrasing survives that rule.
    const preview = previewAtShippedDefaults();
    const byPage = new Map<string, typeof preview.candidates>();
    for (const c of preview.candidates) {
      byPage.set(c.sourceUrl, [...(byPage.get(c.sourceUrl) ?? []), c]);
    }
    for (const [url, cands] of byPage) {
      const seed = SEED_CONTENT.find((s) => `${ORIGIN}${s.path}` === url)!;
      const result = applyLinks(
        seed.html,
        cands.map((c) => ({ anchor: c.anchor, targetUrl: c.targetUrl })),
      );
      expect(result.applied.length, `${url}: ${JSON.stringify(result.skipped)}`).toBe(cands.length);
    }
  });

  it("proposes natural anchors, not editorial placeholders", () => {
    for (const c of previewAtShippedDefaults().candidates) {
      expect(c.needsEditorialReview, `${c.anchor}`).toBe(false);
      expect(c.anchor.split(/\s+/).length).toBeLessThanOrEqual(6);
    }
  });

  it("carries the firm name and town through both clusters, which is what real sites do", () => {
    for (const c of SEED_CONTENT) {
      expect(c.html, c.slug).toContain(FIRM);
    }
    expect(SEED_CONTENT.filter((c) => c.html.includes(TOWN)).length).toBeGreaterThanOrEqual(5);
  });
});

describe("the WordPress import file", () => {
  const xml = toWxr({ siteUrl: ORIGIN });

  it("is well-formed WXR with one item per piece of content", () => {
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8" \?>/);
    expect(xml).toContain("<wp:wxr_version>1.2</wp:wxr_version>");
    expect((xml.match(/<item>/g) ?? [])).toHaveLength(SEED_CONTENT.length);
    expect((xml.match(/<item>/g) ?? []).length).toBe((xml.match(/<\/item>/g) ?? []).length);
  });

  it("publishes both post types so the REST API can see them immediately", () => {
    expect((xml.match(/<wp:post_type><!\[CDATA\[page\]\]><\/wp:post_type>/g) ?? [])).toHaveLength(3);
    expect((xml.match(/<wp:post_type><!\[CDATA\[post\]\]><\/wp:post_type>/g) ?? [])).toHaveLength(4);
    expect((xml.match(/<wp:status><!\[CDATA\[publish\]\]><\/wp:status>/g) ?? [])).toHaveLength(7);
  });

  it("keeps the slugs, so the URLs match what the pack documents", () => {
    for (const c of SEED_CONTENT) {
      expect(xml).toContain(`<wp:post_name><![CDATA[${c.slug}]]></wp:post_name>`);
    }
  });

  it("contains no credential or contact detail of any kind", () => {
    // Value-shaped, not word-shaped: WXR has a legitimate empty
    // <wp:post_password> element, and matching the bare word would flag it.
    expect(xml).not.toMatch(/(password|secret|token|api[_-]?key)\s*[:=]\s*\S/i);
    expect(xml).not.toMatch(/Bearer\s+\S|Basic [A-Za-z0-9+/=]{8}/);
    // The only email is an explicitly invalid placeholder.
    const emails = xml.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(emails.every((e) => e.endsWith(".invalid"))).toBe(true);
  });
});
