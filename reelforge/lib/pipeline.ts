/**
 * Two-pass pipeline: generator -> deterministic checks -> critic -> merge -> re-check.
 * Shared by /api/generate and `npm run test:live`.
 */
import { callJson, costUsd, type CallUsage } from "./anthropic";
import { criticSystem, criticUser, generatorSystem, generatorUser, modeFor, replacementUser } from "./prompts";
import {
  CriticOutputSchema,
  GeneratorOutputSchema,
  PROMPT_VERSION,
  ReplacementOutputSchema,
  type BusinessInput,
  type CheckFailure,
  type CriticOutput,
  type CriticScore,
  type GenerationRecord,
  type GeneratorOutput,
  type Script,
} from "./schema";
import { checkBatch, scoreInflationWarning, type CheckContext } from "./validate";

export type Stage = "audience" | "writing" | "critic" | "finalising";

function ctxFor(inputs: BusinessInput): CheckContext {
  return { mode: modeFor(inputs), language: inputs.language, city: inputs.city, area: inputs.area };
}

const sumBreakdown = (b: CriticScore["breakdown"]) => Object.values(b).reduce((a, n) => a + n, 0);

/** Critic schema that also insists every expected script id is scored. */
function criticSchemaFor(ids: string[]) {
  return CriticOutputSchema.superRefine((v, ctx) => {
    const scored = new Set(v.scores.map((s) => s.script_id));
    for (const id of ids) if (!scored.has(id)) ctx.addIssue({ code: "custom", path: ["scores"], message: `Missing score for script "${id}".` });
  });
}

