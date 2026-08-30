import { PageHeader } from "@/components/page-header";
import { listWebsites } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { getWebsiteConfig } from "@/lib/websites/config-store";
import { AutopilotRulesForm } from "./rules-form";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const websites = await listWebsites(DEMO_WORKSPACE_ID);
  const website = websites[0] ?? null;

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
      <AutopilotRulesForm
        websiteId={website.id}
        rules={config.rules}
        protectedUrls={config.protectedUrls}
      />
    </>
  );
}
