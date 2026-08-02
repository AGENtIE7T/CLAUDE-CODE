import type { ChannelConnector, PublishResult } from "./index";
import type { ContentItem } from "@/lib/types";

/**
 * Owned-site connector — the first channel we make excellent.
 *
 * The customer's own domain is the safest, highest-ROI AEO surface: it's
 * their property, so it can publish fully automatically, and it's where we
 * fully control HTML structure + JSON-LD schema, the things answer engines
 * parse.
 *
 * This stub targets a headless CMS (WordPress REST / Webflow / Ghost).
 * Swap `publish` for the real API call once the customer connects a site.
 */
export const ownedSiteConnector: ChannelConnector = {
  kind: "owned_site",
  supportsAutoPublish: true,

  async publish(item: ContentItem, credentials): Promise<PublishResult> {
    const { cmsType, endpoint, token } = credentials;
    if (!endpoint || !token) {
      return { ok: false, error: "Owned-site channel is not fully connected." };
    }

    // The engine always ships server-rendered HTML + JSON-LD so AI crawlers
    // (many of which don't execute JS) can extract the answer.
    const payload = {
      title: item.title,
      content: item.body,
      schema: item.schemaJsonLd,
      status: "publish",
    };

    try {
      // TODO: replace with per-CMS adapter (WordPress REST, Webflow CMS API, Ghost Admin API).
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: `${cmsType} responded ${res.status}` };
      const data = (await res.json()) as { url?: string; link?: string };
      return { ok: true, url: data.url ?? data.link };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "publish failed" };
    }
  },
};
