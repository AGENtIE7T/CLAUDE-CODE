import type { ChannelConnector, PublishResult } from "./index";
import type { ContentItem } from "@/lib/types";
import type { CmsAdapter } from "./adapters/types";
import { wordpressAdapter } from "./adapters/wordpress";
import { webflowAdapter } from "./adapters/webflow";
import { ghostAdapter } from "./adapters/ghost";

/**
 * Owned-site connector — the first channel we make excellent.
 *
 * The customer's own domain is the safest, highest-ROI AEO surface: it's
 * their property, so it can publish fully automatically, and it's where we
 * fully control HTML structure + JSON-LD schema, the things answer engines
 * parse.
 *
 * The connector dispatches to a per-CMS adapter chosen by `creds.cmsType`.
 */
const adapters: Record<string, CmsAdapter> = {
  wordpress: wordpressAdapter,
  webflow: webflowAdapter,
  ghost: ghostAdapter,
};

export const ownedSiteConnector: ChannelConnector = {
  kind: "owned_site",
  supportsAutoPublish: true,

  async publish(item: ContentItem, credentials): Promise<PublishResult> {
    const cmsType = credentials.cmsType;
    const adapter = cmsType ? adapters[cmsType] : undefined;
    if (!adapter) {
      return {
        ok: false,
        error: cmsType
          ? `Unsupported CMS: ${cmsType}`
          : "Owned-site channel is not connected (no cmsType set).",
      };
    }
    return adapter.publish(item, credentials);
  },
};
