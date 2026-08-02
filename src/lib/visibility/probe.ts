import type { AnswerEngine, VisibilityProbe } from "@/lib/types";
import { fetchAiResponses } from "./ahrefs";

export interface ProbeInput {
  orgId: string;
  brandName: string;
  domain: string;
  prompt: string;
  engines: AnswerEngine[];
}

/**
 * Visibility measurement — the loop-closing step.
 *
 * For each answer engine we determine: is the brand mentioned, and is its
 * domain cited? We pull this from Ahrefs Brand Radar (AI responses). When
 * Brand Radar isn't configured or doesn't cover an engine, we record an
 * un-measured baseline row so the series stays complete.
 */
export async function probeVisibility(
  input: ProbeInput,
): Promise<Omit<VisibilityProbe, "id">[]> {
  const measuredAt = new Date().toISOString();

  let hits: Awaited<ReturnType<typeof fetchAiResponses>> = [];
  try {
    hits = await fetchAiResponses({
      brand: input.brandName,
      domain: input.domain,
      prompt: input.prompt,
    });
  } catch {
    hits = []; // measurement source failed — fall back to baselines
  }

  const byEngine = new Map(hits.map((h) => [h.engine, h]));

  return input.engines.map((engine) => {
    const hit = byEngine.get(engine);
    return {
      orgId: input.orgId,
      engine,
      prompt: input.prompt,
      mentioned: hit?.mentioned ?? false,
      citedUrls: hit?.citedUrls ?? [],
      measuredAt,
    };
  });
}

/** Share-of-voice: fraction of measured rows where the brand is mentioned. */
export function shareOfVoice(probes: Pick<VisibilityProbe, "mentioned">[]): number {
  if (probes.length === 0) return 0;
  const hits = probes.filter((p) => p.mentioned).length;
  return Math.round((hits / probes.length) * 100);
}
