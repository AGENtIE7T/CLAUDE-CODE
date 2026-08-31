/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Mock WordPress REST API — a realistic server for tests and demos.
 * ─────────────────────────────────────────────────────────────────────────
 *  Returns a `fetch`-compatible function so the REAL client (client.ts) can be
 *  exercised end-to-end without a network. The client does not know it is
 *  talking to a mock; only the connection wrapper marks itself `isMock`.
 *
 *  Every failure the product must survive can be injected:
 *    · auth failure          → 401 on every route
 *    · rate limiting         → 429 with Retry-After after N calls
 *    · timeout               → the request never settles (AbortSignal fires)
 *    · stale content         → `touch(id)` simulates a third-party edit
 *    · failed write          → 500 on update for chosen ids
 *    · verification failure  → update reports success but content never changes
 *
 *  It is deliberately strict about auth so a missing credential surfaces as
 *  `auth_failed` rather than silently returning fixture data.
 */

import { cloneFixtures, WP_ORIGIN, WP_SITE_NAME, type WpResource } from "./fixtures";

export interface WpFaults {
  /** Reject every request with 401. */
  auth?: boolean;
  /** Return 429 once this many requests have been served. */
  rateLimitAfter?: number;
  /** Never settle for paths containing this substring (tests use AbortSignal). */
  timeoutOn?: string;
  /** Updates to these ids return 500. */
  writeFailIds?: number[];
  /** Updates to these ids report success but leave content unchanged. */
  verifyFailIds?: number[];
}

export interface MockWordPress {
  /** Drop-in replacement for global fetch. */
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** Simulate someone else editing a page between preview and write. */
  touch: (id: number) => void;
  /** Current stored content, for assertions. */
  contentOf: (id: number) => string | null;
  versionOf: (id: number) => string | null;
  /** Restore a page to given HTML — used to prove rollback landed. */
  setContent: (id: number, html: string) => void;
  /** Every request path served, in order. */
  requests: string[];
  /** Mutable fault configuration. */
  faults: WpFaults;
  reset: () => void;
}

const BASE = `${WP_ORIGIN}/wp-json`;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Bump a timestamp by one second so versions strictly increase. */
function nextVersion(current: string): string {
  const t = Date.parse(current + "Z");
  const next = Number.isNaN(t) ? Date.now() : t + 1000;
  return new Date(next).toISOString().replace(/\.\d{3}Z$/, "");
}

export function createMockWordPress(faults: WpFaults = {}): MockWordPress {
  let store = cloneFixtures();
  const requests: string[] = [];
  const state: { faults: WpFaults; served: number } = { faults: { ...faults }, served: 0 };

  const byId = (id: number): WpResource | undefined => store.find((r) => r.id === id);

  const api: MockWordPress = {
    requests,
    faults: state.faults,

    touch(id) {
      const r = byId(id);
      if (r) r.modified_gmt = nextVersion(r.modified_gmt);
    },
    contentOf(id) {
      return byId(id)?.content.rendered ?? null;
    },
    versionOf(id) {
      return byId(id)?.modified_gmt ?? null;
    },
    setContent(id, html) {
      const r = byId(id);
      if (r) {
        r.content.rendered = html;
        r.modified_gmt = nextVersion(r.modified_gmt);
      }
    },
    reset() {
      store = cloneFixtures();
      requests.length = 0;
      state.served = 0;
    },

    async fetch(input, init) {
      const url = typeof input === "string" ? input : input.toString();
      const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
      requests.push(path);

      // Timeout: never settle. The caller's AbortSignal is what ends it.
      if (state.faults.timeoutOn && path.includes(state.faults.timeoutOn)) {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }
          // No signal → hangs forever, which is the honest simulation.
        });
      }

      // Auth is checked before anything else, on every route.
      const auth = new Headers(init?.headers).get("authorization");
      if (state.faults.auth || !auth || !/^Basic\s+\S+/i.test(auth)) {
        return json(
          { code: "rest_not_logged_in", message: "You are not currently logged in." },
          401,
        );
      }

      state.served += 1;
      if (
        state.faults.rateLimitAfter !== undefined &&
        state.served > state.faults.rateLimitAfter
      ) {
        return json({ code: "too_many_requests", message: "Rate limit exceeded." }, 429, {
          "retry-after": "2",
        });
      }

      // GET /wp-json  → discovery / connection verification
      if (path === "" || path === "/") {
        return json({
          name: WP_SITE_NAME,
          description: "Mock site",
          namespaces: ["wp/v2"],
        });
      }

      const collection = /^\/wp\/v2\/(posts|pages)(?:\?.*)?$/.exec(path);
      if (collection) {
        const type = collection[1] === "posts" ? "post" : "page";
        return json(store.filter((r) => r.type === type));
      }

      const single = /^\/wp\/v2\/(posts|pages)\/(\d+)$/.exec(path);
      if (single) {
        const id = Number(single[2]);
        const res = byId(id);
        if (!res) {
          return json({ code: "rest_post_invalid_id", message: "Invalid post ID." }, 404);
        }

        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET") return json(res);

        if (method === "POST" || method === "PUT" || method === "PATCH") {
          if (state.faults.writeFailIds?.includes(id)) {
            return json(
              { code: "rest_cannot_update", message: "Sorry, you are not allowed to edit this post." },
              500,
            );
          }
          let body: { content?: string } = {};
          try {
            body = init?.body ? (JSON.parse(String(init.body)) as { content?: string }) : {};
          } catch {
            return json({ code: "rest_invalid_json", message: "Invalid JSON body." }, 400);
          }

          // Verification failure: report success, change nothing. The execute
          // engine's post-write re-read is what must catch this.
          if (state.faults.verifyFailIds?.includes(id)) {
            return json({ ...res, modified_gmt: nextVersion(res.modified_gmt) });
          }

          if (typeof body.content === "string") {
            res.content.rendered = body.content;
            res.modified_gmt = nextVersion(res.modified_gmt);
          }
          return json(res);
        }
        return json({ code: "rest_no_route", message: "No route." }, 404);
      }

      return json({ code: "rest_no_route", message: "No route was found." }, 404);
    },
  };

  return api;
}
