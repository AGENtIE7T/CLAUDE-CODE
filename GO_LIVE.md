# Go live — self-serve, local-first (~10 minutes)

You run every step; nothing here shares secrets. When you're done,
`npm run check` prints **LIVE** and the app uses a real database + auth.

---

## Step 1 — Create a Supabase project 🧑

1. https://supabase.com → sign in → **New project**.
2. Name it (e.g. `aeo-autopilot`), set a strong DB password, pick a region, **Create**.
3. Wait ~1 min for it to provision.

## Step 2 — Copy your keys into `.env.local` 🧑

In the project: **Project Settings → API**. Copy these three values:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

| Supabase field | Put it in |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

Also set `ANTHROPIC_API_KEY` (from https://console.anthropic.com → API Keys).
Leave `AHREFS_API_TOKEN` blank for now (optional).

> Because `NEXT_PUBLIC_SUPABASE_URL` is now set, the app leaves demo mode
> automatically. `NEXT_PUBLIC_DEMO_MODE` can stay — it's ignored unless `=1`.

Verify:

```bash
npm run check      # should now say Mode: LIVE, with ✓ on the four keys
```

## Step 3 — Apply the database schema 🧑

**Easiest (no tooling): paste the SQL.**

1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/migrations/0001_init.sql` in this repo, copy all of it.
3. Paste into the editor, click **Run**. You should see "Success".

That creates the tables, enums, indexes, and Row-Level Security policies.

<details>
<summary>Alternative: Supabase CLI</summary>

```bash
npx supabase link --project-ref <your-project-ref>   # ref is in your project URL
npm run db:migrate                                   # runs supabase db push
```
</details>

## Step 4 — Turn on email auth 🧑

1. **Authentication → Providers → Email**: make sure it's **enabled**.
2. For fast local testing, **turn off "Confirm email"** (optional, skips the
   email round-trip).
3. **Authentication → URL Configuration → Redirect URLs**: add
   `http://localhost:3000/auth/callback`.

## Step 5 — Run it 🧑

```bash
npm install     # first time only
npm run dev     # http://localhost:3000
```

Flow: `/login` → **Sign up** → you land on `/onboarding` → enter a brand name
+ domain → **Create workspace** → `/dashboard`.

Onboarding seeds your org with all four channels (on the safe approval-queue
default) and a few target prompts — so the dashboard has real data immediately.

---

## Verify it's really live

- `npm run check` says **LIVE** with four ✓.
- The gold "DEMO MODE" banner is **gone** from the dashboard.
- In Supabase **Table Editor**, after onboarding you can see rows in
  `organizations`, `memberships`, `channels`, and `prompt_sets`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Still shows DEMO banner | `NEXT_PUBLIC_SUPABASE_URL` not set or still has the `YOUR-` placeholder. Re-check `.env.local`, restart `npm run dev`. |
| Redirected to `/login` in a loop | Email auth not enabled (step 4), or keys are wrong. Run `npm run check`. |
| Onboarding error | Migration didn't run (step 3). Re-run the SQL; confirm tables exist in Supabase. |
| Empty dashboard after onboarding | Expected until you connect a channel and run a cycle. Content generation needs `ANTHROPIC_API_KEY`. |

## After you're live — tell me and I can

- Wire the Channels **connect** forms (store CMS creds) so you can publish to your site
- Add the scheduler so `runCycle()` runs per-tenant automatically
- Add deploy config when you pick a host

Change any default without touching feature code: see **`docs/CONFIGURE.md`**.
