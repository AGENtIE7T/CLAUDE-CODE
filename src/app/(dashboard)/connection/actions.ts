"use server";

import { resolveConnection } from "@/lib/connection/resolve";
import { audit } from "@/lib/audit-log/log";
import { DEMO_WORKSPACE_ID, resolveMembership } from "@/lib/rbac/resolve";

/**
 * The result of an ACTUAL call to the CMS. Deliberately separate from the
 * capability snapshot, which only knows whether credentials exist: this is the
 * only thing in the product entitled to say a connection works.
 *
 * No field here can carry a credential — the connection object never exposes
 * one, and the client's own redaction runs before any message reaches this.
 */
export interface ConnectionTestResult {
  kind: "real" | "mock" | "none";
  ok: boolean;
  siteName: string | null;
  environment: string | null;
  access: "read/write" | "read-only" | null;
  isMock: boolean;
  contentCount: number | null;
  error: { code: string; message: string } | null;
  checkedAt: string;
  description: string;
}

export async function testConnectionAction(): Promise<ConnectionTestResult> {
  const membership = await resolveMembership(DEMO_WORKSPACE_ID);
  const workspaceId = membership?.workspaceId ?? DEMO_WORKSPACE_ID;
  const resolved = resolveConnection();
  const checkedAt = new Date().toISOString();

  if (!resolved.connection) {
    await audit({
      workspaceId,
      userId: membership?.userId ?? null,
      action: "cms.connection.test",
      resourceType: "connection",
      resultSummary: "No connection configured.",
    });
    return {
      kind: "none",
      ok: false,
      siteName: null,
      environment: null,
      access: null,
      isMock: false,
      contentCount: null,
      error: { code: "not_connected", message: "No WordPress connection is configured." },
      checkedAt,
      description: resolved.description,
    };
  }

  const conn = resolved.connection;
  const verified = await conn.verify();

  // Only count content when the credentials actually worked.
  let contentCount: number | null = null;
  if (verified.ok) {
    try {
      contentCount = (await conn.list()).length;
    } catch {
      contentCount = null;
    }
  }

  await audit({
    workspaceId,
    userId: membership?.userId ?? null,
    action: "cms.connection.test",
    resourceType: "connection",
    resultSummary: verified.ok
      ? `Connection verified (${resolved.kind}); ${contentCount ?? "unknown"} item(s) readable.`
      : `Connection test failed: ${verified.error?.code ?? "unknown"}.`,
  });

  return {
    kind: resolved.kind,
    ok: verified.ok,
    siteName: verified.siteName ?? null,
    environment: conn.environment,
    access: conn.capabilities.write ? "read/write" : "read-only",
    isMock: conn.isMock,
    contentCount,
    error: verified.error ?? null,
    checkedAt: verified.checkedAt,
    description: resolved.description,
  };
}
