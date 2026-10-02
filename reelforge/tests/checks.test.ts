import { describe, expect, it } from "vitest";
import { mergeCritic } from "../lib/pipeline";
import type { CriticOutput, Script } from "../lib/schema";
import {
  checkBatch,
  checkScript,
  countSentences,
  ctaCategories,
  isConsumerHashtag,
  reusesTemplate,
  scoreInflationWarning,
  spokenWords,
  type CheckContext,
} from "../lib/validate";

const B2C: CheckContext = { mode: "B2C", language: "hinglish", city: "Gurugram", area: "Sector 56" };
const B2B: CheckContext = { mode: "B2B", language: "hinglish", city: "Gurugram", area: "Sector 37" };

function makeScript(over: Partial<Script> = {}): Script {
  return {
    id: "s1",
    title: "Diwali look in 40 min",
    hook_type: "Pain call-out",
    content_pillar: "process close-ups",
    emotion: "relief",
    length_sec: 30,
    on_camera: "owner",
    hook: { visual: "Half-done face in mirror", on_screen_text: "Diwali party aur makeup fail?", spoken: "Party mein photo kharab aati hai?" },
    beats: [
      { start: 2, end: 8, visual: "Base close-up", spoken: "Pehle skin prep, bina iske base crack hota hai.", on_screen_text: "Step 1: prep" },
      { start: 8, end: 16, visual: "Eye look", spoken: "Phir soft glam eyes, photo mein pop karti hain.", on_screen_text: "Step 2" },
      { start: 16, end: 25, visual: "Mirror reveal", spoken: "Aur ye final look.", on_screen_text: "40 min" },
      { start: 25, end: 30, visual: "Owner to camera", spoken: "", on_screen_text: "" },
    ],
    payoff: "Final look reveal",
    cta: { spoken: "Slot book karne ke liye DM karo.", on_screen_text: "DM 'DIWALI'" },
    shooting: { location: "Salon chair", props: ["ring light"], phone_setup: "Tripod at eye level", broll: ["brushes", "palette", "mirror"], editing_tip: "Cut on every brush stroke" },
    audio: "Trending soft beat; pick a trending audio in the app.",
    caption: "Is Diwali kaunsa look try karogi?",
    hashtags: ["#makeup", "#diwali", "#partymakeup", "#festivemakeup", "#makeupartist", "#gurugrammakeup"],
    why_it_works: "Shows process",
    biggest_risk: "Slow start",
    reel_summary: "Owner turns a half-done face into a festive look. It's for working women in Sector 56. They feel it's doable. We want a DM.",
    ...over,
  };
}

const ids = (fs: { check: string }[]) => fs.map((f) => f.check);

describe("checkScript", () => {
  it("passes a clean script", () => {
    expect(checkScript(makeScript(), B2C)).toEqual([]);
  });

  it("flags gaps and overlaps between beats", () => {
    const s = makeScript();
    s.beats[1] = { ...s.beats[1], start: 9 };
    expect(ids(checkScript(s, B2C))).toContain("beats_continuous");
  });

  it("flags a last beat that runs past the length", () => {
    const s = makeScript();
    s.beats[3] = { ...s.beats[3], end: 33 };
    expect(ids(checkScript(s, B2C))).toContain("beats_within_length");
  });

  it("flags too many spoken words", () => {
    const long = Array(80).fill("word").join(" ");
    const s = makeScript({ hook: { visual: "x", on_screen_text: "short", spoken: long } });
    expect(spokenWords(s)).toBeGreaterThan(75);
    expect(ids(checkScript(s, B2C))).toContain("spoken_words");
  });

  it("flags hook on-screen text over 7 words", () => {
    const s = makeScript({ hook: { visual: "x", on_screen_text: "one two three four five six seven eight", spoken: "hi" } });
    expect(ids(checkScript(s, B2C))).toContain("hook_text_length");
  });

  it("flags hook library example reuse", () => {
    const s = makeScript({ hook: { visual: "x", on_screen_text: "Sector 56", spoken: "Gurugram mein koi ye nahi batata..." } });
    expect(ids(checkScript(s, B2C))).toContain("hook_library_reuse");
  });

  it("flags multiple CTAs", () => {
    const s = makeScript({ cta: { spoken: "Follow karo aur comment karo", on_screen_text: "" } });
    expect(ids(checkScript(s, B2C))).toContain("one_cta");
  });

  it("flags a missing CTA", () => {
    const s = makeScript({ cta: { spoken: "", on_screen_text: "" } });
    expect(ids(checkScript(s, B2C))).toContain("one_cta");
  });

  it("enforces 2-4 sentence reel summary", () => {
    expect(ids(checkScript(makeScript({ reel_summary: "Just one sentence." }), B2C))).toContain("reel_summary_length");
    expect(ids(checkScript(makeScript({ reel_summary: "A. B. C. D. E." }), B2C))).toContain("reel_summary_length");
  });

  it("enforces 6-8 hashtags", () => {
    expect(ids(checkScript(makeScript({ hashtags: ["#a", "#b"] }), B2C))).toContain("hashtag_count");
    expect(ids(checkScript(makeScript({ hashtags: Array.from({ length: 9 }, (_, i) => `#t${i}`) }), B2C))).toContain("hashtag_count");
  });

  it("flags Devanagari in Hinglish mode only", () => {
    const s = makeScript({ caption: "क्या आप तैयार हैं?" });
    expect(ids(checkScript(s, B2C))).toContain("no_devanagari");
    expect(ids(checkScript(s, { ...B2C, language: "english" }))).not.toContain("no_devanagari");
  });

  describe("B2B mode", () => {
    const tradeTags = ["#commercialkitchen", "#restaurantbusiness", "#kitchenequipment", "#cateringbusiness", "#horeca", "#ssfabrication"];
    it("passes with trade tags and a WhatsApp CTA", () => {
      const s = makeScript({ hashtags: tradeTags, cta: { spoken: "Quote ke liye WhatsApp karo", on_screen_text: "" } });
      expect(checkScript(s, B2B)).toEqual([]);
    });
    it("flags consumer hyperlocal hashtags", () => {
      const s = makeScript({ hashtags: [...tradeTags.slice(0, 5), "#GurugramFood"], cta: { spoken: "Call karo", on_screen_text: "" } });
      expect(ids(checkScript(s, B2B))).toContain("b2b_hashtags");
    });
    it("flags a follow-only CTA", () => {
      const s = makeScript({ hashtags: tradeTags, cta: { spoken: "Follow karo", on_screen_text: "" } });
      expect(ids(checkScript(s, B2B))).toContain("b2b_cta");
    });
  });
});

