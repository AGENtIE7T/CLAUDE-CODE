/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Page backups — the "keep a backup" half of the write contract.
 * ─────────────────────────────────────────────────────────────────────────
 *  A backup is taken BEFORE a page is written, and holds the exact bytes that
 *  were live plus the CMS version marker they came from. Rollback replays the
 *  most recent backup, so "undo" restores what was actually there rather than
 *  what the system believed was there.
 *
 *  Autopilot requires a backup by default (`requireBackup`), and the CMS store
 *  refuses to write when a backup could not be taken. That ordering — backup
 *  first, write second — is the invariant this module exists to hold.
 *
 *  The in-memory implementation is used in demo and tests; a durable one can be
 *  swapped in behind the same interface without touching callers.
 */

export interface Snapshot {
  websiteId: string;
  url: string;
  html: string;
  /** CMS version marker the content was read at. */
  version: string;
  takenAt: string;
  /** Groups snapshots taken for one batch, so a whole run can be rolled back. */
  batchId: string;
}

export interface BackupStore {
  save(s: Omit<Snapshot, "takenAt">): Promise<Snapshot>;
  /** Most recent snapshot for a URL, or null. */
  latest(websiteId: string, url: string): Promise<Snapshot | null>;
  /** All snapshots in a batch, newest first. */
  byBatch(batchId: string): Promise<Snapshot[]>;
  /** Every URL that has at least one snapshot. */
  urls(websiteId: string): Promise<string[]>;
}

export function createMemoryBackupStore(): BackupStore {
  const rows: Snapshot[] = [];
  return {
    async save(s) {
      const snap: Snapshot = { ...s, takenAt: new Date().toISOString() };
      rows.push(snap);
      return snap;
    },
    async latest(websiteId, url) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].websiteId === websiteId && rows[i].url === url) return rows[i];
      }
      return null;
    },
    async byBatch(batchId) {
      return rows.filter((r) => r.batchId === batchId).reverse();
    },
    async urls(websiteId) {
      return [...new Set(rows.filter((r) => r.websiteId === websiteId).map((r) => r.url))];
    },
  };
}
