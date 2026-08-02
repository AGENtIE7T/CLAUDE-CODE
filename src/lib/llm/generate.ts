import Anthropic from "@anthropic-ai/sdk";
import type { ContentType } from "@/lib/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AEO_MODEL ?? "claude-sonnet-5";

export interface GenerateInput {
  prompt: string; // the AI question we want to be cited for
  contentType: ContentType;
  brandGuide: string | null;
  domain: string;
}

export interface GeneratedContent {
  title: string;
  body: string; // markdown, answer-first
  schemaJsonLd: Record<string, unknown> | null;
}

/**
 * AEO content generation. The system prompt encodes the citation-earning
 * rules from the strategy: answer-first, factually dense, extractable
 * formats, no fabricated claims.
 */
const SYSTEM = `You write content engineered to be CITED by AI answer engines
(ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini). Non-negotiable rules:

1. Answer the question directly in the FIRST paragraph. Detail below.
2. Be factually dense: specific numbers, dates, named sources. Never invent stats.
3. Use extractable formats: bullet lists, numbered steps, comparison tables.
4. Match the content type's structure exactly.
5. Only make claims supportable from the brand guide or well-known facts.
   If you are unsure of a fact, omit it — do not fabricate.
Return clean markdown with a proper heading hierarchy (single H1).`;

export async function generateContent(input: GenerateInput): Promise<GeneratedContent> {
  const user = [
    `Target AI question: "${input.prompt}"`,
    `Content type: ${input.contentType}`,
    `Brand domain: ${input.domain}`,
    input.brandGuide ? `Brand guide:\n${input.brandGuide}` : "No brand guide provided.",
    "",
    "Produce the asset. Then, on a final line, output a JSON-LD schema object",
    "appropriate to the content type (FAQPage / HowTo / Article) inside a",
    "```json fenced block.",
  ].join("\n");

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return parseGenerated(text, input.prompt);
}

/** Split the markdown body from the trailing JSON-LD block. */
export function parseGenerated(text: string, fallbackTitle: string): GeneratedContent {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  let schemaJsonLd: Record<string, unknown> | null = null;
  if (jsonMatch) {
    try {
      schemaJsonLd = JSON.parse(jsonMatch[1].trim());
    } catch {
      schemaJsonLd = null;
    }
  }
  const body = text.replace(/```json[\s\S]*?```/, "").trim();
  const h1 = body.match(/^#\s+(.+)$/m);
  return { title: h1?.[1]?.trim() ?? fallbackTitle, body, schemaJsonLd };
}
