import { NextResponse } from "next/server";
import { callJson, costUsd, resolveModel, type CallUsage } from "@/lib/anthropic";
import { learningsSystem } from "@/lib/prompts";
import { LearningsOutputSchema, LearningsRequestSchema } from "@/lib/schema";
import { clientIp, errorJson, friendlyError, rateLimit, readJson, requestId } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const rid = requestId();
  try {
    // Only aggregated stats are accepted (schema has no free-text personal fields).
    const parsed = LearningsRequestSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return errorJson(`Invalid ${i.path.join(".")}: ${i.message}`, 400, rid);
    }
    const limit = rateLimit(`learn:${clientIp(req)}`, 20);
    if (!limit.ok) return errorJson(`Too many learnings requests this hour. Try again in ~${limit.retryMins} min.`, 429, rid);

    const model = resolveModel(parsed.data.model);
    const usage: CallUsage = { input_tokens: 0, output_tokens: 0, calls: 0 };
    const out = await callJson({
      model,
      system: learningsSystem(),
      user: `# AGGREGATED STATS\n${JSON.stringify(parsed.data.stats, null, 2)}`,
      schema: LearningsOutputSchema,
      maxTokens: 4_000,
      usage,
    });
    return NextResponse.json({ bullets: out.bullets.slice(0, 5), usage: { ...usage, cost_usd: costUsd(model, usage.input_tokens, usage.output_tokens) } });
  } catch (e) {
    const f = friendlyError(e, rid, "learnings");
    return errorJson(f.message, f.status, rid);
  }
}
