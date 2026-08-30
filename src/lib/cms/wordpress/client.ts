/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WordPress REST connection — the real client.
 * ─────────────────────────────────────────────────────────────────────────
 *  This is production code. Tests exercise it by injecting the mock server as
 *  `fetchImpl`; nothing here is aware of the mock. Only the caller decides
 *  `isMock`, and `assertUsable()` refuses a mock against production.
 *
 *  Concurrency. WordPress has no If-Match, so `update()` implements optimistic
 *  concurrency explicitly: it re-reads the resource and compares the server's
 *  `modified_gmt` against the version the caller believed it was editing. A
 *  mismatch is `stale_content` and the write does NOT happen — which is what
 *  makes "someone edited the page after the preview" safe.
 *
 *  Credentials. The Application Password token is held in a closure, never
 *  logged, never included in an error, and never returned by any method.
 *  `redact()` is applied to anything derived from a response body.
 *
 *  Transport. The site URL must be HTTPS, and that is checked here rather than
 *  left to whoever set the environment variable — an Application Password sent
 *  over plain HTTP is a credential handed to anyone on the path. The check runs
 *  at construction, before a single byte leaves the process. Redirects are
 *  followed manually for the same reason: an HTTPS→HTTP redirect would
 *  downgrade the very request carrying the credential, so it is refused, and a
 *  redirect on a write is refused outright rather than re-sending the body to
 *  wherever the server pointed.
 */

import {
  CmsError,
  READ_ONLY_CAPABILITIES,
  READ_WRITE_CAPABILITIES,
  type CmsCapabilities,
  type CmsConnection,
  type CmsContent,
  type CmsContentRef,
  type CmsEnvironment,
  type UpdateOptions,
  type UpdateResult,
  type VerifyResult,
} from "@/lib/cms/adapter";

export interface WordPressConfig {
  /** Site root, e.g. https://example.com (no /wp-json). */
  baseUrl: string;
  /**
   * Base64 "user:application-password". Server-side only. Never rendered,
   * never logged, never returned through an API response.
   */
  token: string;
  environment: CmsEnvironment;
  label: string;
  access?: "read_only" | "read_write";
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** TRUE only when backed by the fixture server. */
  isMock?: boolean;
}

/** Statuses that carry a Location we must vet before following. */
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

interface WpResourceJson {
  id: number;
  slug: string;
  link: string;
  type?: string;
  status: CmsContent["status"];
  title?: { rendered?: string };
  content?: { rendered?: string };
  modified_gmt: string;
  meta?: { _yoast_wpseo_meta_robots_noindex?: string };
}

/** The one sentence every URL rejection leads with, so it is recognisable. */
export const HTTPS_REQUIRED = "WordPress connection requires an HTTPS site URL.";

/**
 * Validate and normalise the configured site root.
 *
 * Returns the canonical base (scheme + host + optional subdirectory, no
 * trailing slash) or throws a non-retryable CmsError. Everything it rejects is
 * a configuration mistake, so retrying would just repeat it.
 */
