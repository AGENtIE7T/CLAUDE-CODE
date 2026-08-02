import type { CmsAdapter } from "./types";
import { toHtml } from "./types";

/**
 * WordPress REST API adapter.
 * creds: { endpoint: "https://site.com/wp-json/wp/v2", token: <app password b64> }
 * Auth uses an Application Password sent as a Basic token.
 */
export const wordpressAdapter: CmsAdapter = {
  id: "wordpress",
  async publish(item, creds) {
    const { endpoint, token } = creds;
    if (!endpoint || !token) return { ok: false, error: "WordPress not connected" };
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/posts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${token}`,
        },
        body: JSON.stringify({
          title: item.title,
          content: toHtml(item),
          status: "publish",
        }),
      });
      if (!res.ok) return { ok: false, error: `WordPress ${res.status}` };
      const data = (await res.json()) as { link?: string };
      return { ok: true, url: data.link };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "wordpress publish failed" };
    }
  },
};
