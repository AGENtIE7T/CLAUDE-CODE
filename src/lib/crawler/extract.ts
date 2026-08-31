/**
 * ─────────────────────────────────────────────────────────────────────────
 *  HTML extraction — turn a fetched page into structured SEO facts.
 * ─────────────────────────────────────────────────────────────────────────
 *  IMPORTANT: everything extracted here is UNTRUSTED website content. It is
 *  data, never instructions. Downstream code must never interpret extracted
 *  text (titles, alt text, link anchors, JSON-LD) as commands. See
 *  src/lib/injection for the isolation contract.
 *
 *  We use tolerant regex extraction rather than a full DOM parser to avoid a
 *  heavy dependency and to be robust to malformed markup. It is sufficient for
 *  SEO signal extraction; it is NOT an HTML sanitizer (that lives elsewhere).
 */

export interface ExtractedLink {
  href: string;
  anchor: string;
  rel: string | null;
  nofollow: boolean;
}

export interface ExtractedImage {
  src: string;
  alt: string | null;
}

export interface ExtractedPage {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  /** robots meta directives lowercased, e.g. ["noindex","nofollow"]. */
  robotsMeta: string[];
  indexable: boolean;
  h1: string[];
  headings: { level: number; text: string }[];
  links: ExtractedLink[];
  images: ExtractedImage[];
}

/** Strip tags and collapse whitespace to get visible text. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? "").trim();
}

/** Remove <script>/<style> blocks so their contents don't pollute extraction. */
function stripNonContent(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

export function extractPage(html: string): ExtractedPage {
  const clean = stripNonContent(html);

  const title = (() => {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean);
    return m ? textOf(m[1]) || null : null;
  })();

  // <meta> tags: description, robots, canonical (link).
  let metaDescription: string | null = null;
  const robotsMeta: string[] = [];
  const metaTags = clean.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const name = (attr(tag, "name") ?? "").toLowerCase();
    if (name === "description") metaDescription = attr(tag, "content");
    if (name === "robots") {
      (attr(tag, "content") ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((d) => robotsMeta.push(d));
    }
  }

  let canonical: string | null = null;
  const linkTags = clean.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if ((attr(tag, "rel") ?? "").toLowerCase() === "canonical") canonical = attr(tag, "href");
  }

  const indexable = !robotsMeta.includes("noindex") && !robotsMeta.includes("none");

  // Headings.
  const headings: { level: number; text: string }[] = [];
  const h1: string[] = [];
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(clean))) {
    const level = Number(hm[1]);
    const text = textOf(hm[2]);
    if (text) {
      headings.push({ level, text });
      if (level === 1) h1.push(text);
    }
  }

  // Links.
  const links: ExtractedLink[] = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(clean))) {
    const href = attr(`<a ${am[1]}>`, "href");
    if (!href) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const rel = attr(`<a ${am[1]}>`, "rel");
    links.push({
      href,
      anchor: textOf(am[2]),
      rel: rel ? rel.toLowerCase() : null,
      nofollow: (rel ?? "").toLowerCase().includes("nofollow"),
    });
  }

  // Images.
  const images: ExtractedImage[] = [];
  const imgTags = clean.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    const src = attr(tag, "src");
    if (!src) continue;
    images.push({ src, alt: attr(tag, "alt") });
  }

  return { title, metaDescription, canonical, robotsMeta, indexable, h1, headings, links, images };
}
