import type { AnswerEngine, VisibilityProbe } from "@/lib/types";

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
 * For each answer engine we run the target prompt and check: is the brand
 * mentioned, and is its domain cited? Where an engine exposes brand-visibility
 * data via API (Ahrefs Brand Radar, Semrush), we use that; otherwise we probe
 * the engine directly and parse the response.
 *
 * This stub returns the shape the dashboard's share-of-voice chart consumes.
 * Wire `measureOne` to Ahrefs Brand Radar (AI responses) or a per-engine call.
 */
export async function probeVisibility(input: ProbeInput): Promise<Omit<VisibilityProbe, "id">[]> {
  const now = new Date().toISOString();
  const results = await Promise.all(
    input.engines.map((engine) => measureOne(engine, input, now)),
  );
  return results;
}

async function measureOne(
  engine: AnswerEngine,
  input: ProbeInput,
  measuredAt: string,
): Promise<Omit<VisibilityProbe, "id">> {
  // TODO: integrate Ahrefs Brand Radar `brand-radar-ai-responses` or a direct
  // engine query here. For now, return an un-measured baseline row.
  return {
    orgId: input.orgId,
    engine,
    prompt: input.prompt,
    mentioned: false,
    citedUrls: [],
    measuredAt,
  };
}

/** Share-of-voice: fraction of target prompts where the brand is cited. */
export function shareOfVoice(probes: Pick<VisibilityProbe, "mentioned">[]): number {
  if (probes.length === 0) return 0;
  const hits = probes.filter((p) => p.mentioned).length;
  return Math.round((hits / probes.length) * 100);
}
