import type { AutonomyLevel, ChannelKind, ContentStatus, ContentType } from "@/lib/types";
import { generateContent } from "@/lib/llm/generate";
import { getConnector } from "@/lib/channels";
import { channelConfig } from "@/config/app.config";

/**
 * The core loop, as one runnable pass per organization.
 *
 *   mine → gap → draft → review → publish → measure → (feeds next cycle)
 *
 * This is the orchestration skeleton. In production each stage is a queued,
 * retryable job (Inngest / Trigger.dev). Here they run inline so the flow
 * is readable and testable end to end.
 */

export interface PipelineContext {
  orgId: string;
  domain: string;
  brandGuide: string | null;
}

/**
 * Decide what happens to a freshly-drafted item given the channel's autonomy.
 * Default posture (approval_queue) always parks the item for a human.
 */
export function resolveStatus(
  autonomy: AutonomyLevel,
  kind: ChannelKind,
): ContentStatus {
  // A channel that may never auto-publish (config-driven; e.g. community,
  // directory) always parks for review, regardless of autonomy level.
  if (!channelConfig(kind).canAutoPublish) return "pending_approval";
  // The approval-queue posture always requires a human.
  if (autonomy === "approval_queue") return "pending_approval";
  // semi_auto and fully_auto both auto-approve auto-publishable channels.
  return "approved";
}

export interface DraftedItem {
  promptId: string;
  type: ContentType;
  channelKind: ChannelKind;
  title: string;
  body: string;
  schemaJsonLd: Record<string, unknown> | null;
  status: ContentStatus;
}

/** Stage 03–04: draft an asset for a mined gap and set its review status. */
export async function draftForGap(
  ctx: PipelineContext,
  gap: { promptId: string; prompt: string; type: ContentType; channelKind: ChannelKind; autonomy: AutonomyLevel },
): Promise<DraftedItem> {
  const generated = await generateContent({
    prompt: gap.prompt,
    contentType: gap.type,
    brandGuide: ctx.brandGuide,
    domain: ctx.domain,
  });

  return {
    promptId: gap.promptId,
    type: gap.type,
    channelKind: gap.channelKind,
    title: generated.title,
    body: generated.body,
    schemaJsonLd: generated.schemaJsonLd,
    status: resolveStatus(gap.autonomy, gap.channelKind),
  };
}

/** Stage 05: publish an approved item via its channel connector. */
export async function publishApproved(
  kind: ChannelKind,
  item: Parameters<NonNullable<ReturnType<typeof getConnector>>["publish"]>[0],
  credentials: Record<string, string>,
) {
  const connector = getConnector(kind);
  if (!connector) return { ok: false, error: `No connector for channel: ${kind}` };
  if (!connector.supportsAutoPublish && item.status !== "approved") {
    return { ok: false, error: "Channel requires explicit human approval before publish." };
  }
  return connector.publish(item, credentials);
}
