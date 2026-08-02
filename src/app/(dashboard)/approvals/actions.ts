"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContentStatus } from "@/lib/types";

/**
 * Approval decisions. These run under the signed-in user's RLS session,
 * so a user can only ever act on content in their own org. Every decision
 * is written to the approvals audit trail.
 */
async function decide(contentId: string, decision: "approved" | "rejected", note?: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const nextStatus: ContentStatus = decision === "approved" ? "approved" : "rejected";

  const { data: content, error: updErr } = await supabase
    .from("content_items")
    .update({ status: nextStatus })
    .eq("id", contentId)
    .select("org_id")
    .single();
  if (updErr) return { ok: false, error: updErr.message };

  const { error: logErr } = await supabase.from("approvals").insert({
    org_id: (content as { org_id: string }).org_id,
    content_id: contentId,
    approver: user.id,
    decision,
    note: note ?? null,
  });
  if (logErr) return { ok: false, error: logErr.message };

  revalidatePath("/approvals");
  return { ok: true };
}

export async function approveContent(contentId: string) {
  return decide(contentId, "approved");
}

export async function rejectContent(contentId: string, note?: string) {
  return decide(contentId, "rejected", note);
}
