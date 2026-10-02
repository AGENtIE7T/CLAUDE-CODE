/**
 * Deterministic checks (Section 8.2). Pure functions, no model calls.
 */
import type { BusinessInput, CheckFailure, CriticScore, Script } from "./schema";

export interface CheckContext {
  mode: "B2B" | "B2C";
  language: BusinessInput["language"];
  city?: string;
  area?: string;
}

// Hook library example lines, with [placeholders] treated as wildcards.
export const HOOK_LIBRARY_EXAMPLES = [
  "[Area] mein koi ye nahi batata...",
  "[Common practice] band karo agar...",
  "Agar tumhara [specific problem], ye dekho",
  "POV: tum [relatable situation]",
  "[Area/industry] wale dhyan do",
  "[N] cheezein jo [group] galat karta hai",
  "Maine [cost] barbaad kiye, tum mat karna",
  "Sabko lagta hai [belief]. Galat.",
  "[Price] mein ye? Haan, sach mein",
  "[N] saal se [business], ek secret batata hoon",
  "Kya [cheap thing] [expensive thing] ko hara sakta hai?",
  "Tumhe pata hai [surprising question]?",
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s[\]]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const countWords = (s: string | undefined) => (s ?? "").trim().split(/\s+/).filter(Boolean).length;

export function spokenWords(s: Script): number {
  return countWords(s.hook.spoken) + s.beats.reduce((n, b) => n + countWords(b.spoken), 0) + countWords(s.cta.spoken);
}

/** Literal words of a template (placeholders removed). */
function literalWords(template: string): string[] {
  return norm(template.replace(/\[[^\]]*\]/g, " ")).split(" ").filter(Boolean);
}

/**
 * True when `line` is the example template "filled in": all literal parts in
 * order with only placeholder gaps between. Templates with < 4 literal words
 * (e.g. "POV: tum …") are only matched when copied exactly, otherwise every
 * POV hook would fail.
 */
export function reusesTemplate(line: string, template: string): boolean {
  const l = norm(line);
  if (!l) return false;
  const lits = literalWords(template);
  const exact = norm(template.replace(/\[[^\]]*\]/g, " "));
  if (lits.length < 4) return l === exact;
  const parts = norm(template)
    .split(/\[[^\]]*\]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/[.*+?^${}()|\\]/g, "\\$&"));
  const re = new RegExp(parts.join("(?:\\s+[^\\s]+){0,8}?\\s*"), "u");
  return re.test(l);
}

const CTA_CATEGORIES: Record<string, RegExp> = {
  follow: /\bfollow\b/i,
  comment: /\bcomment\b/i,
  save: /\bsave\b/i,
  share: /\b(share|bhejo|tag)\b/i,
  contact: /\b(dm|whatsapp|call|message|msg|enquir\w*|inquir\w*|quote|contact|phone|number)\b/i,
  // "book"/"order" are usually the purpose ("DM karo booking ke liye"), not a second action.
  visit: /\b(visit|aao|aaiye|link in bio|walk[- ]?in)\b/i,
};

export function ctaCategories(text: string): string[] {
  return Object.entries(CTA_CATEGORIES)
    .filter(([, re]) => re.test(text))
    .map(([k]) => k);
}

export function countSentences(text: string): number {
  return text
    .split(/[.!?।]+(?=\s|$)/)
    .map((x) => x.trim())
    .filter((x) => /\p{L}/u.test(x)).length;
}

const CONSUMER_TAG_WORDS =
  /(food|foodie|foodies|eats|eat|blogger|blog|lifestyle|fashion|style|makeup|beauty|vibes|diaries|insta|yummy|delicious|tasty|streetfood|cafe|weekend|love)/i;

