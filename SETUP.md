# Setup — where your input is needed

The codebase is complete through Phase 3 and builds/tests green. To run it end
to end, some steps require **your** accounts and secrets — I can't create those.
Work through this in order. Each step says whether it's **you** or **me (Claude)**.

Legend: 🧑 = only you can do it · 🤖 = I can do it once you unblock the step

---

## 1. Supabase project 🧑  *(required — nothing runs without this)*

1. Go to https://supabase.com → **New project**. Pick a name + strong DB password.
2. Once it's provisioned, open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** (secret) → `SUPABASE_SERVICE_ROLE_KEY`
3. Paste them into `.env.local` (copy from `.env.example` first).

> Why you: it's an account + billing-capable resource tied to your identity.

## 2. Apply the database schema 🤖 *(after step 1)*

Once your Supabase keys exist, I can run the migration for you — or you run:

```bash
npx supabase link --project-ref <your-project-ref>
npm run db:migrate        # applies supabase/migrations/0001_init.sql
```

This creates the tables, enums, indexes, and Row-Level Security policies.

> The `<project-ref>` is the string in your project URL: `https://<ref>.supabase.co`.

## 3. Enable email auth 🧑

In Supabase → **Authentication → Providers → Email**: ensure it's enabled.
For local dev you can turn **"Confirm email"** off to skip the email round-trip.
Add `http://localhost:3000/auth/callback` under **Authentication → URL
Configuration → Redirect URLs**.

## 4. Anthropic API key 🧑  *(required for content generation)*

1. Get a key at https://console.anthropic.com → **API Keys**.
2. Put it in `.env.local` as `ANTHROPIC_API_KEY`.
3. Optionally set `AEO_MODEL` (defaults to `claude-sonnet-5`).

> Why you: it's billed to your Anthropic account.

## 5. Ahrefs Brand Radar token 🧑  *(optional — for real visibility numbers)*

1. In your Ahrefs account, create an **API token** with Brand Radar access.
2. Put it in `.env.local` as `AHREFS_API_TOKEN`.

Without this, the visibility probe records baseline (un-measured) rows and the
dashboard shows sample data — everything else still works.

## 6. Connect a CMS to publish to your own site 🧑  *(when you're ready to publish)*

Pick one and gather credentials; store them on the `channels` row for
`owned_site` (the Channels screen will do this once its connect form is built —
next phase). Formats the adapters expect:

| CMS | Credentials needed |
|---|---|
| **WordPress** | `endpoint` = `https://SITE/wp-json/wp/v2`, `token` = base64 of `user:application-password` (create under Users → Application Passwords) |
| **Ghost** | `endpoint` = site URL, `token` = Admin API JWT (from a Custom Integration) |
| **Webflow** | `collectionId`, `token` = API token (Site settings → Integrations) |

## 7. Run it 🤖 *(after 1–4)*

```bash
npm install
npm run dev        # http://localhost:3000
```

Flow: `/login` → sign up → `/onboarding` (creates your workspace + channels +
seed prompts) → `/dashboard`.

---

## Later / optional (not blocking)

- **Stripe** 🧑 — `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` for billing (Phase: monetization).
- **Deploy** 🧑 — a Vercel account for the app + a worker host (Fly.io/Railway) for the scheduler. I can write the deploy config; you connect the accounts.
- **Scheduler** 🤖 — I can wire Inngest/Trigger.dev or Supabase cron to run `runCycle()` per tenant automatically.

## What I (Claude) will build next without needing you

- Phase 4 connectors: social (LinkedIn/X) with cadence limits, directory form-assist
- The Channels "connect" forms that store CMS credentials
- Scheduler wiring for automatic cycles
- Community draft-and-suggest flow with ToS guardrails

Just tell me which to pick up.