function hashtagsNormalised(s: Script): Script {
  return { ...s, hashtags: s.hashtags.map((h) => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`)).filter((h) => h.length > 1) };
}

/** Rewrites replace originals, totals are recomputed from the breakdown, scripts sorted by score. */
export function mergeCritic(scripts: Script[], critic: CriticOutput): { scripts: Script[]; critic: CriticOutput } {
  const rewrites = new Map(critic.rewritten_scripts.map((s) => [s.id, hashtagsNormalised(s)]));
  const scores = critic.scores.map((s) => ({ ...s, total: sumBreakdown(s.breakdown), rewritten: s.rewritten || rewrites.has(s.script_id) }));
  const byId = new Map(scores.map((s) => [s.script_id, s]));
  const merged = scripts.map((s) => rewrites.get(s.id) ?? s);
  merged.sort((a, b) => (byId.get(b.id)?.total ?? 0) - (byId.get(a.id)?.total ?? 0));
  return {
    scripts: merged,
    critic: { ...critic, scores, ranking: merged.map((s) => s.id) },
  };
}

export interface PipelineOptions {
  inputs: BusinessInput;
  model: string;
  pastPerformance?: string;
  onStage?: (s: Stage) => void;
}

export async function runPipeline(opts: PipelineOptions): Promise<GenerationRecord> {
  const { inputs, model } = opts;
  const usage: CallUsage = { input_tokens: 0, output_tokens: 0, calls: 0 };
  const ctx = ctxFor(inputs);

  // 1. Generator
  opts.onStage?.("audience");
  let wroteStage = false;
  const gen = await callJson({
    model,
    system: generatorSystem(inputs, opts.pastPerformance),
    user: generatorUser(inputs),
    schema: GeneratorOutputSchema,
    usage,
    onText: (soFar) => {
      if (!wroteStage && soFar.includes('"scripts"')) {
        wroteStage = true;
        opts.onStage?.("writing");
      }
    },
  });
  if (!wroteStage) opts.onStage?.("writing");
  gen.scripts = gen.scripts.map(hashtagsNormalised);

  // 2. Deterministic checks
  const initial = checkBatch(gen.scripts, ctx);

  // 3. Critic
  opts.onStage?.("critic");
  const critic = await callJson({
    model,
    system: criticSystem(),
    user: criticUser({ inputs, scripts: gen.scripts, failedChecks: initial }),
    schema: criticSchemaFor(gen.scripts.map((s) => s.id)),
    usage,
  });

  // 4. Merge + re-check
  opts.onStage?.("finalising");
  const merged = mergeCritic(gen.scripts, critic);
  const final = finalChecks(merged.scripts, merged.critic, ctx);

  return {
    id: newId(),
    created_at: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    model,
    inputs,
    mode: ctx.mode,
    used_past_performance: Boolean(opts.pastPerformance?.trim()),
    output: { ...gen, scripts: merged.scripts },
    critic: merged.critic,
    checks: { initial, final },
    usage: { ...usage, cost_usd: costUsd(model, usage.input_tokens, usage.output_tokens) },
  };
}

function finalChecks(scripts: Script[], critic: CriticOutput, ctx: CheckContext): CheckFailure[] {
  const final = checkBatch(scripts, ctx);
  const inflation = scoreInflationWarning(critic.scores);
  if (inflation) final.push(inflation);
  return final;
}

/** Replace the lowest-scoring script with a fresh one, re-run checks and critic on it. */
export async function regenerateWeakest(record: GenerationRecord, model: string, onStage?: (s: Stage) => void): Promise<GenerationRecord> {
  const { inputs } = record;
  const ctx = ctxFor(inputs);
  const usage: CallUsage = { input_tokens: 0, output_tokens: 0, calls: 0 };
  const scores = new Map(record.critic.scores.map((s) => [s.script_id, s.total]));
  const weakest = [...record.output.scripts].sort((a, b) => (scores.get(a.id) ?? 0) - (scores.get(b.id) ?? 0))[0];
  const keep = record.output.scripts.filter((s) => s.id !== weakest.id);

  onStage?.("writing");
  const rep = await callJson({
    model,
    system: generatorSystem(inputs),
    user: replacementUser(
      inputs,
      weakest.id,
      keep.map(({ id, hook_type, content_pillar, emotion, title }) => ({ id, hook_type, content_pillar, emotion, title })),
    ),
    schema: ReplacementOutputSchema,
    usage,
  });
  const fresh = hashtagsNormalised({ ...rep.scripts[0], id: weakest.id });
  const initial = checkBatch([...keep, fresh], ctx).filter((f) => f.script_id === fresh.id);

  onStage?.("critic");
  const c = await callJson({
    model,
    system: criticSystem(),
    user: criticUser({ inputs, scripts: [fresh], failedChecks: initial, context: keep.map(({ id, title, hook_type, content_pillar, hook }) => ({ id, title, hook_type, content_pillar, hook })) }),
    schema: criticSchemaFor([fresh.id]),
    usage,
  });

  onStage?.("finalising");
  const freshScore = c.scores.find((s) => s.script_id === fresh.id)!;
  const combined: CriticOutput = {
    ...record.critic,
    scores: [...record.critic.scores.filter((s) => s.script_id !== fresh.id), freshScore],
    rewritten_scripts: c.rewritten_scripts.filter((s) => s.id === fresh.id),
    similarity_flags: [...record.critic.similarity_flags, ...c.similarity_flags],
  };
  const merged = mergeCritic([...keep, fresh], combined);
  const final = finalChecks(merged.scripts, merged.critic, ctx);
  const prevUsage = record.usage;
  const input_tokens = prevUsage.input_tokens + usage.input_tokens;
  const output_tokens = prevUsage.output_tokens + usage.output_tokens;

  return {
    ...record,
    id: newId(),
    created_at: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    model,
    output: { ...record.output, scripts: merged.scripts } as GeneratorOutput,
    critic: merged.critic,
    checks: { initial: [...record.checks.initial.filter((f) => f.script_id !== fresh.id), ...initial], final },
    usage: { input_tokens, output_tokens, calls: prevUsage.calls + usage.calls, cost_usd: costUsd(model, input_tokens, output_tokens) },
  };
}

export function newId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
