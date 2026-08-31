import { describe, it, expect } from "vitest";
import { containment, cosineSimilarity, entityOverlap, jaccard, tokenize } from "./similarity";
import { selectAnchor, isAcceptableAnchor } from "./anchor";
import { scoreComponents, finalScore, WEIGHTS, type LinkingPage } from "./score";
import { generateLinkingPreview } from "./engine";

describe("similarity", () => {
  it("scores related text higher than unrelated", () => {
    const base = "estate planning wills and trusts for families";
    const related = "how to set up a trust and write a will for your family estate";
    const unrelated = "best pizza recipes with fresh basil and mozzarella";
    expect(cosineSimilarity(base, related)).toBeGreaterThan(cosineSimilarity(base, unrelated));
  });
  it("tokenize drops stopwords and short words", () => {
    expect(tokenize("The a of trust")).toEqual(["trust"]);
  });
  it("entity overlap detects shared capitalized entities", () => {
    expect(entityOverlap("We serve Acme Corp clients", "Acme Corp is our partner")).toBeGreaterThan(0);
  });
});

describe("anchor selection", () => {
  it("prefers a natural in-text phrase describing the target", () => {
    const src = "Our estate planning services help families avoid probate. Contact us today.";
    const a = selectAnchor(src, "Estate Planning Services");
    expect(a).not.toBeNull();
    expect(a!.needsEditorialReview).toBe(false);
    expect(a!.anchor.toLowerCase()).toContain("estate planning");
  });
  it("flags for review when no natural anchor exists", () => {
    const a = selectAnchor("We love pizza and sunshine.", "Corporate Tax Filing");
    expect(a!.needsEditorialReview).toBe(true);
  });
  it("rejects banned generic anchors", () => {
    expect(isAcceptableAnchor("click here")).toBe(false);
    expect(isAcceptableAnchor("estate planning services")).toBe(true);
  });
});

describe("scoring", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Number(sum.toFixed(5))).toBe(1);
  });
  it("blog→service commercial link scores well; unrelated scores low", () => {
    const blog = page("https://s.com/blog/probate", "Avoiding Probate", "estate planning wills trusts probate families avoid", "blog");
    const service = page("https://s.com/services/estate", "Estate Planning Services", "estate planning wills trusts probate legal help", "service", 1);
    const pizza = page("https://s.com/blog/pizza", "Pizza", "mozzarella basil dough oven", "blog");
    const good = finalScore(scoreComponents(blog, service));
    const bad = finalScore(scoreComponents(blog, pizza));
    expect(good).toBeGreaterThan(bad);
  });
});

// ── engine corpus ────────────────────────────────────────────────────────
function page(
  url: string, title: string, text: string, type: LinkingPage["type"],
  businessPriority = 0.3,
): LinkingPage {
  return {
    url, title, text, type,
    indexable: true, canonicalIsSelf: true, status: 200,
    existingTargets: new Set(), businessPriority,
  };
}

describe("linking engine", () => {
  const pages: LinkingPage[] = [
    page("https://s.com/blog/probate", "Avoiding Probate",
      "Our estate planning services help families avoid probate with wills and trusts. Estate planning services matter.", "blog"),
    page("https://s.com/services/estate", "Estate Planning Services",
      "estate planning services wills trusts probate legal help families", "service", 1),
    page("https://s.com/services/tax", "Tax Services",
      "tax filing corporate returns accounting", "service", 0.8),
    page("https://s.com/checkout", "Checkout", "cart payment checkout", "other"),
  ];

  it("suggests a validated, explainable blog→service link", () => {
    const preview = generateLinkingPreview({
      pages,
      sourceUrls: ["https://s.com/blog/probate"],
      protectedPatterns: ["/checkout*"],
      limits: { minConfidence: 0.4 },
    });
    expect(preview.candidates.length).toBeGreaterThan(0);
    const top = preview.candidates[0];
    expect(top.targetUrl).toBe("https://s.com/services/estate");
    expect(top.reason).toMatch(/Top factors/);
    expect(top.components.semantic_similarity).toBeGreaterThan(0);
  });

  it("never proposes a self-link, protected URL, or duplicate", () => {
    const withExisting = pages.map((p) =>
      p.url.includes("/blog/probate")
        ? { ...p, existingTargets: new Set(["https://s.com/services/estate"]) }
        : p,
    );
    const preview = generateLinkingPreview({
      pages: withExisting,
      sourceUrls: ["https://s.com/blog/probate"],
      protectedPatterns: ["/checkout*"],
      limits: { minConfidence: 0.3 },
    });
    // The existing estate link must not be re-proposed; checkout is protected.
    expect(preview.candidates.every((c) => c.targetUrl !== "https://s.com/services/estate")).toBe(true);
    expect(preview.candidates.every((c) => !c.targetUrl.includes("/checkout"))).toBe(true);
    expect(preview.rejected.some((r) => r.reason.includes("protected"))).toBe(true);
  });

  it("enforces max links per page", () => {
    const preview = generateLinkingPreview({
      pages,
      sourceUrls: ["https://s.com/blog/probate"],
      limits: { minConfidence: 0, maxLinksPerPage: 1 },
    });
    expect(preview.candidates.length).toBeLessThanOrEqual(1);
  });

  it("filters out below-confidence candidates", () => {
    const preview = generateLinkingPreview({
      pages,
      sourceUrls: ["https://s.com/blog/probate"],
      limits: { minConfidence: 0.99 },
    });
    expect(preview.candidates).toHaveLength(0);
  });
});

describe("topic and entity matching are asymmetric on purpose", () => {
  it("does not punish a long article for being long", () => {
    const longArticle = `${"roofing storm damage tiles leak ".repeat(60)}emergency roof repair`;
    // Every word of the destination's title appears in the article.
    expect(containment(tokenize("Emergency Roof Repair"), tokenize(longArticle))).toBe(1);
    // Jaccard, by contrast, is near zero purely because of the size difference.
    expect(jaccard(tokenize("Emergency Roof Repair"), tokenize(longArticle))).toBeLessThan(0.5);
  });

  it("still returns 0 when the article does not cover the destination at all", () => {
    expect(containment(tokenize("Emergency Roof Repair"), tokenize("cake recipes and baking"))).toBe(0);
  });

  it("scores a partially covered topic partially", () => {
    expect(
      containment(tokenize("Emergency Roof Repair"), tokenize("a guide to roof maintenance")),
    ).toBeCloseTo(1 / 3, 5);
  });
});
