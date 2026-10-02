// Builds a realistic mock GenerationRecord for UI previews and offline tests.
import fs from "node:fs";
const script = (id, title, hook_type, pillar, emotion, spoken) => ({
  id, title, hook_type, content_pillar: pillar, emotion, length_sec: 30, on_camera: "owner",
  hook: { visual: "Half-done face in the salon mirror, one eye glam, one eye bare", on_screen_text: "Ek aankh Diwali ready, ek nahi", spoken },
  beats: [
    { start: 2, end: 8, visual: "Close-up: skin prep with branded primer", spoken: "Pehle prep. Bina iske base crack hota hai photo mein.", on_screen_text: "Step 1: prep" },
    { start: 8, end: 15, visual: "Soft glam eye blending", spoken: "Soft glam eyes, jo flash mein bhi natural lagein.", on_screen_text: "Step 2: eyes" },
    { start: 15, end: 24, visual: "Hair styling quick cuts", spoken: "Hair aur makeup, ek hi chair pe.", on_screen_text: "Hair included" },
    { start: 24, end: 30, visual: "Mirror reveal, client smiles", spoken: "Ye raha final look.", on_screen_text: "[INSERT REAL PRICE]" },
  ],
  payoff: "Full festive look revealed in the mirror",
  cta: { spoken: "Diwali slot ke liye DM karo 'GLOW'.", on_screen_text: "DM 'GLOW'" },
  shooting: { location: "Salon chair near the window", props: ["ring light", "branded kit", "mirror"], phone_setup: "Tripod at eye level, back camera, 1080p 30fps", broll: ["brush strokes", "product labels", "hair spray mist", "client smile"], editing_tip: "Cut on every brush stroke; no beauty filter" },
  audio: "Trending soft desi beat under voiceover. Pick a currently trending audio inside Instagram.",
  caption: "Ek aankh ready, ek nahi... farak dikh raha? Is Diwali aap kaunsa look try karogi?",
  hashtags: ["#makeup", "#diwali", "#partymakeup", "#festivemakeup", "#makeupartist", "#gurugrammakeup", "#sector56"],
  why_it_works: "Split-face first frame creates instant contrast and curiosity.",
  biggest_risk: "If the bare side looks too bad, it may feel like shaming.",
  reel_summary: "The owner finishes a half-done festive look live in the mirror. It's for working women in Sector 56 who want party-ready makeup without bridal prices. They're left feeling it's doable and affordable. We want them to DM for a Diwali slot.",
});
const bd = (h, r, n, rel, e, s, c) => ({ hook: h, retention: r, niche_fit: n, relatability: rel, emotion: e, share_save: s, cta: c });
const j = { hook: "Split face is a strong pattern interrupt.", retention: "Steps keep it moving.", niche_fit: "Process close-ups are a proven pillar.", relatability: "Mentions Sector 56.", emotion: "Clear excitement.", share_save: "Moderately saveable.", cta: "Single DM ask." };
const scripts = [
  script("s1", "Ek aankh ready, ek nahi", "Before/after", "process close-ups", "curiosity", "Ek aankh Diwali ready hai. Doosri dekho."),
  script("s2", "Filter wala makeup vs asli", "Myth-bust", "myth-busting", "confidence", "Sabko lagta hai party makeup matlab heavy. Nahi."),
  script("s3", "Price reveal", "Price shock", "price reveals", "surprise", "Ye pura look, hair ke saath? Price sunke chaunkogi."),
];
const scores = [
  { script_id: "s1", breakdown: bd(17, 15, 12, 11, 8, 7, 8), justifications: j, total: 78, violations: [], rewritten: false },
  { script_id: "s2", breakdown: bd(13, 13, 11, 10, 7, 6, 7), justifications: j, total: 67, violations: ["Generic: could be any salon"], rewritten: true },
  { script_id: "s3", breakdown: bd(10, 11, 9, 9, 6, 5, 6), justifications: j, total: 56, violations: ["Hook promise (price) not paid off with a real number"], rewritten: false },
];
const record = {
  id: "g_mock_salon", created_at: "2026-10-01T10:00:00.000Z", prompt_version: "2026-10-02.1", model: "claude-sonnet-5-5",
  inputs: JSON.parse(fs.readFileSync(new URL("../fixtures/salon.json", import.meta.url))),
  mode: "B2C", used_past_performance: false,
  output: {
    assumptions: ["Price not given, so [INSERT REAL PRICE] is used", "Owner is comfortable talking to camera"],
    audience_map: { pains: ["Photos look dull", "Bridal-level prices", "Makeup cracks by evening"], desires: ["Look good in photos", "Quick, affordable"], objections: ["Too expensive", "Will it look natural?"], relatable_refs: ["Sector 56 society Diwali party", "Office Diwali lunch", "Galleria market shopping"], key_emotion: "Excitement" },
    niche_strategy: { pillars: ["process close-ups", "myth-busting", "price reveals"], trust_triggers: ["branded products visible", "owner's 10+ years"], visuals: ["split face", "mirror reveal"], niche_hooks: ["Diwali party mein sabse pehle photo kiski?", "Heavy makeup = party makeup? Nahi.", "Ek chair, hair + makeup"], seasonal_moments: ["Diwali", "wedding party season"], common_mistakes: ["only final looks"], cautions: ["no 'permanent' claims"] },
    hook_analysis: [],
    scripts,
    testing_plan: { post_first: [{ script_id: "s1", reason: "Strongest hook" }, { script_id: "s2", reason: "Different pillar" }], ab_hooks: ["Ye side 10 minute pehle", "Guess karo kaunsi side meri hai", "Diwali se pehle vs baad"], metrics: "Watch 3s hold for the hook, avg watch % for body, DMs for the offer.", if_flops: "Change the first frame.", if_works: "Do a series with different clients.", posting_frequency: "3 reels a week", next_seasonal_moment: "Wedding season" },
  },
  critic: { scores, rewritten_scripts: [], ranking: ["s1", "s2", "s3"], weakest_note: "s3 teases a price but never shows one.", similarity_flags: [], honesty_note: "Scores estimate potential. They do not guarantee views." },
  checks: { initial: [{ script_id: "s2", check: "spoken_words", message: "80 spoken words for a 30s reel (max 75)." }], final: [{ script_id: "s3", check: "hashtag_count", message: "5 hashtags; needs 6-8." }] },
  usage: { input_tokens: 21400, output_tokens: 14800, calls: 2, cost_usd: 0.191 },
};
fs.writeFileSync(new URL("./record.json", import.meta.url), JSON.stringify(record, null, 2));
console.log("wrote tests/mocks/record.json");
