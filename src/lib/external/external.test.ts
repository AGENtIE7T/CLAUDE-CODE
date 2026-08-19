import { describe, it, expect } from "vitest";
import { findMentions, unlinkedMentions, scoreProspects } from "./prospects";
import { createDraft, evaluateSendGate, canTransition, isCompliantCopy, type OutreachDraft } from "./outreach";
import { auditOutbound, suggestCitations } from "./citations";

describe("prospects + mentions", () => {
  it("finds brand mentions and flags whether they already link", () => {
    const linked = findMentions("Acme", "acme.com", "https://blog.example/post",
      "We love Acme and use it daily.", ["https://www.acme.com"]);
    expect(linked[0].alreadyLinks).toBe(true);

    const unlinked = findMentions("Acme", "acme.com", "https://blog.example/post",
      "Acme is great. Acme rocks.", ["https://other.com"]);
    expect(unlinked).toHaveLength(2);
    expect(unlinkedMentions(unlinked)).toHaveLength(2);
  });

  it("scores and ranks prospects, dropping domains that already link", () => {
    const ranked = scoreProspects([
      { domain: "a.com", relevance: 0.9, authority: 0.8, alreadyLinks: false, unlinkedMention: true },
      { domain: "b.com", relevance: 0.5, authority: 0.4, alreadyLinks: false, unlinkedMention: false },
      { domain: "c.com", relevance: 1, authority: 1, alreadyLinks: true, unlinkedMention: false },
    ], 0.4);
    expect(ranked.map((p) => p.domain)).not.toContain("c.com"); // already links
    expect(ranked[0].domain).toBe("a.com"); // highest + warm
    expect(ranked.every((p) => p.requiresManualReview)).toBe(true);
  });
});

describe("outreach drafts + send gate", () => {
  it("creates a personalized, compliant draft in the draft stage", () => {
    const d = createDraft({
      prospectDomain: "blog.example", senderName: "Sam", brand: "Acme",
      reason: "an unlinked mention of Acme", context: "your post on estate planning",
    });
    expect(d.stage).toBe("draft");
    expect(isCompliantCopy(d.body)).toBe(true);
  });

  it("rejects prohibited ranking-guarantee copy", () => {
    expect(isCompliantCopy("We guarantee rank #1 on Google")).toBe(false);
    expect(isCompliantCopy("Thought you'd find this useful")).toBe(true);
  });

  it("enforces stage transitions (no draft → sent jump)", () => {
    expect(canTransition("draft", "sent")).toBe(false);
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("approved", "sent")).toBe(true);
  });

  it("send gate blocks without explicit approval, recipients, or rate budget", () => {
    const draft: OutreachDraft = {
      id: "d1", prospectDomain: "blog.example", recipient: "ed@blog.example",
      subject: "hi", body: "useful resource", stage: "approved", personalization: {},
      createdAt: new Date().toISOString(),
    };
    // No human approval.
    expect(evaluateSendGate({ drafts: [draft], approvedRecipients: ["ed@blog.example"], ratePerHour: 10, sentThisHour: 0, humanApproved: false }).ok).toBe(false);
    // Empty recipient list.
    expect(evaluateSendGate({ drafts: [draft], approvedRecipients: [], ratePerHour: 10, sentThisHour: 0, humanApproved: true }).ok).toBe(false);
    // Rate cap reached.
    expect(evaluateSendGate({ drafts: [draft], approvedRecipients: ["ed@blog.example"], ratePerHour: 5, sentThisHour: 5, humanApproved: true }).ok).toBe(false);
    // All conditions met.
    const ok = evaluateSendGate({ drafts: [draft], approvedRecipients: ["ed@blog.example"], ratePerHour: 5, sentThisHour: 0, humanApproved: true });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.toSend).toHaveLength(1);
  });
});

describe("outbound-link audit + citations", () => {
  it("classifies broken/redirect and recommends rel for affiliate links", () => {
    const f = auditOutbound([
      { href: "https://ok.com", rel: null, status: 200 },
      { href: "https://dead.com", rel: null, status: 404 },
      { href: "https://go.com?ref=abc", rel: null, status: 200 },
    ]);
    expect(f[0].health).toBe("ok");
    expect(f[1].health).toBe("broken");
    expect(f[2].flags).toContain("affiliate");
    expect(f[2].suggestedRel).toBe("sponsored nofollow");
  });

  it("suggests citations, excluding competitors by default", () => {
    const s = suggestCitations([
      { url: "https://gov.example/study", title: "Study", authority: 0.9, relevance: 0.9, isCompetitor: false },
      { url: "https://rival.com", title: "Rival", authority: 1, relevance: 1, isCompetitor: true },
    ], { minScore: 0.5 });
    expect(s.map((c) => c.url)).toContain("https://gov.example/study");
    expect(s.map((c) => c.url)).not.toContain("https://rival.com");
    expect(s[0].requiresApproval).toBe(true);
  });
});