export function normalizeWordPressBaseUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  const reject = (why: string): never => {
    throw new CmsError("unsupported", `${HTTPS_REQUIRED} ${why}`, { retryable: false });
  };

  if (!trimmed) reject("No site URL is configured (WORDPRESS_BASE_URL is empty).");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    reject(`"${trimmed}" has no protocol — write it as https://example.com.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return reject(`"${trimmed}" is not a valid URL.`);
  }

  if (url.protocol !== "https:") {
    reject(`"${url.protocol}//" is not allowed; the credential would be sent in the clear.`);
  }
  // user:pass@host would put a credential in every log line that echoes the URL.
  if (url.username || url.password) {
    reject("Credentials embedded in the URL are not allowed.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (/\/wp-json$/i.test(path)) {
    throw new CmsError(
      "unsupported",
      "WORDPRESS_BASE_URL must be the site root, not the /wp-json endpoint — the adapter appends /wp-json itself.",
      { retryable: false },
    );
  }

  // Query and fragment are meaningless on a site root; drop them rather than
  // silently carrying them into every API call.
  return url.origin + path;
}

/** Strip anything that looks like a credential from a string. */
function redact(s: string): string {
  return s
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .replace(/([?&](?:token|key|password|secret)=)[^&\s]+/gi, "$1[redacted]");
}

function toContent(r: WpResourceJson): CmsContent {
  const title = r.title?.rendered?.trim() ?? "";
  return {
    id: r.id,
    url: r.link,
    type: r.type === "page" ? "page" : "post",
    title: title.length ? title : null,
    html: r.content?.rendered ?? "",
    version: r.modified_gmt,
    modifiedAt: r.modified_gmt,
    status: r.status,
    noindex: r.meta?._yoast_wpseo_meta_robots_noindex === "1",
  };
}

export function createWordPressConnection(cfg: WordPressConfig): CmsConnection {
  // Throws before anything can be sent if the site URL is not HTTPS.
  const base = normalizeWordPressBaseUrl(cfg.baseUrl) + "/wp-json";
  const doFetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 15_000;
  const capabilities: CmsCapabilities =
    cfg.access === "read_only" ? READ_ONLY_CAPABILITIES : READ_WRITE_CAPABILITIES;

  /**
   * Follow redirects ourselves so each hop can be checked.
   *
   * A GET may be redirected up to `MAX_REDIRECTS` times, and every destination
   * must be HTTPS. A non-GET is never followed: re-sending a write body to
   * whatever location the server named is how an edit ends up on the wrong
   * resource, so a redirected write is an error instead.
   */
  async function send(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await doFetch(current, { ...init, signal, redirect: "manual" });
      if (!REDIRECT_STATUS.has(res.status)) return res;

      const location = res.headers.get("location");
      if (!location) return res; // a 3xx with no target is just a response

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new CmsError("network", "WordPress sent a redirect to an unreadable location.", {
          retryable: false,
        });
      }
      if (next.protocol !== "https:") {
        throw new CmsError(
          "unsupported",
          `${HTTPS_REQUIRED} A redirect tried to downgrade the request to ${next.protocol}//.`,
          { retryable: false },
        );
      }
      if (method !== "GET") {
        throw new CmsError(
          "write_failed",
          "WordPress redirected a write request; refusing to re-send it to a different location.",
          { retryable: false },
        );
      }
      current = next.toString();
    }
    throw new CmsError("network", `WordPress redirected more than ${MAX_REDIRECTS} times.`, {
      retryable: false,
    });
  }

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await send(
        `${base}${path}`,
        {
          ...init,
          headers: {
            "content-type": "application/json",
            // The one place the token is used. It never leaves this closure.
            authorization: `Basic ${cfg.token}`,
            ...(init.headers ?? {}),
          },
        },
        controller.signal,
      );
    } catch (e) {
      clearTimeout(timer);
      // A refusal we raised ourselves (bad redirect) is already the right
      // answer; only genuine transport failures get re-classified.
      if (e instanceof CmsError) throw e;
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") {
        throw new CmsError("timeout", `WordPress did not respond within ${timeoutMs}ms.`);
      }
      throw new CmsError("network", redact(e instanceof Error ? e.message : "network failure"));
    }
    clearTimeout(timer);

    if (res.status === 401) {
      throw new CmsError("auth_failed", "WordPress rejected the credentials.", {
        retryable: false,
      });
    }
    if (res.status === 403) {
      throw new CmsError("forbidden", "This WordPress user may not perform that action.", {
        retryable: false,
      });
    }
    if (res.status === 404) {
      throw new CmsError("not_found", "That WordPress resource does not exist.", {
        retryable: false,
      });
    }
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after") ?? "2");
      throw new CmsError("rate_limited", "WordPress is rate limiting requests.", {
        retryAfterMs: Math.max(1, after) * 1000,
      });
    }
    if (!res.ok) {
      throw new CmsError("write_failed", `WordPress returned HTTP ${res.status}.`);
    }
    try {
      return await res.json();
    } catch {
      throw new CmsError("network", "WordPress returned a malformed response.");
    }
  }

  async function fetchOne(id: number | string): Promise<CmsContent> {
    // A caller holding only an id does not know whether it is a post or a page.
    try {
      return toContent((await call(`/wp/v2/posts/${id}`)) as WpResourceJson);
    } catch (e) {
      if (e instanceof CmsError && e.code === "not_found") {
        return toContent((await call(`/wp/v2/pages/${id}`)) as WpResourceJson);
      }
      throw e;
    }
  }

  return {
    kind: "wordpress",
    environment: cfg.environment,
    isMock: cfg.isMock === true,
    capabilities,
    label: cfg.label,

    async verify(): Promise<VerifyResult> {
      const checkedAt = new Date().toISOString();
      try {
        const root = (await call("")) as { name?: string; namespaces?: string[] };
        if (!root.namespaces?.includes("wp/v2")) {
          return {
            ok: false,
            capabilities,
            checkedAt,
            error: { code: "unsupported", message: "The REST API v2 namespace is not exposed." },
          };
        }
        return { ok: true, siteName: root.name, capabilities, checkedAt };
      } catch (e) {
        const err = e instanceof CmsError ? e : new CmsError("network", "Verification failed.");
        return {
          ok: false,
          capabilities,
          checkedAt,
          error: { code: err.code, message: redact(err.message) },
        };
      }
    },

    async list(): Promise<CmsContentRef[]> {
      const [posts, pages] = await Promise.all([
        call("/wp/v2/posts?per_page=100") as Promise<WpResourceJson[]>,
        call("/wp/v2/pages?per_page=100") as Promise<WpResourceJson[]>,
      ]);
      return [...posts, ...pages].map((r) => {
        const c = toContent(r);
        return { id: c.id, url: c.url, type: c.type, title: c.title, modifiedAt: c.modifiedAt };
      });
    },

    get: fetchOne,

    async getByUrl(url: string): Promise<CmsContent> {
      const refs = await this.list();
      const hit = refs.find((r) => r.url === url || r.url.replace(/\/$/, "") === url.replace(/\/$/, ""));
      if (!hit) throw new CmsError("not_found", `No WordPress content at ${url}.`, { retryable: false });
      return fetchOne(hit.id);
    },

    async update(
      id: number | string,
      html: string,
      opts: UpdateOptions = {},
    ): Promise<UpdateResult> {
      if (!capabilities.write) {
        throw new CmsError("read_only", `Connection "${cfg.label}" is read-only.`, {
          retryable: false,
        });
      }

      // Optimistic concurrency: the page must still be the version the caller
      // previewed. This is what makes a stale preview un-writable.
      const current = await fetchOne(id);
      if (opts.expectedVersion !== undefined && current.version !== opts.expectedVersion) {
        throw new CmsError(
          "stale_content",
          `Content changed since the preview (expected ${opts.expectedVersion}, found ${current.version}).`,
          { retryable: false },
        );
      }

      if (opts.dryRun) {
        return { ok: true, id: current.id, url: current.url, html: current.html, version: current.version };
      }

      const path = current.type === "page" ? `/wp/v2/pages/${id}` : `/wp/v2/posts/${id}`;
      const updated = toContent(
        (await call(path, { method: "POST", body: JSON.stringify({ content: html }) })) as WpResourceJson,
      );
      return { ok: true, id: updated.id, url: updated.url, html: updated.html, version: updated.version };
    },
  };
}
