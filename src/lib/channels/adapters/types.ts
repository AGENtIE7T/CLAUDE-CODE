import type { ContentItem } from "@/lib/types";
import type { PublishResult } from "../index";

/** A CMS adapter turns a content item into a live post on a specific platform. */
export interface CmsAdapter {
  id: "wordpress" | "webflow" | "ghost";
  publish(item: ContentItem, creds: Record<string, string>): Promise<PublishResult>;
}

/** Render the item body + JSON-LD into a single HTML string for CMSes that
 *  take raw HTML. The schema block is what AI crawlers parse. */
export function toHtml(item: ContentItem): string {
  const schema = item.schemaJsonLd
    ? `\n<script type="application/ld+json">${JSON.stringify(item.schemaJsonLd)}</script>`
    : "";
  return `${item.body}${schema}`;
}
