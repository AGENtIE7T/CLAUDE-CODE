import { PageHeader } from "@/components/page-header";
import { CapabilityCards } from "@/components/seo/status";
import { buildCapabilitySnapshot } from "@/lib/status/capabilities";
import { listWebsites } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { ConnectionTest } from "./connection-test";

export const dynamic = "force-dynamic";

export default async function ConnectionPage() {
  const websites = await listWebsites(DEMO_WORKSPACE_ID);
  const snapshot = buildCapabilitySnapshot({
    websiteCount: websites.length,
    websiteLabel: websites[0]?.name ?? null,
    websiteVerified: Boolean(websites[0]?.ownershipVerifiedAt),
  });

  return (
    <>
      <PageHeader
        eyebrow="SEO · Connection"
        title="What this system can actually do right now"
        lead="Every screen reads this page's answers before it offers you an action. If something here says it is off, no button anywhere will quietly do it anyway."
      />

      <div className="grid gap-6">
        <CapabilityCards snapshot={snapshot} />

        <ConnectionTest />

        <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
          <h3 className="mb-1 font-semibold">How credentials are handled</h3>
          <ul className="grid gap-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            <li>• Credentials live only in server-side environment variables. There is no field in this interface to type one into, by design.</li>
            <li>• They are never sent to the browser, never written to browser storage, never returned by an API response, and never written to the audit log.</li>
            <li>• Use a WordPress <strong>Application Password</strong>, not an account password. It is revocable from wp-admin at any time, which is the intended kill switch.</li>
            <li>• Anything that looks like a credential is stripped from error text before it can be displayed.</li>
          </ul>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
            Required: WORDPRESS_BASE_URL · WORDPRESS_USERNAME · WORDPRESS_APP_PASSWORD · WORDPRESS_ENVIRONMENT · WORDPRESS_ACCESS
          </p>
        </div>
      </div>
    </>
  );
}
