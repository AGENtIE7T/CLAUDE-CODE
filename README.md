# AEO Autopilot

Auto-generate, publish, and measure the content that gets your brand **cited by
AI answer engines** (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini).

AEO (Answer Engine Optimization) is about winning the *citation inside the
answer*, not the blue link. This app runs one continuous loop per customer:

```
mine prompts → find gaps → draft → review → publish → measure → (repeat)
```

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| DB / Auth | Supabase (Postgres + RLS + Auth), pgvector |
| Styling | Tailwind CSS |
| LLM | Anthropic SDK (content generation + fact-check) |
| Visibility data | Ahrefs Brand Radar + Semrush (AI-visibility measurement) |

## Getting started

### Fastest: demo mode (no keys, no database)

```bash
npm install
npm run dev            # http://localhost:3000  → open /dashboard
```

With no `.env.local`, the app runs in **demo mode**: seeded in-memory data,
all six screens live and connected, auth bypassed, and content generation
templated. Click **▶ Run a content cycle** on the dashboard to draft a new
asset into the approval queue and watch the audit log update. Approve/reject
in the queue and see the calendar and audit change.

### Live mode (real data)

```bash
cp .env.example .env.local        # add Supabase + Anthropic keys (see SETUP.md)
npm run db:migrate                # applies supabase/migrations/0001_init.sql
npm run dev
```

When `NEXT_PUBLIC_SUPABASE_URL` is set, demo mode switches off: auth is
enforced (`/login` → `/onboarding` → `/dashboard`) and every screen reads
from Postgres. **`SETUP.md`** lists exactly which keys you provide.

## Project layout

```
src/
  app/
    (dashboard)/          # the six product screens
      dashboard/          #   01 · Visibility (share-of-voice)
      prompts/            #   02 · Prompts & gaps
      calendar/           #   03 · Content calendar
      approvals/          #   04 · Approval queue  ← default posture
      channels/           #   05 · Channel connections + autonomy
      audit/              #   06 · Audit log
    api/
      pipeline/           # manual trigger for one draft pass
      health/
  lib/
    types.ts              # domain types (mirror the SQL schema)
    supabase/             # browser + server clients (RLS-scoped)
    llm/generate.ts       # AEO content generation (answer-first, schema)
    channels/             # connector interface + owned-site connector
    visibility/probe.ts   # AI-engine measurement (loop-closing step)
  pipeline/run.ts         # the core loop orchestration
supabase/
  migrations/0001_init.sql
```

## Design decisions (locked)

- **Posting posture: approval-queue by default.** Nothing off the customer's own
  domain publishes without a human. Owned-site and social can be promoted to
  auto-publish per channel; **community (Reddit/Quora) and directories are
  capped at approval-queue by policy** — automated promotional posting there
  violates platform ToS. See `resolveStatus()` in `src/pipeline/run.ts`.
- **First channel: owned site.** Safest, highest-ROI AEO surface, and we fully
  control HTML + JSON-LD there. It's the only connector implemented so far.

## Build roadmap

1. **Foundation** ✅ — Next.js + Supabase, schema, RLS, app shell.
2. **Generate + owned publishing** ✅ — Anthropic generation wired to the
   owned-site connector with **WordPress / Webflow / Ghost** adapters
   (`src/lib/channels/adapters/`). Full cycle orchestration in
   `src/pipeline/cycle.ts`; safety guards in `src/lib/safety/guards.ts`;
   persistence in `src/lib/db/repository.ts`; interactive approval queue with
   server actions + audit trail; auth middleware for session refresh.
3. **Measurement** ✅ (data path) — Ahrefs Brand Radar client
   (`src/lib/visibility/ahrefs.ts`) feeds the visibility probe; falls back to
   baseline rows when unconfigured.
4. **Social + directories** — cadence limits, Canva asset gen, form-assist.
5. **Community (careful)** — draft-and-suggest flow with ToS guardrails.

## The safety layer

Every draft passes `runGuards()` before it can auto-publish. A trip forces the
item to `pending_approval` regardless of the channel's autonomy level:

- **dedupe** — Jaccard similarity vs. recently published bodies (blocks the
  reposted-everywhere pattern that gets accounts flagged)
- **rate cap** — per-channel posts-per-24h ceiling
- **brand/fact guard** — flags unsourced statistics and unbacked superlatives

## What still needs real credentials

The generation, CMS-publish, and Brand Radar calls are complete but need live
keys/tokens (`.env.local`) and a Supabase project to run end to end. Dashboard
screens render sample data until the pipeline writes live rows. Connectors for
social / directory / community channels are the next phase.
