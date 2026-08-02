import { createServiceClient } from "@/lib/supabase/service";
import type {
  Channel,
  ContentStatus,
  VisibilityProbe,
} from "@/lib/types";
import type { DraftedItem } from "@/pipeline/run";

/**
 * Data access for the pipeline (service-role, tenant-scoped by org_id).
 * Thin, typed wrappers over Supabase so the orchestration reads cleanly.
 */

export async function getChannel(orgId: string, kind: Channel["kind"]): Promise<Channel | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("channels")
    .select("*")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Channel | null;
}

/** Recent published bodies for the dedupe guard. */
export async function recentBodies(orgId: string, sinceIso: string): Promise<string[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("content_items")
    .select("body")
    .eq("org_id", orgId)
    .eq("status", "published")
    .gte("created_at", sinceIso);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { body: string }) => r.body);
}

/** Count posts in the last 24h on a channel for the rate-cap guard. */
export async function postsLast24h(orgId: string, channelId: string): Promise<number> {
  const db = createServiceClient();
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count, error } = await db
    .from("publications")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("channel_id", channelId)
    .gte("posted_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function insertContentItem(orgId: string, item: DraftedItem): Promise<string> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("content_items")
    .insert({
      org_id: orgId,
      prompt_id: item.promptId,
      type: item.type,
      channel_kind: item.channelKind,
      title: item.title,
      body: item.body,
      schema_jsonld: item.schemaJsonLd,
      status: item.status,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function setContentStatus(id: string, status: ContentStatus): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("content_items").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function insertProbes(rows: Omit<VisibilityProbe, "id">[]): Promise<void> {
  if (rows.length === 0) return;
  const db = createServiceClient();
  const { error } = await db.from("visibility_probes").insert(
    rows.map((r) => ({
      org_id: r.orgId,
      engine: r.engine,
      prompt: r.prompt,
      mentioned: r.mentioned,
      cited_urls: r.citedUrls,
      measured_at: r.measuredAt,
    })),
  );
  if (error) throw new Error(error.message);
}
