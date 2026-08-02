import type { AnswerEngine, ChannelKind, ContentType } from "@/lib/types";
import { draftForGap, resolveStatus, type PipelineContext } from "./run";
import { runGuards } from "@/lib/safety/guards";
import { probeVisibility } from "@/lib/visibility/probe";
import {
  getChannel,
  insertContentItem,
  insertProbes,
  postsLast24h,
  recentBodies,
} from "@/lib/db/repository";

/**
 * One full pipeline cycle for an organization:
 *
 *   for each gap:  draft → run safety guards → resolve status → persist
 *   then:          measure visibility across engines → persist probes
 *
 * Guards can override the channel's autonomy: a draft that would auto-publish
 * is forced to `pending_approval` if any guard trips, with the reasons stored
 * alongside it. That is the enforcement point behind the approval-queue default.
 */

export interface Gap {
  promptId: string;
  prompt: string;
  type: ContentType;
  channelKind: ChannelKind;
}

export interface CycleInput extends PipelineContext {
  brandName: string;
  gaps: Gap[];
  engines: AnswerEngine[];
  claimAllowlist: string[];
}

export interface CycleReport {
  drafted: number;
  autoApproved: number;
  sentToReview: number;
  guardTrips: { promptId: string; reasons: string[] }[];
  probesRecorded: number;
}

const ALL_ENGINES: AnswerEngine[] = [
  "chatgpt",
  "perplexity",
  "google_ai_overviews",
  "claude",
  "gemini",
];

export async function runCycle(input: CycleInput): Promise<CycleReport> {
  const report: CycleReport = {
    drafted: 0,
    autoApproved: 0,
    sentToReview: 0,
    guardTrips: [],
    probesRecorded: 0,
  };

  const since24h = new Date(Date.now() - 864e5).toISOString();
  const recent = await recentBodies(input.orgId, since24h);

  for (const gap of input.gaps) {
    const channel = await getChannel(input.orgId, gap.channelKind);
    const autonomy = channel?.autonomyLevel ?? "approval_queue";
    const capPerDay = channel?.rateCapPerDay ?? 3;
    const postsToday = channel ? await postsLast24h(input.orgId, channel.id) : 0;

    const drafted = await draftForGap(input, { ...gap, autonomy });
    report.drafted++;

    // The natural status per autonomy, then let guards demote it.
    const naturalStatus = resolveStatus(autonomy, gap.channelKind);
    const guard = runGuards({
      body: drafted.body,
      channelKind: gap.channelKind,
      recentBodies: recent,
      postsLast24h: postsToday,
      capPerDay,
      claimAllowlist: input.claimAllowlist,
    });

    const finalStatus = guard.ok ? naturalStatus : "pending_approval";
    if (!guard.ok) report.guardTrips.push({ promptId: gap.promptId, reasons: guard.reasons });
    if (finalStatus === "approved") report.autoApproved++;
    else report.sentToReview++;

    await insertContentItem(input.orgId, { ...drafted, status: finalStatus });
    recent.push(drafted.body); // guard the rest of this cycle against itself too
  }

  // Measure — close the loop across all target prompts.
  const engines = input.engines.length ? input.engines : ALL_ENGINES;
  const probeRows = (
    await Promise.all(
      input.gaps.map((g) =>
        probeVisibility({
          orgId: input.orgId,
          brandName: input.brandName,
          domain: input.domain,
          prompt: g.prompt,
          engines,
        }),
      ),
    )
  ).flat();

  await insertProbes(probeRows);
  report.probesRecorded = probeRows.length;
  return report;
}