export function isConsumerHashtag(tag: string, ctx: CheckContext): boolean {
  const t = tag.replace(/^#/, "").toLowerCase();
  const places = [ctx.city, ctx.area]
    .filter(Boolean)
    .flatMap((p) => p!.toLowerCase().split(/[\s,/]+/))
    .filter((p) => p.length >= 3);
  const hyperlocal = places.some((p) => t.includes(p)) || /(delhi|ncr|mumbai|gurgaon|gurugram|noida|bangalore|bengaluru|pune)/.test(t);
  if (hyperlocal && CONSUMER_TAG_WORDS.test(t)) return true;
  return /^(foodie|foodporn|instafood|foodblogger|foodlover|yummy|lifestyle|ootd|instagood|foodstagram)$/.test(t);
}

const DEVANAGARI = /[ऀ-ॿ]/;

export function checkScript(s: Script, ctx: CheckContext): CheckFailure[] {
  const out: CheckFailure[] = [];
  const fail = (check: string, message: string) => out.push({ script_id: s.id, check, message });

  // Beats continuous; last beat ends at or before length_sec.
  const beats = s.beats;
  if (beats.length) {
    if (beats[0].start > 3 || beats[0].start < 0) fail("beats_continuous", `First beat starts at ${beats[0].start}s; it should start right after the hook (~2s).`);
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (b.end <= b.start) fail("beats_continuous", `Beat ${i + 1} ends (${b.end}s) before it starts (${b.start}s).`);
      if (i > 0 && Math.abs(b.start - beats[i - 1].end) > 0.01)
        fail("beats_continuous", `Gap/overlap: beat ${i} ends at ${beats[i - 1].end}s but beat ${i + 1} starts at ${b.start}s.`);
    }
    const last = beats[beats.length - 1].end;
    if (last > s.length_sec) fail("beats_within_length", `Last beat ends at ${last}s but the reel is ${s.length_sec}s.`);
  }

  // Spoken words.
  const words = spokenWords(s);
  const maxWords = Math.floor(s.length_sec * 2.5);
  if (words > maxWords) fail("spoken_words", `${words} spoken words for a ${s.length_sec}s reel (max ${maxWords}).`);

  // Hook on-screen text.
  const hookWords = countWords(s.hook.on_screen_text);
  if (hookWords > 7) fail("hook_text_length", `Hook on-screen text is ${hookWords} words (max 7).`);

  // Hook library reuse.
  for (const line of [s.hook.spoken, s.hook.on_screen_text]) {
    const t = HOOK_LIBRARY_EXAMPLES.find((tpl) => reusesTemplate(line, tpl));
    if (t) {
      fail("hook_library_reuse", `Hook reuses the library example "${t}" almost word for word.`);
      break;
    }
  }

  // Exactly one CTA.
  const ctaText = `${s.cta.spoken} ${s.cta.on_screen_text}`.trim();
  if (!ctaText) fail("one_cta", "No CTA.");
  else {
    const cats = ctaCategories(ctaText);
    if (cats.length > 1) fail("one_cta", `CTA asks for ${cats.length} different actions (${cats.join(", ")}). Keep one.`);
  }

  // Reel summary 2-4 sentences.
  const sentences = countSentences(s.reel_summary);
  if (sentences < 2 || sentences > 4) fail("reel_summary_length", `Reel summary has ${sentences} sentence(s); needs 2-4.`);

  // 6-8 hashtags.
  if (s.hashtags.length < 6 || s.hashtags.length > 8) fail("hashtag_count", `${s.hashtags.length} hashtags; needs 6-8.`);

  // B2B mode rules.
  if (ctx.mode === "B2B") {
    const bad = s.hashtags.filter((h) => isConsumerHashtag(h, ctx));
    if (bad.length) fail("b2b_hashtags", `Consumer/lifestyle hashtags in a B2B reel: ${bad.join(" ")}.`);
    if (!CTA_CATEGORIES.contact.test(ctaText)) fail("b2b_cta", "B2B CTA should ask for a quote, a call or a WhatsApp message, not just a follow.");
  }

  // Roman script only.
  if ((ctx.language === "hinglish" || ctx.language === "hindi_roman") && DEVANAGARI.test(JSON.stringify(s))) {
    fail("no_devanagari", "Devanagari characters found; Roman script was required.");
  }

  return out;
}

export function normalisePillar(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function checkBatch(scripts: Script[], ctx: CheckContext): CheckFailure[] {
  const out = scripts.flatMap((s) => checkScript(s, ctx));
  const dupes = (field: "hook_type" | "content_pillar", label: string) => {
    const seen = new Map<string, string>();
    for (const s of scripts) {
      const k = normalisePillar(s[field]);
      const prev = seen.get(k);
      if (prev) out.push({ script_id: s.id, check: `unique_${field}`, message: `Same ${label} as ${prev} ("${s[field]}").` });
      else seen.set(k, s.id);
    }
  };
  dupes("hook_type", "hook type");
  dupes("content_pillar", "content pillar");
  return out;
}

export function scoreInflationWarning(scores: Pick<CriticScore, "total">[]): CheckFailure | null {
  if (scores.length > 0 && scores.every((s) => s.total >= 85)) {
    return { script_id: null, check: "score_inflation", message: "Every script scored 85+: possible score inflation. Treat scores with suspicion." };
  }
  return null;
}
