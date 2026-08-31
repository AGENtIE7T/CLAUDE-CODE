import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CapabilityCards, StatusChip } from "@/components/seo/status";
import { listWebsites } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { buildCapabilitySnapshot } from "@/lib/status/capabilities";
import { getWebsiteConfig } from "@/lib/websites/config-store";
import { AddWebsiteForm } from "./add-website-form";
import { VerifyViaCmsButton } from "./verify-button";

export const dynamic = "force-dynamic";

export default async function WebsitesPage() {
  const websites = await listWebsites(DEMO_WORKSPACE_ID);
  const snapshot = buildCapabilitySnapshot({
    websiteCount: websites.length,
    websiteLabel: websites.length === 1 ? websites[0].name : null,
    // "Verified" only when EVERY registered site is — one unverified site is
    // still a site the system must not write to.
    websiteVerified: websites.length > 0 && websites.every((w) => w.ownershipVerifiedAt),
  });

  return (
    <>
      <PageHeader
        eyebrow="SEO · Websites"
        title="Your connected websites"
        lead="Add a site, verify ownership, and set crawl scope. New sites start UNVERIFIED — crawling and any write task stay blocked until ownership is confirmed."
      />

      <div className="mb-8">
        <CapabilityCards snapshot={snapshot} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4">
          {websites.length === 0 && (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              No websites yet. Add your first one →
            </p>
          )}
          {websites.map((w) => {
            const verified = Boolean(w.ownershipVerifiedAt);
            const config = getWebsiteConfig(w.id);
            return (
              <div
                key={w.id}
                className="rounded-xl border p-5"
                style={{ borderColor: "var(--line)", background: "var(--card)" }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-semibold">{w.name}</h3>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      background: verified ? "var(--good, #2f855a)" : "transparent",
                      color: verified ? "#fff" : "var(--ink-faint)",
                      border: verified ? "none" : "1px solid var(--line)",
                    }}
                  >
                    {verified ? "verified" : "unverified"}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{w.url}</p>
                <p className="mt-2 text-xs"
                  style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                  {w.canonicalDomain} · {w.cmsType} · {w.environment}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusChip status={config.protectedUrls.length ? "ok" : "off"}>
                    {config.protectedUrls.length
                      ? `${config.protectedUrls.length} protected URL(s)`
                      : "No protected URLs"}
                  </StatusChip>
                  <StatusChip status={config.rules.enabled ? "limited" : "off"}>
                    Autopilot {config.rules.enabled ? "on" : "off"}
                  </StatusChip>
                </div>
                {config.protectedUrls.length > 0 && (
                  <ul className="mt-2 text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                    {config.protectedUrls.slice(0, 6).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                    {config.protectedUrls.length > 6 && <li>+{config.protectedUrls.length - 6} more</li>}
                  </ul>
                )}
                <VerifyViaCmsButton websiteId={w.id} verified={verified} />

                <p className="mt-3 text-xs">
                  <Link href="/autopilot" style={{ color: "var(--teal)" }}>
                    Configure protected URLs and Autopilot rules →
                  </Link>
                </p>
              </div>
            );
          })}
        </div>

        <AddWebsiteForm />
      </div>
    </>
  );
}
