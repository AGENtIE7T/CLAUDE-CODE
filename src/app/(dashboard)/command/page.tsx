import { PageHeader } from "@/components/page-header";
import { buildCapabilitySnapshot } from "@/lib/status/capabilities";
import { listWebsites } from "@/lib/websites/service";
import { DEMO_WORKSPACE_ID } from "@/lib/rbac/resolve";
import { CommandCenter } from "./command-center";
import { AutopilotPanel } from "./autopilot-panel";

export const dynamic = "force-dynamic";

export default async function CommandPage() {
  const websites = await listWebsites(DEMO_WORKSPACE_ID);
  const snapshot = buildCapabilitySnapshot({
    websiteCount: websites.length,
    websiteLabel: websites.length === 1 ? websites[0].name : null,
    websiteVerified: websites.length > 0 && websites.every((w) => w.ownershipVerifiedAt),
  });

  return (
    <>
      <PageHeader
        eyebrow="SEO · Command"
        title="Type an instruction. Watch exactly what it does."
        lead="Plain English becomes a structured plan, the plan runs under your rules, and every step is shown with what actually happened. Audit is the default. Nothing is written without an approval bound to the exact preview you saw."
      />
      <CommandCenter
        initial={snapshot}
        websites={websites.map((w) => ({ id: w.id, name: w.name, url: w.url }))}
      />

      <div className="mt-10 border-t pt-8" style={{ borderColor: "var(--line)" }}>
        <h2 className="mb-1 text-lg font-semibold">Seeded demo loop</h2>
        <p className="mb-4 max-w-2xl text-sm" style={{ color: "var(--ink-soft)" }}>
          The original one-click walkthrough, kept for reference. It runs the
          whole loop against a seeded in-memory site and shows the before/after
          HTML of the page it edited.
        </p>
        <AutopilotPanel />
      </div>
    </>
  );
}
