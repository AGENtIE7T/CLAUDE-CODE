import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrg } from "./actions";

/**
 * First-run setup. If the user already belongs to an org, skip straight to
 * the dashboard; otherwise collect the brand name + domain to bootstrap one.
 */
export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p
        className="mb-2 text-xs uppercase tracking-[0.22em]"
        style={{ color: "var(--gold)", fontFamily: "var(--font-mono)" }}
      >
        Set up your brand
      </p>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Let&apos;s get you cited</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--ink-soft)" }}>
        We&apos;ll create your workspace with all four channels on the safe
        approval-queue default and seed a few target prompts to start measuring.
      </p>
      <form action={createOrg} className="flex flex-col gap-3">
        <input
          name="name"
          required
          placeholder="Brand name"
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink)" }}
        />
        <input
          name="domain"
          required
          placeholder="yourbrand.com"
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink)" }}
        />
        <button
          type="submit"
          className="rounded-md px-3 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--teal)" }}
        >
          Create workspace →
        </button>
      </form>
    </main>
  );
}
