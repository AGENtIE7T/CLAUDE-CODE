# Deployment — Vercel + Supabase

This describes what the application needs in order to run somewhere other than
a laptop. **Nothing here has been deployed.** Follow it when you decide to.

## Shape of the deployment

```
Vercel (Next.js 14 App Router)
  ├─ pages + server actions        the UI and the command centre
  ├─ /api/health                   liveness + capability status, no I/O
  ├─ /api/connection-test          real CMS check, authenticated
  └─ /api/jobs/run                 the worker, invoked by Vercel Cron
Supabase
  ├─ Auth                          sessions, via @supabase/ssr cookies
  └─ Postgres + RLS                websites, memberships, audit log
WordPress (yours)
  └─ REST API                      reached server-side only, never from a browser
```

There is no long-running process. A crawl is a queue of jobs plus a worker the
scheduler calls every ten minutes; each invocation does as much as fits in a
25-second budget and stops cleanly. See `src/lib/jobs/queue.ts`.

## 1. Supabase

1. Create a project. Note the project URL and the two keys.
2. Apply the migrations, in order, from `supabase/migrations/`:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db diff --linked   # SHOWS what would change — read this first
   npx supabase db push            # applies 0001_init.sql then 0002_seo_command_center.sql
   ```
   Or paste each file into the SQL editor in numeric order. `0002` adds the SEO
   Command Center tables (websites, memberships.seo_role, audit entries).
3. Confirm Row Level Security is **on** for every table. The app relies on RLS
   rather than on its own filtering; a table with RLS off is a cross-tenant leak
   waiting to happen.
4. Under Authentication → URL Configuration, add your deployment URL as a
   redirect target so the auth callback works.

## 2. Vercel

1. Import the repository. The framework is detected as Next.js; no build
   overrides are needed.
2. Add the environment variables from the table below. Mark everything except
   the two `NEXT_PUBLIC_*` values as **not** exposed to the browser — Vercel
   does this automatically for names without the `NEXT_PUBLIC_` prefix, which is
   why no server secret in this project uses that prefix.
3. Use separate Vercel **environments** for staging and production, each with
   its own Supabase project and its own WordPress credentials. Do not share a
   database between them.
4. `vercel.json` is committed and already configures:
   - the cron entry for `/api/jobs/run` (every 10 minutes),
   - `no-store` on every API response,
   - HSTS, `x-frame-options: DENY`, `nosniff`, and a referrer policy.

## 3. Environment variables

| Variable | Where | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | yes | Public. Its absence is what turns demo mode on. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | yes | Public by design; RLS is the protection. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | yes | Bypasses RLS. Never expose. |
| `NEXT_PUBLIC_APP_URL` | browser + server | yes | Used for auth redirects. |
| `ANTHROPIC_API_KEY` | server | no | Content generation only. |
| `CRON_SECRET` | server | yes | Without it `/api/jobs/run` refuses every request. |
| `SEO_ENABLE_PRODUCTION_WRITES` | server | no | Default `0`. `1` is a deliberate, separate decision. |
| `SEO_ENABLE_LIVE_CRAWL` | server | no | Default `0`. Allows network crawling of verified domains. |
| `SEO_CREDENTIALS_ENC_KEY` | server | no | 32-byte base64; envelope-encrypts stored connection credentials. |
| `WORDPRESS_BASE_URL` | server | no | Blank ⇒ "not connected", and the UI says so. |
| `WORDPRESS_USERNAME` | server | no | The user the Application Password belongs to. |
| `WORDPRESS_APP_PASSWORD` | server | no | Application Password, never the login password. |
| `WORDPRESS_ENVIRONMENT` | server | no | `staging` (default) or `production`. |
| `WORDPRESS_ACCESS` | server | no | `read_only` (default) or `read_write`. |
| `WORDPRESS_USE_MOCK` | server | no | `1` runs against the fixture, labelled MOCK everywhere. |
| `SEMRUSH_API_KEY` | server | no | Optional. Absent ⇒ Semrush shows "Not connected", no figures. |
| `AHREFS_API_TOKEN` | server | no | Optional. A plan refusal locks it out for 24h. |

`.env.example` carries the same list with empty placeholders and per-variable
comments. It is committed; a filled `.env.local` is git-ignored and must stay
that way.

## 4. Credential rules

These are enforced in code, not just documented:

- Secrets exist only in server environment variables. No screen in the app
  accepts one, deliberately.
- No secret uses the `NEXT_PUBLIC_` prefix, so none can be bundled.
- `src/lib/connection/resolve.ts` is the only module that reads the WordPress
  credential; it hands it straight into a closure and returns an object that
  does not carry it.
- `redact()` in the WordPress client and in `observability/report.ts` strips
  Bearer/Basic headers, `?key=`/`?token=` parameters, JWTs, `sk-` style keys,
  and any configured secret's literal value from anything that could be logged.
- `/api/health` performs no outbound I/O and reports only whether a credential
  is present.
- The audit log records actions, never inputs that could contain a secret.

## 5. Staging and production separation

| | Staging | Production |
|---|---|---|
| Supabase project | its own | its own |
| WordPress site | disposable | the real one |
| `WORDPRESS_ENVIRONMENT` | `staging` | `production` |
| `WORDPRESS_ACCESS` | `read_write` after the controlled test | `read_only` until you decide otherwise |
| `SEO_ENABLE_PRODUCTION_WRITES` | `0` | `0` until the staging test has passed |
| Autopilot | may be enabled | leave disabled |

A connection marked `isMock` can never be used against `production`. That is a
plain code path in `assertUsable()`, not a configuration value, so no
combination of environment variables can turn it off.

## 6. Error monitoring

`src/lib/observability/report.ts` emits structured, redacted JSON to stderr,
which Vercel collects. To ship to a third party, call `setErrorSink()` once at
startup with an adapter — no monitoring dependency is imposed on the project.

Report severities are `info | warning | error | fatal`, and every report carries
a stable `kind` (e.g. `cms.write_failed`) so alerts can group on it rather than
on message text.

## 7. Health checks

- `GET /api/health` — unauthenticated, no outbound I/O, safe to poll. Returns
  liveness plus each capability's status and the three gates
  (`canRecommend`, `canPreview`, `canWrite`).
- `GET /api/connection-test` — authenticated outside demo mode. Actually calls
  the CMS. Never poll this from an uptime monitor; it makes a real request to
  your WordPress site.

## 8. First deploy checklist

- [ ] Migrations applied; RLS confirmed on every table.
- [ ] All server variables set; nothing secret carries `NEXT_PUBLIC_`.
- [ ] `CRON_SECRET` set and the cron entry visible in the Vercel dashboard.
- [ ] `SEO_ENABLE_PRODUCTION_WRITES` is `0`.
- [ ] `WORDPRESS_ACCESS` is `read_only`.
- [ ] `/api/health` returns `ok: true` with the capability list you expect.
- [ ] The Connection screen's test reports the site by name.
- [ ] An AUDIT run completes and modifies nothing.
