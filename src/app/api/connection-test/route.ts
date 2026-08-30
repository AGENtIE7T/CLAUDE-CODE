import { NextResponse } from "next/server";
import { resolveConnection } from "@/lib/connection/resolve";
import { isDemo } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Actively verify the CMS connection.
 *
 * Unlike /api/health this makes a real outbound call, so it is NOT open: in a
 * live deployment it requires an authenticated session. Anonymous probing of
 * an endpoint that triggers outbound requests is an abuse vector, and the
 * answer ("is this site reachable with these credentials") is operational
 * detail that does not belong to the public.
 *
 * The response never contains a credential; the WordPress client redacts
 * anything credential-shaped before an error can reach it.
 */
export async function GET() {
  if (!isDemo()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
  }

  const resolved = resolveConnection();
  const checkedAt = new Date().toISOString();

  if (!resolved.connection) {
    return NextResponse.json(
      {
        kind: "none",
        ok: false,
        error: { code: "not_connected", message: resolved.description },
        checkedAt,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  const conn = resolved.connection;
  const verified = await conn.verify();
  return NextResponse.json(
    {
      kind: resolved.kind,
      ok: verified.ok,
      siteName: verified.siteName ?? null,
      environment: conn.environment,
      isMock: conn.isMock,
      access: conn.capabilities.write ? "read/write" : "read-only",
      error: verified.error ?? null,
      checkedAt: verified.checkedAt,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
