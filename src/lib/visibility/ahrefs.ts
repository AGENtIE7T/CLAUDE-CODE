import type { AnswerEngine } from "@/lib/types";

/**
 * Ahrefs Brand Radar client — the AI-visibility data source.
 *
 * Brand Radar tracks how often a brand appears and is cited across AI
 * answer engines for a set of prompts. We query it per prompt and map the
 * response into our probe rows.
 *
 * Docs: https://docs.ahrefs.com/  (Brand Radar / AI responses endpoints)
 */
const BASE = "https://api.ahrefs.com/v3";

export interface AiResponseHit {
  engine: AnswerEngine;
  mentioned: boolean;
  citedUrls: string[];
}

/** Map Ahrefs' engine identifiers onto ours. */
const engineMap: Record<string, AnswerEngine> = {
  chatgpt: "chatgpt",
  perplexity: "perplexity",
  google_ai_overviews: "google_ai_overviews",
  "google-ai-overviews": "google_ai_overviews",
  claude: "claude",
  gemini: "gemini",
};

/**
 * Fetch AI-response visibility for a single prompt.
 * Returns one hit per engine Brand Radar reports on.
 */
export async function fetchAiResponses(params: {
  brand: string;
  domain: string;
  prompt: string;
  token?: string;
}): Promise<AiResponseHit[]> {
  const token = params.token ?? process.env.AHREFS_API_TOKEN;
  if (!token) return []; // not configured — caller records an un-measured baseline

  const url = new URL(`${BASE}/brand-radar/ai-responses`);
  url.searchParams.set("keyword", params.prompt);
  url.searchParams.set("target", params.domain);

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Ahrefs Brand Radar ${res.status}`);

  const data = (await res.json()) as {
    responses?: { engine: string; brand_mentioned?: boolean; citations?: { url: string }[] }[];
  };

  return (data.responses ?? []).flatMap((r) => {
    const engine = engineMap[r.engine];
    if (!engine) return [];
    return [
      {
        engine,
        mentioned: Boolean(r.brand_mentioned),
        citedUrls: (r.citations ?? []).map((c) => c.url),
      },
    ];
  });
}
