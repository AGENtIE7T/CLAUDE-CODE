/**
 * Transport safety for the WordPress adapter.
 *
 * The credential this client carries is an Application Password sent on every
 * request. These tests exist to make sure it can only ever travel over TLS —
 * checked before the first byte leaves the process, and re-checked at every
 * redirect hop.
 */
import { describe, it, expect } from "vitest";
import {
  createWordPressConnection,
  normalizeWordPressBaseUrl,
  HTTPS_REQUIRED,
} from "./client";
import { CmsError } from "@/lib/cms/adapter";

const TOKEN = "dXNlcjphcHAtcGFzc3dvcmQ=";

/** A fetch stub that records every URL it is asked for. */
function stub(handler: (url: string, init: RequestInit) => Response) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push(String(input));
    return handler(String(input), init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function redirect(to: string, status = 301) {
  return new Response(null, { status, headers: { location: to } });
}

function conn(baseUrl: string, fetchImpl: typeof fetch) {
  return createWordPressConnection({
    baseUrl,
    token: TOKEN,
    environment: "staging",
    label: "test",
    access: "read_write",
    isMock: false,
    fetchImpl,
    timeoutMs: 200,
  });
}

describe("base URL validation", () => {
  it("accepts an HTTPS site URL and normalises the trailing slash", () => {
    expect(normalizeWordPressBaseUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeWordPressBaseUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeWordPressBaseUrl("https://example.com///")).toBe("https://example.com");
    expect(normalizeWordPressBaseUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("keeps a subdirectory install's path", () => {
    expect(normalizeWordPressBaseUrl("https://example.com/blog/")).toBe("https://example.com/blog");
  });

  it("drops a query string and fragment rather than carrying them into every call", () => {
    expect(normalizeWordPressBaseUrl("https://example.com/?utm=x#top")).toBe("https://example.com");
  });

  it("rejects http:// before any network access", () => {
    expect(() => normalizeWordPressBaseUrl("http://example.com")).toThrowError(HTTPS_REQUIRED);
    try {
      normalizeWordPressBaseUrl("http://example.com");
    } catch (e) {
      expect((e as CmsError).code).toBe("unsupported");
      expect((e as CmsError).retryable).toBe(false);
      expect((e as CmsError).message).toMatch(/sent in the clear/);
    }
  });

  it("rejects a URL with no protocol", () => {
    expect(() => normalizeWordPressBaseUrl("example.com")).toThrowError(HTTPS_REQUIRED);
    expect(() => normalizeWordPressBaseUrl("//example.com")).toThrowError(HTTPS_REQUIRED);
  });

  it("rejects a malformed URL", () => {
    expect(() => normalizeWordPressBaseUrl("https://")).toThrowError(HTTPS_REQUIRED);
    expect(() => normalizeWordPressBaseUrl("https:// not a url")).toThrowError(HTTPS_REQUIRED);
  });

  it("rejects an empty or missing value", () => {
    expect(() => normalizeWordPressBaseUrl("")).toThrowError(HTTPS_REQUIRED);
    expect(() => normalizeWordPressBaseUrl(undefined)).toThrowError(HTTPS_REQUIRED);
    expect(() => normalizeWordPressBaseUrl(null)).toThrowError(HTTPS_REQUIRED);
  });

  it("rejects other schemes", () => {
    expect(() => normalizeWordPressBaseUrl("ftp://example.com")).toThrowError(HTTPS_REQUIRED);
    expect(() => normalizeWordPressBaseUrl("file:///etc/passwd")).toThrowError(HTTPS_REQUIRED);
  });

  it("rejects credentials embedded in the URL", () => {
    expect(() => normalizeWordPressBaseUrl("https://user:pass@example.com")).toThrowError(
      /Credentials embedded/,
    );
  });

  it("rejects a base URL that already ends in /wp-json, and says why", () => {
    expect(() => normalizeWordPressBaseUrl("https://example.com/wp-json")).toThrowError(
      /must be the site root/,
    );
    expect(() => normalizeWordPressBaseUrl("https://example.com/wp-json/")).toThrowError(
      /must be the site root/,
    );
  });

  it("still allows a path that merely contains the words", () => {
    expect(normalizeWordPressBaseUrl("https://example.com/wp-json-docs")).toBe(
      "https://example.com/wp-json-docs",
    );
  });
});

describe("the connection refuses to exist over plain HTTP", () => {
  it("throws at construction, so no request is ever attempted", () => {
    const { impl, calls } = stub(() => new Response("{}"));
    expect(() => conn("http://example.com", impl)).toThrowError(HTTPS_REQUIRED);
    expect(calls).toHaveLength(0);
  });

  it("appends /wp-json to a valid base exactly once", async () => {
    const { impl, calls } = stub(() => new Response(JSON.stringify({ name: "S", namespaces: ["wp/v2"] })));
    await conn("https://example.com/", impl).verify();
    expect(calls[0]).toBe("https://example.com/wp-json");
  });
});

describe("redirect handling", () => {
  it("follows an HTTPS→HTTPS redirect and uses the final response", async () => {
    const { impl, calls } = stub((url) =>
      url === "https://example.com/wp-json"
        ? redirect("https://www.example.com/wp-json")
        : new Response(JSON.stringify({ name: "Moved Site", namespaces: ["wp/v2"] })),
    );
    const v = await conn("https://example.com", impl).verify();
    expect(v.ok).toBe(true);
    expect(v.siteName).toBe("Moved Site");
    expect(calls).toEqual(["https://example.com/wp-json", "https://www.example.com/wp-json"]);
  });

  it("resolves a relative Location against the current URL", async () => {
    const { impl, calls } = stub((url) =>
      url.endsWith("/wp-json")
        ? redirect("/wp-json/")
        : new Response(JSON.stringify({ name: "S", namespaces: ["wp/v2"] })),
    );
    await conn("https://example.com", impl).verify();
    expect(calls[1]).toBe("https://example.com/wp-json/");
  });

  it("refuses an HTTPS→HTTP downgrade instead of following it", async () => {
    const { impl, calls } = stub(() => redirect("http://example.com/wp-json"));
    const v = await conn("https://example.com", impl).verify();
    expect(v.ok).toBe(false);
    expect(v.error?.code).toBe("unsupported");
    expect(v.error?.message).toContain(HTTPS_REQUIRED);
    expect(v.error?.message).toMatch(/downgrade/);
    // It stopped at the first hop — the insecure URL was never requested.
    expect(calls).toEqual(["https://example.com/wp-json"]);
  });

  it("never re-sends a write to a redirected location", async () => {
    let posted = 0;
    const { impl } = stub((url, init) => {
      if ((init.method ?? "GET").toUpperCase() === "POST") {
        posted++;
        return redirect("https://example.com/wp-json/wp/v2/posts/99", 307);
      }
      return new Response(
        JSON.stringify({
          id: 10,
          slug: "a",
          link: "https://example.com/a",
          type: "post",
          status: "publish",
          title: { rendered: "A" },
          content: { rendered: "<p>a</p>" },
          modified_gmt: "2026-01-01T00:00:00",
        }),
      );
    });
    await expect(conn("https://example.com", impl).update(10, "<p>b</p>")).rejects.toMatchObject({
      code: "write_failed",
      retryable: false,
    });
    expect(posted).toBe(1); // attempted once, never repeated elsewhere
  });

  it("gives up rather than looping on a redirect cycle", async () => {
    const { impl, calls } = stub((url) =>
      redirect(url.endsWith("/a") ? "https://example.com/wp-json/b" : "https://example.com/wp-json/a"),
    );
    const v = await conn("https://example.com", impl).verify();
    expect(v.ok).toBe(false);
    expect(v.error?.message).toMatch(/redirected more than/);
    expect(calls.length).toBeLessThanOrEqual(7);
  });

  it("treats a 3xx with no Location as an ordinary response", async () => {
    const { impl } = stub(() => new Response(null, { status: 304 }));
    const v = await conn("https://example.com", impl).verify();
    expect(v.ok).toBe(false); // 304 has no body to parse; reported, not followed
  });

  it("never leaks the token into a redirect refusal", async () => {
    const { impl } = stub(() => redirect(`http://evil.example/?stolen=${TOKEN}`));
    const v = await conn("https://example.com", impl).verify();
    expect(JSON.stringify(v)).not.toContain(TOKEN);
  });
});
