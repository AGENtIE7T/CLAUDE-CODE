import type { CmsAdapter } from "./types";
import { toHtml } from "./types";

/**
 * Webflow CMS API (v2) adapter.
 * creds: { collectionId, token, slugField?, bodyField?, nameField? }
 * Webflow writes into a CMS collection; field slugs are configurable per site.
 */
export const webflowAdapter: CmsAdapter = {
  id: "webflow",
  async publish(item, creds) {
    const { collectionId, token } = creds;
    if (!collectionId || !token) return { ok: false, error: "Webflow not connected" };
    const nameField = creds.nameField ?? "name";
    const bodyField = creds.bodyField ?? "post-body";
    try {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items/live`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fieldData: {
              [nameField]: item.title,
              [bodyField]: toHtml(item),
            },
          }),
        },
      );
      if (!res.ok) return { ok: false, error: `Webflow ${res.status}` };
      const data = (await res.json()) as { id?: string };
      return { ok: true, url: data.id ? `webflow:item:${data.id}` : undefined };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "webflow publish failed" };
    }
  },
};
