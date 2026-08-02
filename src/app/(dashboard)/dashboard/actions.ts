"use server";

import { revalidatePath } from "next/cache";
import { isDemo } from "@/lib/env";
import { runDemoCycle } from "@/lib/demo/store";

/**
 * Kick one pipeline cycle. In demo mode this drafts a new asset into the
 * approval queue and logs a measurement, so you can watch the loop work.
 * In live mode, wire this to runCycle() with the org's mined gaps.
 */
export async function triggerCycle(): Promise<{ ok: boolean; title?: string }> {
  if (isDemo()) {
    const { title } = runDemoCycle();
    revalidatePath("/dashboard");
    revalidatePath("/approvals");
    revalidatePath("/audit");
    revalidatePath("/calendar");
    return { ok: true, title };
  }
  // TODO (live): fetch mined gaps for the org and call runCycle(...).
  return { ok: false };
}
