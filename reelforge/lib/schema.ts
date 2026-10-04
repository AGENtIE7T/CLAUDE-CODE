import { z } from "zod";
import nichesData from "./niches.json";

/** Bump whenever generator.md / critic.md change in a way that could move scores. */
export const PROMPT_VERSION = "2026-10-04.1";

export const NICHE_IDS = nichesData.niches.map((n) => n.id) as [string, ...string[]];
export const LANGUAGES = ["hinglish", "hindi_roman", "english"] as const;
export const LANGUAGE_LABELS: Record<(typeof LANGUAGES)[number], string> = {
  hinglish: "Hinglish (Roman script)",
  hindi_roman: "Hindi (Roman script)",
  english: "English",
};
export const TONES = ["funny", "emotional", "premium", "raw/desi", "educational"] as const;
export const ON_CAMERA = ["owner", "staff", "faceless", "customer"] as const;

const str = (max: number) => z.string().trim().max(max);
const req = (max: number) => z.string().trim().min(1, "Required").max(max);

// ---------- Inputs ----------

export const BusinessInputSchema = z
  .object({
    business_name: req(80),
    niche: z.enum([...NICHE_IDS, "other"]),
    custom_niche: str(80).default(""),
    sub_niche: req(160),
    city: req(60),
    area: req(80),
    target_customer: req(300),
    offer: req(300),
    usp: req(300),
    on_camera: z.enum(ON_CAMERA),
    language: z.enum(LANGUAGES).default("hinglish"),
    tones: z.array(z.enum(TONES)).max(5).default([]),
    festival: str(120).default(""),
    avoid: str(300).default(""),
    reference_hooks: z.array(str(200)).max(10).default([]),
    script_count: z.number().int().min(1).max(5).default(3),
    b2b: z.boolean().default(false),
  })
  .refine((v) => v.niche !== "other" || v.custom_niche.length > 0, {
    message: "Custom niche is required when niche is Other",
    path: ["custom_niche"],
  });
export type BusinessInput = z.infer<typeof BusinessInputSchema>;

const ModelOverride = z
  .string()
  .trim()
  .max(64)
  .regex(/^claude-[a-z0-9.-]+$/i, "Model must look like claude-…")
  .optional();

export const GenerateRequestSchema = z.object({
  inputs: BusinessInputSchema,
  past_performance: str(4000).optional(),
  model: ModelOverride,
});

// ---------- Generator output (Section 5.1) ----------

const num = z.coerce.number();
const strArr = z.array(z.string());

export const ScriptSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  hook_type: z.string(),
  content_pillar: z.string(),
  emotion: z.string(),
  length_sec: num.int().min(5).max(180),
  on_camera: z.string(),
  hook: z.object({ visual: z.string(), on_screen_text: z.string(), spoken: z.string() }),
  beats: z
    .array(
      z.object({
        start: num,
        end: num,
        visual: z.string(),
        spoken: z.string().default(""),
        on_screen_text: z.string().default(""),
      }),
    )
    .min(1),
  payoff: z.string(),
  cta: z.object({ spoken: z.string().default(""), on_screen_text: z.string().default("") }),
  shooting: z.object({
    location: z.string(),
    props: strArr,
    phone_setup: z.string(),
    broll: strArr,
    editing_tip: z.string(),
  }),
  audio: z.string(),
  caption: z.string(),
  hashtags: strArr,
  why_it_works: z.string(),
  biggest_risk: z.string(),
  reel_summary: z.string(),
});
export type Script = z.infer<typeof ScriptSchema>;

export const HookAnalysisItemSchema = z.object({
  original: z.string(),
  type: z.string(),
  first_frame: z.string(),
  first_words: z.string(),
  pattern_interrupt: z.string(),
  curiosity_gap: z.string(),
  specificity: z.string(),
  emotion: z.string(),
  niche_fit: z.string(),
  payoff: z.string(),
  score_10: num.min(0).max(10),
  reason: z.string(),
  rewrite: z.string(),
});
export type HookAnalysisItem = z.infer<typeof HookAnalysisItemSchema>;

export const GeneratorOutputSchema = z.object({
  assumptions: strArr,
  audience_map: z.object({
    pains: strArr,
    desires: strArr,
    objections: strArr,
    relatable_refs: strArr,
    key_emotion: z.string(),
  }),
  niche_strategy: z.object({
    pillars: strArr,
    trust_triggers: strArr,
    visuals: strArr,
    niche_hooks: strArr,
    seasonal_moments: strArr,
    common_mistakes: strArr,
    cautions: strArr,
  }),
  hook_analysis: z.array(HookAnalysisItemSchema).default([]),
  scripts: z.array(ScriptSchema).min(1),
  testing_plan: z.object({
    post_first: z.array(z.object({ script_id: z.string(), reason: z.string() })),
    ab_hooks: strArr,
    metrics: z.string(),
    if_flops: z.string(),
    if_works: z.string(),
    posting_frequency: z.string(),
    next_seasonal_moment: z.string(),
  }),
});
export type GeneratorOutput = z.infer<typeof GeneratorOutputSchema>;

