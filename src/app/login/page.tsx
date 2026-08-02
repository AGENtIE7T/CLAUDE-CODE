"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      // Created here (not at render) so the client only initializes in the
      // browser, where NEXT_PUBLIC_* env vars are available.
      const supabase = createClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        setMsg(error ? error.message : "Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
        else router.push("/dashboard");
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p
        className="mb-2 text-xs uppercase tracking-[0.22em]"
        style={{ color: "var(--gold)", fontFamily: "var(--font-mono)" }}
      >
        AEO Autopilot
      </p>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">
        {mode === "signin" ? "Sign in" : "Create your account"}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="you@brand.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink)" }}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink)" }}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--teal)" }}
        >
          {pending ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {msg && (
        <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
          {msg}
        </p>
      )}
      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setMsg(null);
        }}
        className="mt-4 text-left text-sm underline"
        style={{ color: "var(--teal)" }}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </main>
  );
}
