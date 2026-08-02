import { NextResponse } from "next/server";
import { z } from "zod";
import { draftForGap, type PipelineContext } from "@/pipeline/run";

/**
 * Manual pipeline trigger — kicks a single draft pass for one gap.
 * In production a scheduler (Inngest / Trigger.dev / Supabase cron) drives
 * this per-tenant; this endpoint is for testing the loop end to end.
 *
 * NOTE: guard with auth + service-role before exposing. Left open in scaffold.
 */
const Body = z.object({
  orgId: z.string().uuid(),
  domain: z.string(),
  brandGuide: z.string().nullable().default(null),
  promptId: z.string().uuid(),
  prompt: z.string().min(4),
  type: z.enum(["faq_page", "glossary", "comparison", "how_to", "stat_roundup", "community_answer", "social_post"]),
  channelKind: z.enum(["owned_site", "social", "directory", "community"]),
  autonomy: z.enum(["approval_queue", "semi_auto", "fully_auto"]).default("approval_queue"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { orgId, domain, brandGuide, ...gap } = parsed.data;
  const ctx: PipelineContext = { orgId, domain, brandGuide };

  try {
    const drafted = await draftForGap(ctx, gap);
    return NextResponse.json({ drafted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "pipeline failed" },
      { status: 500 },
    );
  }
}
