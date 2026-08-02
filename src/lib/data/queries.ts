import { isDemo } from "@/lib/env";
import { store } from "@/lib/demo/store";
import { createClient } from "@/lib/supabase/server";
import type { AnswerEngine, AutonomyLevel, ChannelKind, ContentStatus } from "@/lib/types";

/** View models the dashboard screens render. Decouples pages from raw rows. */
export interface VisibilityRow { engine: AnswerEngine; label: string; now: number; prev: number }
export interface PromptGap { id: string; query: string; intent: string; appears: boolean; queuedType: string }
export interface CalendarRow { id: string; title: string; channel: ChannelKind; status: ContentStatus }
export interface QueueRow { id: string; title: string; channel: ChannelKind; excerpt: string }
export interface ChannelRow { kind: ChannelKind; label: string; connected: boolean; autonomy: AutonomyLevel; note: string }
export interface AuditRow { ts: string; who: string; action: string; detail: string }

const CHANNEL_NOTE: Record<ChannelKind, string> = {
  owned_site: "Your property — safe to auto-publish.",
  social: "Auto with cadence limits once connected.",
  directory: "Assisted, one-time, human-verified.",
  community: "Draft-only. Auto-posting disabled by policy (ToS).",
};

// ── visibility ───────────────────────────────────────────────────────────
export async function getVisibility(): Promise<VisibilityRow[]> {
  if (isDemo()) return store().sov;
  // Live: derive share-of-voice per engine from the latest probes.
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("visibility_probes")
      .select("engine, mentioned")
      .order("measured_at", { ascending: false })
      .limit(500);
    const labels: Record<AnswerEngine, string> = {
      chatgpt: "ChatGPT", perplexity: "Perplexity",
      google_ai_overviews: "Google AI Overviews", claude: "Claude", gemini: "Gemini",
    };
    const byEngine = new Map<AnswerEngine, { hit: number; total: number }>();
    for (const r of (data ?? []) as { engine: AnswerEngine; mentioned: boolean }[]) {
      const e = byEngine.get(r.engine) ?? { hit: 0, total: 0 };
      e.total++; if (r.mentioned) e.hit++;
      byEngine.set(r.engine, e);
    }
    return (Object.keys(labels) as AnswerEngine[]).map((engine) => {
      const e = byEngine.get(engine);
      return { engine, label: labels[engine], now: e ? Math.round((e.hit / e.total) * 100) : 0, prev: 0 };
    });
  } catch {
    return [];
  }
}

// ── prompts & gaps ─────────────────────────────────────────────────────────
export async function getPromptGaps(): Promise<PromptGap[]> {
  if (isDemo()) {
    const s = store();
    return s.prompts.map((p) => {
      const forPrompt = s.content.filter((c) => c.promptId === p.id);
      const appears = forPrompt.some((c) => c.status === "published");
      const queued = forPrompt.find((c) => c.status !== "published" && c.status !== "rejected");
      return { id: p.id, query: p.query, intent: p.intent, appears, queuedType: queued?.type ?? "—" };
    });
  }
  try {
    const supabase = createClient();
    const { data } = await supabase.from("prompt_sets").select("id, query, intent").limit(100);
    return (data ?? []).map((p: { id: string; query: string; intent: string }) => ({
      id: p.id, query: p.query, intent: p.intent, appears: false, queuedType: "—",
    }));
  } catch {
    return [];
  }
}

// ── calendar ────────────────────────────────────────────────────────────────
export async function getCalendar(): Promise<CalendarRow[]> {
  if (isDemo()) {
    return store().content.map((c) => ({ id: c.id, title: c.title, channel: c.channelKind, status: c.status }));
  }
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("content_items")
      .select("id, title, channel_kind, status")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((c: { id: string; title: string; channel_kind: ChannelKind; status: ContentStatus }) => ({
      id: c.id, title: c.title, channel: c.channel_kind, status: c.status,
    }));
  } catch {
    return [];
  }
}

// ── approval queue ───────────────────────────────────────────────────────────
export async function getApprovalQueue(): Promise<QueueRow[]> {
  if (isDemo()) {
    return store().content
      .filter((c) => c.status === "pending_approval")
      .map((c) => ({ id: c.id, title: c.title, channel: c.channelKind, excerpt: c.body }));
  }
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("content_items")
      .select("id, title, channel_kind, body")
      .eq("status", "pending_approval")
      .limit(50);
    return (data ?? []).map((c: { id: string; title: string; channel_kind: ChannelKind; body: string }) => ({
      id: c.id, title: c.title, channel: c.channel_kind, excerpt: c.body.slice(0, 220),
    }));
  } catch {
    return [];
  }
}

// ── channels ─────────────────────────────────────────────────────────────────
export async function getChannels(): Promise<ChannelRow[]> {
  if (isDemo()) {
    return store().channels.map((c) => ({
      kind: c.kind, label: c.label, connected: c.connected, autonomy: c.autonomyLevel, note: CHANNEL_NOTE[c.kind],
    }));
  }
  try {
    const supabase = createClient();
    const { data } = await supabase.from("channels").select("kind, label, connected, autonomy_level");
    return (data ?? []).map((c: { kind: ChannelKind; label: string; connected: boolean; autonomy_level: AutonomyLevel }) => ({
      kind: c.kind, label: c.label, connected: c.connected, autonomy: c.autonomy_level, note: CHANNEL_NOTE[c.kind],
    }));
  } catch {
    return [];
  }
}

// ── audit log ─────────────────────────────────────────────────────────────────
export async function getAuditLog(): Promise<AuditRow[]> {
  if (isDemo()) return store().audit;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("approvals")
      .select("created_at, decision, content_id")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((a: { created_at: string; decision: string; content_id: string }) => ({
      ts: a.created_at.slice(0, 16).replace("T", " "), who: "user", action: a.decision, detail: a.content_id,
    }));
  } catch {
    return [];
  }
}
