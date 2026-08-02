import type { ChannelKind, ContentItem } from "@/lib/types";

export interface PublishResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Every destination the posting engine can publish to implements this
 * interface. Adding a new platform = adding one connector, nothing else
 * in the pipeline changes.
 */
export interface ChannelConnector {
  kind: ChannelKind;
  /** Whether this connector is allowed to publish without human approval. */
  supportsAutoPublish: boolean;
  /** Push a fully-approved content item live. */
  publish(item: ContentItem, credentials: Record<string, string>): Promise<PublishResult>;
}

import { ownedSiteConnector } from "./owned-site";

const registry: Partial<Record<ChannelKind, ChannelConnector>> = {
  owned_site: ownedSiteConnector,
  // social:    socialConnector,      // phase: weeks 8–9
  // directory: directoryConnector,   // phase: weeks 8–9 (assisted)
  // community: communityConnector,   // phase: weeks 10–12 (draft + approve only)
};

export function getConnector(kind: ChannelKind): ChannelConnector | undefined {
  return registry[kind];
}
