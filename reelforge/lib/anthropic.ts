import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/** USD per 1M tokens. Unknown models show token counts without a cost. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export function resolveModel(override?: string): string {
  return override?.trim() || process.env.REELFORGE_MODEL?.trim() || DEFAULT_MODEL;
}

export function costUsd(model: string, input: number, output: number): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (input * p.input + output * p.output) / 1_000_000;
}

export class ModelJsonError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
  }
}

export class UserFacingError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new UserFacingError("Server is missing ANTHROPIC_API_KEY. Add it to .env.local (or Vercel env vars).", 500);
  }
  client ??= new Anthropic({ timeout: 170_000, maxRetries: 1 });
  return client;
}

export interface CallUsage {
  input_tokens: number;
  output_tokens: number;
  calls: number;
}

export interface CallOptions<S extends z.ZodTypeAny> {
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  usage: CallUsage;
  /** Receives the accumulated text as it streams (used for progress stages). */
  onText?: (soFar: string) => void;
}

function effort(): "low" | "medium" | "high" {
  const e = process.env.REELFORGE_EFFORT;
  return e === "low" || e === "high" ? e : "medium";
}

async function callText(model: string, system: string, user: string, maxTokens: number, usage: CallUsage, onText?: (s: string) => void) {
  const c = getClient();
  const withFallback = FALLBACK_MODELS.has(model);
  const stream = c.beta.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: effort() },
    ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  if (onText) {
    let soFar = "";
    stream.on("text", (delta) => {
      soFar += delta;
      onText(soFar);
    });
  }
  const msg = await stream.finalMessage();
  usage.input_tokens += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
  usage.output_tokens += msg.usage.output_tokens;
  usage.calls += 1;
  if (msg.stop_reason === "refusal") {
    throw new UserFacingError("The model declined this request. Try rephrasing the business details.", 422);
  }
  if (msg.stop_reason === "max_tokens") {
    throw new ModelJsonError("Output was cut off (max_tokens).", "");
  }
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Pulls the first top-level JSON object out of a model response. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in the response.");
  return JSON.parse(t.slice(start, end + 1));
}

function parseWith<S extends z.ZodTypeAny>(schema: S, text: string): { ok: true; data: z.output<S> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const r = schema.safeParse(json);
  if (r.success) return { ok: true, data: r.data };
  const issues = r.error.issues
    .slice(0, 25)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  return { ok: false, error: `Schema validation failed:\n${issues}` };
}

/**
 * Calls the model, validates its JSON with Zod, and retries once with the
 * validation error sent back. Throws ModelJsonError if the retry also fails.
 */
export async function callJson<S extends z.ZodTypeAny>(opts: CallOptions<S>): Promise<z.output<S>> {
  const maxTokens = opts.maxTokens ?? 32_000;
  let text = "";
  let firstError: string;
  try {
    text = await callText(opts.model, opts.system, opts.user, maxTokens, opts.usage, opts.onText);
    const r = parseWith(opts.schema, text);
    if (r.ok) return r.data;
    firstError = r.error;
  } catch (e) {
    if (!(e instanceof ModelJsonError)) throw e;
    firstError = e.message;
  }

  const retryUser = [
    opts.user,
    "",
    "# YOUR PREVIOUS ATTEMPT FAILED VALIDATION",
    firstError,
    text ? `\nPrevious output (fix it, keep what was good):\n${text.slice(0, 60_000)}` : "",
    "\nReturn the complete corrected JSON only. No markdown, no commentary.",
  ].join("\n");
  const text2 = await callText(opts.model, opts.system, retryUser, maxTokens, opts.usage);
  const r2 = parseWith(opts.schema, text2);
  if (r2.ok) return r2.data;
  throw new ModelJsonError(r2.error, text2);
}