describe("checkBatch", () => {
  it("flags duplicate hook types and pillars", () => {
    const a = makeScript({ id: "s1" });
    const b = makeScript({ id: "s2", hook_type: "pain call out", content_pillar: "Process close-ups" });
    const f = checkBatch([a, b], B2C);
    expect(ids(f)).toContain("unique_hook_type");
    expect(ids(f)).toContain("unique_content_pillar");
    expect(f.find((x) => x.check === "unique_hook_type")?.script_id).toBe("s2");
  });
  it("passes distinct scripts", () => {
    const a = makeScript({ id: "s1" });
    const b = makeScript({ id: "s2", hook_type: "Myth-bust", content_pillar: "price reveals" });
    expect(checkBatch([a, b], B2C)).toEqual([]);
  });
});

describe("helpers", () => {
  it("reusesTemplate matches filled-in templates but not fresh lines", () => {
    expect(reusesTemplate("5 cheezein jo college students galat karta hai", "[N] cheezein jo [group] galat karta hai")).toBe(true);
    expect(reusesTemplate("Gym mein pehle din sab yahi galti karte hain", "[N] cheezein jo [group] galat karta hai")).toBe(false);
    // Short templates only match exact copies.
    expect(reusesTemplate("POV: tum pehli baar gym aaye ho", "POV: tum [relatable situation]")).toBe(false);
  });
  it("ctaCategories groups contact actions", () => {
    expect(ctaCategories("Call ya WhatsApp karo")).toEqual(["contact"]);
    expect(ctaCategories("Follow karo, save karo")).toEqual(["follow", "save"]);
  });
  it("countSentences", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("Price ₹2.5k hai. Aao.")).toBe(2);
  });
  it("isConsumerHashtag", () => {
    expect(isConsumerHashtag("#GurugramFood", B2B)).toBe(true);
    expect(isConsumerHashtag("#delhifoodie", B2B)).toBe(true);
    expect(isConsumerHashtag("#commercialkitchen", B2B)).toBe(false);
  });
  it("scoreInflationWarning", () => {
    expect(scoreInflationWarning([{ total: 86 }, { total: 90 }])?.check).toBe("score_inflation");
    expect(scoreInflationWarning([{ total: 86 }, { total: 70 }])).toBeNull();
  });
});

describe("mergeCritic", () => {
  const breakdown = (t: number) => ({ hook: t, retention: t, niche_fit: 10, relatability: 10, emotion: 5, share_save: 5, cta: 5 });
  const just = { hook: "", retention: "", niche_fit: "", relatability: "", emotion: "", share_save: "", cta: "" };
  it("replaces rewritten scripts, recomputes totals and sorts by score", () => {
    const s1 = makeScript({ id: "s1", title: "old s1" });
    const s2 = makeScript({ id: "s2", title: "s2" });
    const critic: CriticOutput = {
      scores: [
        { script_id: "s1", breakdown: breakdown(18), justifications: just, total: 999, violations: [], rewritten: true },
        { script_id: "s2", breakdown: breakdown(10), justifications: just, total: 0, violations: ["generic"], rewritten: false },
      ],
      rewritten_scripts: [makeScript({ id: "s1", title: "new s1", hashtags: ["a", "#b"] })],
      ranking: ["s2", "s1"],
      weakest_note: "",
      similarity_flags: [],
      honesty_note: "",
    };
    const m = mergeCritic([s2, s1], critic);
    expect(m.scripts.map((s) => s.title)).toEqual(["new s1", "s2"]);
    expect(m.scripts[0].hashtags).toEqual(["#a", "#b"]);
    expect(m.critic.scores.find((s) => s.script_id === "s1")?.total).toBe(18 + 18 + 10 + 10 + 5 + 5 + 5);
    expect(m.critic.ranking).toEqual(["s1", "s2"]);
  });
});
