import type { CmsAdapter } from "./types";
import { toHtml } from "./types";

/**
 * Ghost Admin API adapter.
 * creds: { endpoint: "https://site.com", token: <admin JWT> }
 * Ghost takes HTML via the `html` source flag.
 */
export const ghostAdapter: CmsAdapter = {
  id: "ghost",
  async publish(item, creds) {
    const { endpoint, token } = creds;
    if (!endpoint || !token) return { ok: false, error: "Ghost not connected" };
    try {
      const url = `${endpoint.replace(/\/$/, "")}/ghost/api/admin/posts/?source=html`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Ghost ${token}`,
        },
        body: JSON.stringify({
          posts: [{ title: item.title, html: toHtml(item), status: "published" }],
        }),
      });
      if (!res.ok) return { ok: false, error: `Ghost ${res.status}` };
      const data = (await res.json()) as { posts?: { url?: string }[] };
      return { ok: true, url: data.posts?.[0]?.url };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "ghost publish failed" };
    }
  },
};
