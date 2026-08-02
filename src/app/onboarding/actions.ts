"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { appConfig } from "@/config/app.config";
import type { ChannelKind } from "@/lib/types";

/**
 * Create the caller's organization and everything a new tenant needs:
 * an owner membership, the four channels (all at the safe approval-queue
 * default), and a few seed target prompts. Runs under the user's RLS session.
 */
export async function createOrg(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!name || !domain) throw new Error("Name and domain are required.");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name, domain, plan: "free" })
    .select("id")
    .single();
  if (orgErr) throw new Error(orgErr.message);
  const orgId = (org as { id: string }).id;

  const { error: memErr } = await supabase
    .from("memberships")
    .insert({ org_id: orgId, user_id: user.id, role: "owner" });
  if (memErr) throw new Error(memErr.message);

  // Channels and their safe defaults come straight from app.config.ts.
  const kinds = Object.keys(appConfig.channels) as ChannelKind[];
  await supabase.from("channels").insert(
    kinds.map((kind) => {
      const cfg = appConfig.channels[kind];
      return {
        org_id: orgId,
        kind,
        label: cfg.label,
        autonomy_level: cfg.defaultAutonomy,
        rate_cap_per_day: cfg.rateCapPerDay,
        connected: false,
      };
    }),
  );

  const seeds = [
    { query: `What is ${name}?`, intent: "definitional" as const, priority: 1 },
    { query: `${name} alternatives`, intent: "comparative" as const, priority: 2 },
    { query: `Is ${name} worth it?`, intent: "commercial" as const, priority: 3 },
  ];
  await supabase.from("prompt_sets").insert(seeds.map((s) => ({ org_id: orgId, ...s })));

  redirect("/dashboard");
}
