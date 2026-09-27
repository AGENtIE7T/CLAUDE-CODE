# SEO Command Center — Operations Runbook

Deploy, backup/restore, and incident recovery for the SEO Command Center
product (lives alongside AEO Autopilot in the same Next.js app).

> **Default posture:** read-only, preview-first, approval-based. Production
> writes and live crawling are **OFF** until explicitly enabled. Nothing in this
> runbook turns them on except the clearly-marked go-live step.

---

## 1. Environments & flags

| Variable | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | unset | When unset → **demo mode** (in-memory, auth bypassed). When set → live mode. |
| `SUPABASE_SERVICE_ROLE_KEY` | unset | Server-only; used by workers/migrations. **Never** expose. |
| `SEO_ENABLE_PRODUCTION_WRITES` | `0` | Gate for any CMS write / redirect / robots / outreach send. |
| `SEO_ENABLE_LIVE_CRAWL` | `0` | Gate for real (non-fixture) network crawling. |
| `SEO_CREDENTIALS_ENC_KEY` | unset | 32-byte base64 key to envelope-encrypt connection credentials at rest. `openssl rand -base64 32`. |
| `AHREFS_API_TOKEN` / `SEMRUSH_API_KEY` | unset | Optional SEO-data providers. Absent → reports degrade to `unavailable`. |

Keep **development / staging / production** as separate Supabase projects and
separate key sets. Never point staging writes at a production CMS.

## 2. Deploy

```bash
npm install
npm run typecheck && npm run lint && npm test    # must be green
npm run build
# apply DB schema (live only):
npm run db:migrate            # applies supabase/migrations/*.sql incl. 0002
npm start                     # or your platform's start command
```

CI gate (recommended): block merge unless `typecheck`, `lint`, `test`, and
`build` all pass. A SessionStart hook (`.claude/hooks/session-start.sh`) keeps
Claude Code on the web sessions green by installing deps on start.

## 3. Go-live for writes (deliberate, reversible)

1. Verify website **ownership** for every target (`/websites` → status must be
   `verified`). Unverified sites cannot be crawled or written.
2. Populate **protected URL** patterns for each site (checkout, account, legal).
3. Connect the CMS with a **least-scope** token; confirm `read_write` only where
   needed.
4. Do a **dry run**: run autopilot / execute with `dry_run: true` — it validates
   approval, hash freshness, and protected-URL rules and writes nothing.
5. Flip `SEO_ENABLE_PRODUCTION_WRITES=1` for the target environment only.
6. Execute a **single** low-risk page first; confirm post-write verification and
   that rollback restores prior HTML.

To pause all writes instantly: set `SEO_ENABLE_PRODUCTION_WRITES=0` and redeploy
(or hot-reload env). In-flight executes re-check the flag before writing.

## 4. Backup & restore

**What to back up**
- Supabase Postgres (all `0001`+`0002` tables). Enable Supabase daily backups /
  PITR on the production project.
- `page_versions` + `revisions`/`revision_items` are the app-level history that
  powers rollback — they are inside the DB backup.
- Secrets: store `SUPABASE_SERVICE_ROLE_KEY`, `SEO_CREDENTIALS_ENC_KEY`, and CMS
  tokens in your platform's secret manager, **not** in the DB dump.

**Restore drill (staging)**
```bash
# 1. Restore Postgres from the latest backup/PITR into a staging project.
# 2. Point staging env at the restored DB; keep SEO_ENABLE_PRODUCTION_WRITES=0.
# 3. npm run build && npm start
# 4. Smoke test: sign in, load /command and /websites, run an audit.
```
Restoring the DB restores websites, crawls, previews, approvals, revisions, and
audit logs. Because `SEO_CREDENTIALS_ENC_KEY` lives outside the DB, a restore
into a new environment needs the **same** key to decrypt stored CMS credentials;
otherwise reconnect the CMS.

## 5. Incident recovery

| Symptom | First action | Then |
|---|---|---|
| A bad revision went live | `rollback()` restores prior HTML from the revision's `before` snapshot; the execute engine also auto-rolls-back on verify failure. | Set `SEO_ENABLE_PRODUCTION_WRITES=0`, review `audit_logs` for the `revision.execute.applied` entry, re-preview. |
| Crawler hitting something it shouldn't | Set `SEO_ENABLE_LIVE_CRAWL=0`; SSRF guard already blocks private/metadata IPs and pins the resolved IP. | Add exclude patterns / protected URLs; re-verify ownership. |
| Suspected credential exposure | Rotate the CMS token + `SEO_CREDENTIALS_ENC_KEY`; revoke the connection (`seo_connections.status='revoked'`). | Audit `audit_logs` (secrets are redacted there, so logs are safe to read). |
| Stale/wrong data in a report | Reports never fabricate: SEO-data provider returns `unavailable` without a token. Re-run the crawl/audit. | Confirm provider tokens + plan entitlement. |
| Runaway autopilot | Autopilot only edits pages already in the target site's CMS and holds for approval in live mode. Set the write flag off. | Inspect `seo_tasks` + `audit_logs`; nothing off-domain is reachable. |

**Invariants that make recovery safe (all enforced in code + tested):** approval
bound to an exact content hash · stale-preview rejection · protected-URL block ·
post-write verify-or-rollback · idempotency keys · append-only `audit_logs` ·
SSRF IP-pinning · fail-closed authorization.

## 6. Observability

- `audit_logs` is the system of record: every consequential action writes an
  entry with a hashed (never raw) input and a redacted summary. It is
  append-only under RLS (no update/delete policy).
- Recommended external signals: DB backup success, error-rate on `/api/*`,
  count of `revision.execute.*` events per day, and any
  `revision.execute.verify_failed` / `.denied` entries (should be ~0 in normal
  operation).

## Running the test suites

```bash
npm test          # 333 unit and integration tests (vitest)
npm run typecheck # tsc --noEmit
npm run lint      # next lint
npm run build     # production build
npm run test:e2e  # 8 browser tests (Playwright, against a production build)
```

`npm run test:e2e` builds the app, starts it on port 3100 in demo mode with the
fixture WordPress (`WORDPRESS_USE_MOCK=1`, `SEO_ENABLE_PRODUCTION_WRITES=0`),
and drives the real screens in Chromium. It never touches a real website.

That last sentence is enforced, not assumed. `next start` loads `.env.local`,
so a developer holding real staging credentials would otherwise hand them to
this server — and the suite contains a test that approves and applies a link.
`playwright.config.ts` therefore blanks `WORDPRESS_BASE_URL`,
`WORDPRESS_USERNAME` and `WORDPRESS_APP_PASSWORD` for its server, and
`src/lib/connection/resolve.test.ts` asserts those three stay blank. It is safe
to run the suite with staging credentials on disk.

If the machine already has a Chromium that Playwright did not install, point at
it instead of downloading a second copy:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

Otherwise `npx playwright install chromium` once is enough.
