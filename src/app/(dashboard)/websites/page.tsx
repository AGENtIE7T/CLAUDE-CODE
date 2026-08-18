import { PageHeader } from "@/components/page-header";
import { listWebsites } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { AddWebsiteForm } from "./add-website-form";

export default async function WebsitesPage() {
  const websites = await listWebsites(DEMO_WORKSPACE_ID);

  return (
    <>
      <PageHeader
        eyebrow="SEO · Websites"
        title="Your connected websites"
        lead="Add a site, verify ownership, and set crawl scope. New sites start UNVERIFIED — crawling and any write task stay blocked until ownership is confirmed."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4">
          {websites.length === 0 && (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              No websites yet. Add your first one →
            </p>
          )}
          {websites.map((w) => {
            const verified = Boolean(w.ownershipVerifiedAt);
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
              </div>
            );
          })}
        </div>

        <AddWebsiteForm />
      </div>
    </>
  );
}
