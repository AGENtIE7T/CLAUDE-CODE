import { NextResponse } from "next/server";
import { callJson, costUsd, resolveModel, type CallUsage } from "@/lib/anthropic";
import { hooksSystem, hooksUser, nicheLabel } from "@/lib/prompts";
import { HooksOutputSchema, HooksRequestSchema } from "@/lib/schema";
import { clientIp, errorJson, friendlyError, rateLimit, readJson, requestId } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const rid = requestId();
  try {
    const parsed = HooksRequestSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return errorJson(`Invalid ${i.path.join(".")}: ${i.message}`, 400, rid);
    }
    const limit = rateLimit(`hooks:${clientIp(req)}`, 30);
    if (!limit.ok) return errorJson(`Too many hook analyses this hour. Try again in ~${limit.retryMins} min.`, 429, rid);

    const { hooks, niche, custom_niche, language } = parsed.data;
    const model = resolveModel(parsed.data.model);
    const usage: CallUsage = { input_tokens: 0, output_tokens: 0, calls: 0 };
    const out = await callJson({
      model,
      system: hooksSystem(),
      user: hooksUser(hooks, nicheLabel({ niche, custom_niche: custom_niche ?? "" }), language),
      schema: HooksOutputSchema,
      maxTokens: 12_000,
      usage,
    });
    return NextResponse.json({ ...out, usage: { ...usage, cost_usd: costUsd(model, usage.input_tokens, usage.output_tokens) } });
  } catch (e) {
    const f = friendlyError(e, rid, "hooks");
    return errorJson(f.message, f.status, rid);
  }
}
