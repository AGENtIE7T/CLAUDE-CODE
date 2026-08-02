import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/env";
import { Nav } from "@/components/nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isDemo()) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // No org yet → finish onboarding first.
    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen">
      <Nav />
      <div className="flex-1">
        {isDemo() && (
          <div
            className="px-8 py-2 text-xs"
            style={{ background: "var(--gold)", color: "#1b1e24", fontFamily: "var(--font-mono)" }}
          >
            DEMO MODE — seeded data, no external services. Add Supabase keys to switch to live mode.
          </div>
        )}
        <div className="px-8 py-10">{children}</div>
      </div>
    </div>
  );
}
