import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "aeo-autopilot", ts: new Date().toISOString() });
}
