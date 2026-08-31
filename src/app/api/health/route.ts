import { NextResponse } from "next/server";
import { buildCapabilitySnapshot } from "@/lib/status/capabilities";

export const dynamic = "force-dynamic";

/**
 * Liveness + capability health.
 *
 * Deliberately reports only WHETHER things are configured — never a value. A
 * health endpoint is usually unauthenticated and often scraped, so it must not
 * become the place a credential leaks. It also does no outbound I/O: a probe
 * must not be able to make the app hammer WordPress or Semrush. Use
 * /api/connection-test for an actual reachability check.
 */
export function GET() {
  const snapshot = buildCapabilitySnapshot();
  return NextResponse.json(
    {
      ok: true,
      service: "aeo-autopilot",
      ts: new Date().toISOString(),
      capabilities: snapshot.cards.map((c) => ({
        key: c.key,
        status: c.status,
        value: c.value,
      })),
      gates: {
        canRecommend: snapshot.canRecommend,
        canPreview: snapshot.canPreview,
        canWrite: snapshot.canWrite,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
