import { describe, it, expect } from "vitest";
import {
  buildCapabilitySnapshot,
  card,
  usingMockWordPress,
  WORDPRESS_CONNECTION_REQUIRED,
  type CapabilityEnv,
} from "./capabilities";

const NOTHING: CapabilityEnv = { demo: false };

const CONNECTED: CapabilityEnv = {
  demo: false,
  wordpressBaseUrl: "https://staging.example.com",
  wordpressUsername: "set",
  wordpressAppPassword: "set",
  wordpressAccess: "read_write",
};

describe("capability snapshot", () => {
  it("says a connection is required when nothing is configured", () => {
    const s = buildCapabilitySnapshot({ env: NOTHING, websiteCount: 1 });
    expect(card(s, "wordpress").value).toBe("Not connected");
    expect(card(s, "wordpress").detail).toBe(WORDPRESS_CONNECTION_REQUIRED);
    expect(s.canWrite).toBe(false);
    expect(s.writeBlockedMessage).toBe(WORDPRESS_CONNECTION_REQUIRED);
    // Recommendations never need a connection.
    expect(s.canRecommend).toBe(true);
  });

  it("distinguishes read-only from read/write", () => {
    const ro = buildCapabilitySnapshot({
      env: { ...CONNECTED, wordpressAccess: "read_only" },
      websiteCount: 1,
    });
    expect(card(ro, "access").value).toBe("Read-only");
    expect(ro.canWrite).toBe(false);
    expect(ro.writeBlockedMessage).toMatch(/read-only/);

    const rw = buildCapabilitySnapshot({ env: CONNECTED, websiteCount: 1 });
    expect(card(rw, "access").value).toBe("Read / write");
    expect(rw.canWrite).toBe(true);
    expect(rw.writeBlockedMessage).toBeNull();
  });

  it("never claims a configured connection is verified", () => {
    const s = buildCapabilitySnapshot({ env: CONNECTED, websiteCount: 1 });
    expect(card(s, "wordpress").value).toBe("Configured");
    expect(card(s, "wordpress").detail).toMatch(/not the same as reachable/);
  });

  it("labels a mock connection as a mock", () => {
    const s = buildCapabilitySnapshot({
      env: { ...NOTHING, useMockWordPress: true },
      websiteCount: 1,
    });
    expect(card(s, "wordpress").value).toBe("Mock (fixture)");
    expect(card(s, "wordpress").detail).toMatch(/not a real site/);
    expect(usingMockWordPress({ useMockWordPress: true })).toBe(true);
  });

  it("reports Semrush as not connected without inventing figures", () => {
    const off = buildCapabilitySnapshot({ env: NOTHING, websiteCount: 1 });
    expect(card(off, "semrush").value).toBe("Not connected");
    expect(card(off, "semrush").detail).toMatch(/does not need one/);

    const on = buildCapabilitySnapshot({
      env: { ...NOTHING, semrushApiKey: "set" },
      websiteCount: 1,
    });
    expect(card(on, "semrush").value).toBe("Connected");
  });

  it("shows production writes as disabled unless the flag is exactly 1", () => {
    expect(card(buildCapabilitySnapshot({ env: NOTHING }), "production_writes").value).toBe("Disabled");
    expect(
      card(buildCapabilitySnapshot({ env: { ...NOTHING, productionWrites: "true" } }), "production_writes")
        .value,
    ).toBe("Disabled");
    expect(
      card(buildCapabilitySnapshot({ env: { ...NOTHING, productionWrites: "1" } }), "production_writes")
        .value,
    ).toBe("ENABLED");
  });

  it("reports live crawling separately from CMS reads", () => {
    const s = buildCapabilitySnapshot({ env: CONNECTED, websiteCount: 1 });
    expect(card(s, "live_crawl").value).toBe("CMS reads only");
    const live = buildCapabilitySnapshot({ env: { ...CONNECTED, liveCrawl: "1" }, websiteCount: 1 });
    expect(card(live, "live_crawl").value).toBe("Enabled");
  });

  it("shows Autopilot as disabled by default", () => {
    expect(card(buildCapabilitySnapshot({ env: NOTHING }), "autopilot").value).toBe(
      "Disabled by default",
    );
  });

  it("blocks writes for an unverified website by naming it, not by hiding it", () => {
    const s = buildCapabilitySnapshot({ env: CONNECTED, websiteCount: 1, websiteVerified: false });
    expect(card(s, "website").status).toBe("limited");
    expect(card(s, "website").remedy).toMatch(/Verify ownership/);
  });

  it("never leaks a credential value into the snapshot", () => {
    const s = buildCapabilitySnapshot({
      env: { ...CONNECTED, wordpressAppPassword: "set", semrushApiKey: "set" },
      websiteCount: 1,
    });
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/password.*[A-Za-z0-9]{16}/);
    expect(json).toContain("staging.example.com"); // the URL is not a secret
  });
});
