import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listWebsites } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { getWebsiteConfig } from "@/lib/websites/config-store";
import { AutopilotRulesForm } from "./rules-form";

export const dynamic = "force-dynamic";

export default async function AutopilotPage({
  searchParams,
}: {
  searchParams?: { website?: string };
}) {
  const websites = await listWebsites(DEMO_WORKSPACE_ID);
  // Rules are per-website, so which one is being edited must be explicit the
  // moment there is more than one. `?website=` keeps that in the URL, so a
  // saved-settings redirect returns to the same site rather than the first.
  const website =
    (searchParams?.website ? websites.find((w) => w.id === searchParams.website) : undefined) ??
    websites[0] ??
    null;

  if (!website) {
    return (
      <>
        <PageHeader
          eyebrow="SEO · Autopilot"
          title="Autopilot rules"
          lead="Autopilot rules are configured per website."
        />
        <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            No website has been added yet, so there is nothing to configure. Add
            one on the Websites screen first.
          </p>
        </div>
      </>
    );
  }

  const config = getWebsiteConfig(website.id);

  return (
    <>
      <PageHeader
        eyebrow="SEO · Autopilot"
        title={`Rules for ${website.name}`}
        lead="These rules decide whether a batch of internal-link changes may be applied without you clicking approve on each one. They can only narrow what happens — nothing here can grant a permission the system does not already have."
      />
      {websites.length > 1 && (
        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Choose a website">
          {websites.map((w) => {
            const active = w.id === website.id;
            return (
              <Link
                key={w.id}
                href={`/autopilot?website=${encodeURIComponent(w.id)}`}
                className="rounded-full border px-3 py-1 text-xs"
                style={{
                  borderColor: active ? "var(--teal)" : "var(--line)",
                  color: active ? "var(--teal)" : "var(--ink-soft)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {w.name}
              </Link>
            );
          })}
        </nav>
      )}

      <AutopilotRulesForm
        key={website.id}
        websiteId={website.id}
        rules={config.rules}
        protectedUrls={config.protectedUrls}
      />
    </>
  );
}
