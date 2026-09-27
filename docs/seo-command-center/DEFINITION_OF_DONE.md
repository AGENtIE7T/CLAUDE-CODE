# SEO Command Center — Definition of Done

Status of every criterion from the master spec (Section 24). ✅ met · 🔶 met in
demo / needs live credentials to exercise · ⬜ not applicable yet.

| # | Criterion | Status | Where |
|---|---|---|---|
| 1 | App starts with documented commands | ✅ | `README.md`, `docs/seo-command-center/OPERATIONS.md` |
| 2 | Environment variables documented | ✅ | `.env.example`, OPERATIONS §1 |
| 3 | Clean database migrations work | 🔶 | `supabase/migrations/0002_*.sql` (additive; applied via `npm run db:migrate` with a Supabase project) |
| 4 | Authentication works | ✅ | reuses existing Supabase auth + middleware |
| 5 | Workspace isolation tested | ✅ | RLS in `0002`; `audit-log` cross-tenant test; `is_org_member()` on every table |
| 6 | Roles & permissions work | ✅ | `rbac/roles.ts` (+ tests), `rbac/resolve.ts`, fail-closed authz |
| 7 | Website onboarding works | ✅ | `websites/*`, `/websites` UI, service tests |
| 8 | Domain verification works | ✅ | `websites/verification.ts` (DNS/file/meta/SC/CMS) + tests |
| 9 | Crawl start/pause/resume/cancel | ✅ | `crawler/crawl.ts` (cancellation, limits) + tests |
| 10 | Crawl limits enforced | ✅ | page/depth/scope/robots + tests |
| 11 | Broken links detected | ✅ | `audits/audit.ts` + tests |
| 12 | Orphan pages detected | ✅ | `crawler/crawl.ts` / `audits` + tests |
| 13 | Internal-link suggestions explainable | ✅ | `linking/score.ts` component breakdown + `explain()` |
| 14 | Anchor text natural | ✅ | `linking/anchor.ts` (bans generic, review fallback) + tests |
| 15 | Technical destinations validated | ✅ | `linking/engine.ts` (2xx/3xx, indexable, canonical, not protected) |
| 16 | Preview + approval mandatory for writes | ✅ | `command/policy.ts`, `execute/engine.ts` |
| 17 | CMS changes verified after publishing | ✅ | `execute/engine.ts` post-write verify + tests |
| 18 | Rollback works | ✅ | `execute/engine.ts` `rollback()` + tests |
| 19 | Stale previews rejected | ✅ | `revisions/revision.ts` freshness + execute test |
| 20 | Tokens encrypted & never logged | 🔶 | schema `encrypted_credentials bytea` + `SEO_CREDENTIALS_ENC_KEY`; audit-log redaction tested (envelope-encrypt wiring lands with the first live connector) |
| 21 | SSRF protection tested | ✅ | `ssrf/validate.ts` (+ bypass tests); crawler pins resolved IP |
| 22 | Prompt-injection defense tested | ✅ | `injection/classify.ts` + tests; crawled content treated as data |
| 23 | Prohibited SEO operations blocked | ✅ | `tasks/registry.ts`, `command/policy.ts`, parser + tests |
| 24 | Tests pass | ✅ | full Vitest suite green |
| 25 | Errors handled | ✅ | typed results, fail-closed, audited denials |
| 26 | Long-running tasks use a job queue | ⬜ | crawl engine is queue-ready (injected fetcher, cancellation); wiring a real queue (Inngest/Trigger.dev) is a live-infra step |
| 27 | Audit logs complete | ✅ | `audit-log/log.ts`; append-only `audit_logs` under RLS |
| 28 | Documentation complete | ✅ | README section + `docs/seo-command-center/` (OPERATIONS, USER_GUIDE, this file) |
| 29 | Production writes disabled until approved | ✅ | `SEO_ENABLE_PRODUCTION_WRITES=0` default, enforced in `execute/engine.ts` |

## Security review

A security review of the full branch diff was run (see Phase 9). Two findings
were raised and **fixed**:
1. Authorization default-to-OWNER on unresolved membership → now fails closed.
2. DNS-rebinding TOCTOU in the live fetcher → now pins the validated IP through
   the connection.

## Remaining (live-infra, not code-complete blockers)

- Apply migration `0002` against a real Supabase project (`npm run db:migrate`).
- Wire envelope encryption of CMS tokens at the first live connector.
- Attach a durable job queue for large crawls.
- Provide SEO-data provider tokens with API entitlement (the connected Ahrefs
  plan currently returns "Insufficient plan" for API v3 reads; the adapter
  degrades to `unavailable` until a plan with API access is supplied).