/** Used by "regenerate only the weakest script". */
export const ReplacementOutputSchema = z.object({ scripts: z.array(ScriptSchema).length(1) });

// ---------- Critic output (Section 5.2) ----------

export const CRITERIA = [
  { key: "hook", label: "Hook", max: 20 },
  { key: "retention", label: "Retention", max: 20 },
  { key: "niche_fit", label: "Niche fit", max: 15 },
  { key: "relatability", label: "Relatability", max: 15 },
  { key: "emotion", label: "Emotion", max: 10 },
  { key: "share_save", label: "Share / save", max: 10 },
  { key: "cta", label: "CTA", max: 10 },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]["key"];

const bounded = (max: number) => num.transform((v) => Math.max(0, Math.min(max, Math.round(v))));

export const CriticScoreSchema = z.object({
  script_id: z.string(),
  breakdown: z.object({
    hook: bounded(20),
    retention: bounded(20),
    niche_fit: bounded(15),
    relatability: bounded(15),
    emotion: bounded(10),
    share_save: bounded(10),
    cta: bounded(10),
  }),
  justifications: z.object({
    hook: z.string(),
    retention: z.string(),
    niche_fit: z.string(),
    relatability: z.string(),
    emotion: z.string(),
    share_save: z.string(),
    cta: z.string(),
  }),
  total: num,
  violations: strArr.default([]),
  rewritten: z.boolean().default(false),
});
export type CriticScore = z.infer<typeof CriticScoreSchema>;

export const CriticOutputSchema = z.object({
  scores: z.array(CriticScoreSchema).min(1),
  rewritten_scripts: z.array(ScriptSchema).default([]),
  ranking: strArr.default([]),
  weakest_note: z.string().default(""),
  similarity_flags: strArr.default([]),
  honesty_note: z.string().default("Scores estimate potential. They do not guarantee views."),
});
export type CriticOutput = z.infer<typeof CriticOutputSchema>;

// ---------- Hooks + learnings ----------

export const HooksRequestSchema = z.object({
  hooks: z.array(str(200).min(1)).min(1).max(10),
  niche: z.enum([...NICHE_IDS, "other"]),
  custom_niche: str(80).optional(),
  language: z.enum(LANGUAGES).default("hinglish"),
  model: ModelOverride,
});
export const HooksOutputSchema = z.object({ hook_analysis: z.array(HookAnalysisItemSchema).min(1) });

const GroupStat = z.object({
  group: str(80),
  posts: z.number().int().min(0),
  avg_views: z.number(),
  avg_saves: z.number(),
  avg_shares: z.number(),
  avg_hold_rate: z.number(),
  avg_watch_pct: z.number(),
  avg_predicted_score: z.number(),
});
export const AggregatedStatsSchema = z.object({
  total_posts: z.number().int().min(1),
  correlation_score_views: z.number().nullable(),
  correlation_score_saves: z.number().nullable(),
  by_hook_type: z.array(GroupStat).max(50),
  by_pillar: z.array(GroupStat).max(50),
  by_niche: z.array(GroupStat).max(50),
  by_emotion: z.array(GroupStat).max(50),
  insights: z.array(str(300)).max(20),
});
export type AggregatedStats = z.infer<typeof AggregatedStatsSchema>;
export const LearningsRequestSchema = z.object({ stats: AggregatedStatsSchema, model: ModelOverride });
export const LearningsOutputSchema = z.object({ bullets: z.array(z.string()).min(1).max(8) });

// ---------- What the app stores per generation ----------

export interface CheckFailure {
  script_id: string | null; // null = batch-level
  check: string;
  message: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  calls: number;
}

export interface GenerationRecord {
  id: string;
  created_at: string;
  prompt_version: string;
  model: string;
  inputs: BusinessInput;
  mode: "B2B" | "B2C";
  used_past_performance: boolean;
  output: GeneratorOutput; // scripts already merged with critic rewrites
  critic: CriticOutput;
  checks: { initial: CheckFailure[]; final: CheckFailure[] };
  usage: Usage;
}

export type StreamEvent =
  | { type: "stage"; stage: "audience" | "writing" | "critic" | "finalising" }
  | { type: "result"; record: GenerationRecord }
  | { type: "error"; message: string; request_id: string };
