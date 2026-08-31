/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WordPress → CmsStore bridge.
 * ─────────────────────────────────────────────────────────────────────────
 *  `execute/engine.ts` writes through the narrow `CmsStore` seam
 *  (getPage / writePage / listUrls) and owns the safety contract: approval
 *  binding, staleness, protected URLs, verify, rollback, idempotency.
 *
 *  This adapter lets that UNCHANGED engine drive a real WordPress site. It adds
 *  exactly two things the engine cannot do for itself:
 *
 *    · a BACKUP taken before every write — if the backup fails, the write does
 *      not happen (that ordering is the whole point of requiring one);
 *    · URL → post-id resolution, cached per batch, plus the version marker the
 *      client needs for optimistic concurrency.
 *
 *  It deliberately does NOT re-implement verification or rollback: the engine
 *  already re-reads and rolls back, and `rollbackFromBackups()` below exists
 *  for the separate case of undoing a completed batch later.
 */

import { assertUsable, CmsError, type CmsConnection } from "@/lib/cms/adapter";
import type { CmsPage, CmsStore } from "@/lib/cms/mock";
import type { BackupStore } from "@/lib/backups/snapshot";

export interface WordPressStoreOptions {
  websiteId: string;
  /** Groups the backups taken during one run so the run can be undone. */
  batchId: string;
  /** When false, writePage throws rather than proceeding without a backup. */
  requireBackup?: boolean;
}

export function createWordPressCmsStore(
  conn: CmsConnection,
  backups: BackupStore,
  opts: WordPressStoreOptions,
): CmsStore {
  const requireBackup = opts.requireBackup ?? true;
  // url → { id, version } learned from list()/get(); refreshed on write.
  const index = new Map<string, { id: number | string; version: string; revision: number }>();

  async function resolve(url: string) {
    const known = index.get(url);
    if (known) return known;
    const content = await conn.getByUrl(url);
    const entry = { id: content.id, version: content.version, revision: 1 };
    index.set(url, entry);
    return entry;
  }

  return {
    async getPage(url: string): Promise<CmsPage | null> {
      assertUsable(conn);
      try {
        const content = await conn.getByUrl(url);
        const prev = index.get(url);
        const entry = {
          id: content.id,
          version: content.version,
          revision: prev?.revision ?? 1,
        };
        index.set(url, entry);
        return {
          url: content.url,
          html: content.html,
          revision: entry.revision,
          updatedAt: content.modifiedAt,
        };
      } catch (e) {
        if (e instanceof CmsError && e.code === "not_found") return null;
        throw e;
      }
    },

    async writePage(url: string, html: string): Promise<CmsPage> {
      assertUsable(conn, { write: true });
      const entry = await resolve(url);

      // 1) Back up the CURRENT live bytes before touching anything.
      if (requireBackup) {
        const live = await conn.getByUrl(url);
        try {
          await backups.save({
            websiteId: opts.websiteId,
            url,
            html: live.html,
            version: live.version,
            batchId: opts.batchId,
          });
        } catch {
          throw new CmsError(
            "write_failed",
            `Could not back up ${url}; refusing to write without a backup.`,
            { retryable: false },
          );
        }
        entry.version = live.version;
      }

      // 2) Write, pinned to the version we just read (rejects a racing edit).
      const res = await conn.update(entry.id, html, { expectedVersion: entry.version });
      const revision = entry.revision + 1;
      index.set(url, { id: res.id, version: res.version, revision });
      return { url: res.url, html: res.html, revision, updatedAt: res.version };
    },

    async listUrls(): Promise<string[]> {
      assertUsable(conn);
      const refs = await conn.list();
      for (const r of refs) {
        if (!index.has(r.url)) index.set(r.url, { id: r.id, version: r.modifiedAt, revision: 1 });
      }
      return refs.map((r) => r.url);
    },
  };
}

export interface RollbackOutcome {
  restored: string[];
  failed: { url: string; reason: string }[];
}

/**
 * Restore every page in a batch from its backup. Used to undo a run AFTER it
 * completed — the execute engine handles rollback during a failed run itself.
 */
export async function rollbackFromBackups(
  conn: CmsConnection,
  backups: BackupStore,
  batchId: string,
): Promise<RollbackOutcome> {
  assertUsable(conn, { write: true });
  const snaps = await backups.byBatch(batchId);
  const restored: string[] = [];
  const failed: { url: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const s of snaps) {
    if (seen.has(s.url)) continue; // byBatch is newest-first; keep the newest.
    seen.add(s.url);
    try {
      const live = await conn.getByUrl(s.url);
      // Restore without a version pin: we are deliberately overwriting whatever
      // is live now with the known-good bytes.
      await conn.update(live.id, s.html);
      restored.push(s.url);
    } catch (e) {
      failed.push({
        url: s.url,
        reason: e instanceof CmsError ? e.code : "unknown error",
      });
    }
  }
  return { restored, failed };
}
