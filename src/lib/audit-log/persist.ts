/**
 * Live-mode audit persistence — placeholder.
 *
 * The `audit_logs` table exists in migration 0002, but the write path is
 * intentionally NOT wired to a real client during the read/preview phases
 * (production writes are disabled by decision). `audit()` calls this behind a
 * try/catch and degrades to a console warning, so nothing here can silently
 * drop or, worse, half-write an entry. The DB phase replaces this stub with a
 * service-role insert scoped by workspace.
 */

import type { AuditRecord } from "@/lib/audit-log/log";

export interface AuditPersister {
  insert(record: AuditRecord): Promise<void>;
}

export function getServiceClient(): AuditPersister {
  return {
    async insert() {
      throw new Error("audit persistence not enabled in this phase");
    },
  };
}
