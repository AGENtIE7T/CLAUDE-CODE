# Configure — "to change X, edit Y"

The app is built so behavior changes are **one-line edits in one file**, not
code hunts. Almost everything lives in **`src/config/app.config.ts`**.

## The one file: `src/config/app.config.ts`

| Want to change… | Edit |
|---|---|
| Which LLM writes content | `llm.model` (or set `AEO_MODEL` env var) |
| Draft length | `llm.maxTokens` |
| Which answer engines are measured | `engines[]` |
| Which content formats can be generated | `contentTypes[]` |
| Near-duplicate sensitivity | `guards.dedupeThreshold` (0–1; higher = stricter) |
| A channel's default autonomy | `channels.<kind>.defaultAutonomy` |
| A channel's posting cadence cap | `channels.<kind>.rateCapPerDay` |
| **Whether a channel may ever auto-publish** | `channels.<kind>.canAutoPublish` |
| The text shown on the Channels screen | `channels.<kind>.note` |

Change `canAutoPublish` and the whole system follows: onboarding defaults,
`resolveStatus()`, and the pipeline all read it. Setting `community` or
`directory` to `true` is the *only* place you'd loosen the ToS-safe policy —
deliberately one edit, and an obvious one.

## Environment / secrets: `.env.local`

Copy `.env.example` → `.env.local`. See `SETUP.md` for how to obtain each key.
Presence of `NEXT_PUBLIC_SUPABASE_URL` is what flips **demo mode → live mode**.

## Other change points

| Want to change… | Edit |
|---|---|
| Database schema (tables, columns, RLS) | `supabase/migrations/` — add a new numbered migration |
| A CMS's publish behavior | `src/lib/channels/adapters/<cms>.ts` |
| Add a new publish destination | new file in `src/lib/channels/adapters/`, register in `src/lib/channels/index.ts` |
| How visibility is measured | `src/lib/visibility/ahrefs.ts` / `probe.ts` |
| Add/adjust a safety guard | `src/lib/safety/guards.ts` (thresholds already in config) |
| Dashboard data shown | `src/lib/data/queries.ts` (view models) |
| Seed data for demo mode | `src/lib/demo/store.ts` |
| Brand colors / theme | CSS variables in `src/app/globals.css` |

## Guardrail

The 18 unit tests pin the safety-critical behavior (guards + the
`resolveStatus` policy matrix). Run `npm run test` after any config change —
if you loosen a policy, the tests tell you exactly what shifted.
