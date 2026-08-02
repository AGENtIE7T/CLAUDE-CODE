import { NextResponse } from "next/server";
import { z } from "zod";
import { runCycle, type CycleInput } from "@/pipeline/cycle";

/**
 * Run one full pipeline cycle for an org (draft → guard → persist → measure).
 * In production a scheduler drives this per-tenant; this endpoint is for
 * kicking a cycle manually.
 *
 * NOTE: guard with service-role auth before exposing. Left open in scaffold.
 */
const Body = z.object({
  orgId: z.string().uuid(),
  domain: z.string(),
  brandName: z.string(),
  brandGuide: z.string().nullable().default(null),
  claimAllowlist: z.array(z.string()).default([]),
  engines: z
    .array(z.enum(["chatgpt", "perplexity", "google_ai_overviews", "claude", "gemini"]))
    .default([]),
  gaps: z
    .array(
      z.object({
        promptId: z.string().uuid(),
        prompt: z.string().min(4),
        type: z.enum([
          "faq_page",
          "glossary",
          "comparison",
          "how_to",
          "stat_roundup",
          "community_answer",
          "social_post",
        ]),
        channelKind: z.enum(["owned_site", "social", "directory", "community"]),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const report = await runCycle(parsed.data as CycleInput);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cycle failed" },
      { status: 500 },
    );
  }
}
