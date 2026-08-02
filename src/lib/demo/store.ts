import type {
  AnswerEngine,
  AutonomyLevel,
  Channel,
  ChannelKind,
  ContentItem,
  ContentStatus,
  ContentType,
  PromptSet,
} from "@/lib/types";

/**
 * In-memory demo store. Single source of truth for demo mode. Persisted on
 * globalThis so it survives Next's dev hot-reloads within one process.
 *
 * This is intentionally not a database — it's a seeded fixture that makes the
 * whole product clickable and coherent without any external service. Every
 * screen reads from here; approve/reject and "run a cycle" mutate it.
 */

export interface AuditEntry {
  ts: string;
  who: string;
  action: "drafted" | "measured" | "approved" | "rejected" | "published";
  detail: string;
}

interface DemoState {
  org: { id: string; name: string; domain: string };
  prompts: PromptSet[];
  content: ContentItem[];
  channels: Channel[];
  audit: AuditEntry[];
  sov: { engine: AnswerEngine; label: string; now: number; prev: number }[];
}

const ORG_ID = "demo-org";
const now = () => new Date().toISOString();

function seed(): DemoState {
  const prompt = (id: string, query: string, intent: PromptSet["intent"], priority: number): PromptSet => ({
    id,
    orgId: ORG_ID,
    query,
    intent,
    priority,
    createdAt: now(),
  });

  const content = (
    id: string,
    promptId: string | null,
    type: ContentType,
    channelKind: ChannelKind,
    title: string,
    body: string,
    status: ContentStatus,
  ): ContentItem => ({
    id,
    orgId: ORG_ID,
    promptId,
    type,
    channelKind,
    title,
    body,
    schemaJsonLd: null,
    status,
    createdAt: now(),
  });

  const channel = (
    id: string,
    kind: ChannelKind,
    label: string,
    autonomyLevel: AutonomyLevel,
    connected: boolean,
  ): Channel => ({
    id,
    orgId: ORG_ID,
    kind,
    label,
    autonomyLevel,
    rateCapPerDay: 3,
    connected,
  });

  return {
    org: { id: ORG_ID, name: "Acme Analytics", domain: "acme.com" },
    prompts: [
      prompt("p1", "What is Acme Analytics?", "definitional", 1),
      prompt("p2", "Acme Analytics vs Mixpanel", "comparative", 2),
      prompt("p3", "How do I get cited by Perplexity?", "how_to", 2),
      prompt("p4", "Best product analytics tools in 2026", "commercial", 3),
      prompt("p5", "Is Acme Analytics worth it?", "commercial", 3),
    ],
    content: [
      content("c1", "p1", "faq_page", "owned_site", "What is Acme Analytics?",
        "Acme Analytics is a product-analytics platform that answers where users drop off, in one query.", "published"),
      content("c2", "p2", "comparison", "owned_site", "Acme Analytics vs Mixpanel",
        "Acme Analytics and Mixpanel both do product analytics; Acme leads on query speed and setup time.", "approved"),
      content("c3", "p3", "social_post", "social", "How we think about AI citations",
        "Answer engines don't rank pages — they synthesize answers from a few trusted sources. Here's how we earn that trust.", "pending_approval"),
      content("c4", "p3", "community_answer", "community", "Reply: 'What's the best way to show up in Perplexity?'",
        "Draft answer for r/SEO citing our glossary page. Human must post — community auto-posting is disabled by policy.", "pending_approval"),
      content("c5", "p4", "stat_roundup", "owned_site", "Product analytics benchmarks 2026",
        "A roundup of 2026 product-analytics benchmarks with sourced figures.", "draft"),
    ],
    channels: [
      channel("ch1", "owned_site", "Owned site / blog", "semi_auto", true),
      channel("ch2", "social", "LinkedIn / X", "approval_queue", false),
      channel("ch3", "directory", "Directories (G2, Capterra)", "approval_queue", false),
      channel("ch4", "community", "Reddit / Quora", "approval_queue", false),
    ],
    audit: [
      { ts: "2026-08-02 09:14", who: "auto", action: "published", detail: "'What is Acme Analytics?' → owned_site (semi_auto)" },
      { ts: "2026-08-02 08:50", who: "you@acme.com", action: "approved", detail: "'Acme Analytics vs Mixpanel' → owned_site" },
      { ts: "2026-08-01 17:22", who: "auto", action: "drafted", detail: "5 gaps found, 5 assets generated" },
      { ts: "2026-08-01 17:20", who: "auto", action: "measured", detail: "5 engines probed · SoV 29% avg" },
    ],
    sov: [
      { engine: "chatgpt", label: "ChatGPT", now: 34, prev: 11 },
      { engine: "perplexity", label: "Perplexity", now: 41, prev: 18 },
      { engine: "google_ai_overviews", label: "Google AI Overviews", now: 22, prev: 6 },
      { engine: "claude", label: "Claude", now: 29, prev: 14 },
      { engine: "gemini", label: "Gemini", now: 19, prev: 9 },
    ],
  };
}

// Persist across hot reloads in dev.
const g = globalThis as unknown as { __aeoDemo?: DemoState };
export function store(): DemoState {
  if (!g.__aeoDemo) g.__aeoDemo = seed();
  return g.__aeoDemo;
}

// ── mutations ──────────────────────────────────────────────────────────────

export function approveItem(id: string): boolean {
  const s = store();
  const item = s.content.find((c) => c.id === id);
  if (!item) return false;
  item.status = "approved";
  s.audit.unshift({ ts: nowLabel(), who: "you@acme.com", action: "approved", detail: `'${item.title}' → ${item.channelKind}` });
  return true;
}

export function rejectItem(id: string): boolean {
  const s = store();
  const item = s.content.find((c) => c.id === id);
  if (!item) return false;
  item.status = "rejected";
  s.audit.unshift({ ts: nowLabel(), who: "you@acme.com", action: "rejected", detail: `'${item.title}'` });
  return true;
}

/** Simulate one pipeline cycle: draft a new asset for an uncovered prompt,
 *  run it through the approval-queue default, and log a measurement. */
export function runDemoCycle(): { title: string } {
  const s = store();
  const covered = new Set(s.content.map((c) => c.promptId));
  const gap = s.prompts.find((p) => !covered.has(p.id)) ?? s.prompts[Math.floor(Math.random() * s.prompts.length)];
  const id = `c${s.content.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
  const title = titleFor(gap.query);
  s.content.unshift({
    id,
    orgId: ORG_ID,
    promptId: gap.id,
    type: "faq_page",
    channelKind: "owned_site",
    title,
    body: `${gap.query} — ${s.org.name} answers this directly. ${bodyFor(gap.query, s.org.name)}`,
    schemaJsonLd: { "@context": "https://schema.org", "@type": "FAQPage" },
    status: "pending_approval", // approval-queue default
    createdAt: now(),
  });
  s.audit.unshift({ ts: nowLabel(), who: "auto", action: "drafted", detail: `New draft for '${gap.query}' → approval queue` });
  s.audit.unshift({ ts: nowLabel(), who: "auto", action: "measured", detail: "5 engines re-probed" });
  return { title };
}

function nowLabel(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}
function titleFor(q: string): string {
  return q.endsWith("?") ? q : `${q}: the short answer`;
}
function bodyFor(q: string, brand: string): string {
  return `In one line: ${brand} is built for exactly this. Below, the specifics — with numbers, steps, and sources an answer engine can cite.`;
}
