/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Mock CMS — a real, mutable page store for demo end-to-end execution.
 * ─────────────────────────────────────────────────────────────────────────
 *  This stands in for a live CMS (WordPress/Shopify/custom) so the FULL write
 *  loop — apply → verify → rollback — actually runs in demo mode against real,
 *  changing content. It is deliberately the same shape as a CMS adapter:
 *
 *    getPage(url)          read current HTML (what verification re-reads)
 *    writePage(url, html)  persist new HTML (the "post"/insert step)
 *
 *  In production these two calls are replaced by an authenticated CMS adapter,
 *  gated by SEO_ENABLE_PRODUCTION_WRITES. Nothing here touches the network.
 */

export interface CmsPage {
  url: string;
  html: string;
  /** Bumped on every successful write — lets tests assert a real mutation. */
  revision: number;
  updatedAt: string;
}

export interface CmsStore {
  getPage(url: string): Promise<CmsPage | null>;
  writePage(url: string, html: string): Promise<CmsPage>;
  listUrls(): Promise<string[]>;
}

/** A seedable in-memory CMS. */
export function createMockCms(seed: Record<string, string> = {}): CmsStore {
  const pages = new Map<string, CmsPage>();
  const now = () => new Date().toISOString();
  for (const [url, html] of Object.entries(seed)) {
    pages.set(url, { url, html, revision: 1, updatedAt: now() });
  }
  return {
    async getPage(url) {
      return pages.get(url) ?? null;
    },
    async writePage(url, html) {
      const prev = pages.get(url);
      const next: CmsPage = {
        url,
        html,
        revision: (prev?.revision ?? 0) + 1,
        updatedAt: now(),
      };
      pages.set(url, next);
      return next;
    },
    async listUrls() {
      return [...pages.keys()];
    },
  };
}
