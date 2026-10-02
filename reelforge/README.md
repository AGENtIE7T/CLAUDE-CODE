# ReelForge

AI reel script engine for Indian local businesses. Fill a short form about a salon, restaurant, gym, clinic, wholesaler and so on, and get ready-to-shoot Instagram Reels / YouTube Shorts scripts. Each script comes with a 1.5-second hook, timed beats, phone shooting notes, caption + hashtags, and a virality score from a **separate critic pass**.

Extra modules: Hook Analyzer, Performance Tracker (predicted vs actual), per-script feedback, History, Settings with export/import.

> This folder lives inside a repo that already holds an unrelated app (AEO Autopilot) at the root. ReelForge is fully self-contained in `reelforge/`.

---

## Quick start

```bash
cd reelforge
npm install
cp .env.example .env.local      # then paste your ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

Without an API key the UI still loads and every screen works with stored data. Generation shows a clear "Server is missing ANTHROPIC_API_KEY" error.

## Environment variables

| Variable | Required | Default | What it does |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Used only in API routes (server-side). Never sent to the browser. |
| `REELFORGE_MODEL` | no | `claude-sonnet-5-5` | Model for generator, critic, hooks and learnings calls. Can be overridden per browser in Settings. |
| `REELFORGE_EFFORT` | no | `medium` | `low` / `medium` / `high`. Higher means better reasoning but slower and pricier. |
| `REELFORGE_RATE_LIMIT_PER_HOUR` | no | `10` | Generations per IP per hour (in-memory). Hooks: 30/h, learnings: 20/h. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. Prompt `.md` edits apply on the next request, no restart needed. |
| `npm run build` / `npm start` | Production build / serve. |
| `npm test` | Unit tests (no API needed): `validate.ts` checks, `stats.ts`, critic merge, and an offline end-to-end pipeline test with a mocked SDK (covers the invalid-JSON retry). |
| `npm run test:live` | Runs `tests/fixtures/{salon,wholesale,gym}.json` through the real API. Saves to `tests/output/<fixture>.json` and prints a pass/fail table plus the average critic score. `npm run test:live -- gym` runs one fixture. Needs `ANTHROPIC_API_KEY` (read from env or `.env.local`). Costs roughly $0.10-0.30 per fixture on Sonnet 5.5. |
| `npm run typecheck` | `tsc --noEmit`. |

A fixture **passes** when no deterministic check still fails after the critic's rewrites. The score-inflation warning is reported but doesn't fail the run.

## How it works

```
form ─▶ /api/generate
          1. Generator  (lib/prompts/generator.md + ONLY the chosen niche's playbook + inputs JSON + past learnings)
          2. Deterministic checks (lib/validate.ts)
          3. Critic     (lib/prompts/critic.md + inputs + playbook + generator JSON + failed checks)
          4. Merge: critic rewrites replace originals, totals recomputed, scripts sorted by score
          5. Re-run checks; anything still failing shows as a warning on the card
       ◀─ NDJSON stream: stage events ("Audience padh rahe hain…", …) then the full record
```

- Every model reply is validated with Zod (`lib/schema.ts`). If it's invalid, the call is retried **once** with the Zod error and the previous output sent back. A second failure shows a friendly error with a request id and a "Try again" button.
- Calls stream (`messages.stream` → `finalMessage()`) so long outputs don't hit HTTP timeouts. Server-side refusal fallback (`fallbacks: "default"`) is switched on for models that support it.
- Token usage and approximate cost (USD and INR) are shown in the results footer. Pricing lives in `lib/anthropic.ts`.
- "Redo weakest" regenerates only the lowest-scoring script (with a different hook type, pillar and emotion), checks it, and has the critic score it with the rest of the batch as similarity context.

### Storage

There's no database and no login. Everything lives in browser `localStorage` (`lib/storage.ts`), and every read and write is wrapped in try/catch. If storage is blocked, data is kept in memory for the tab and the UI tells you so. **Settings → Export all data** downloads one JSON file. **Import** merges it back in. History keeps the last 50 generations.

## Editing prompts

Prompts are plain files. You don't need to touch code to change them:

| File | Used for |
|---|---|
| `lib/prompts/generator.md` | Generator system prompt. Placeholders: `{{INPUTS}}`, `{{NICHE_PLAYBOOK}}`, `{{PAST_PERFORMANCE}}`. |
| `lib/prompts/critic.md` | Critic system prompt. |
| `lib/prompts/hooks.md` | Hook Analyzer task. Its system prompt is the ROLE + STEP 3 + HOOK LIBRARY sections pulled from `generator.md`, so keep those headings. |
| `lib/prompts/learnings.md` | Turns aggregated stats into 5 bullets. |
| `lib/prompts/schemas/*.json` | Output shapes shown to the model. If you change a shape, update `lib/schema.ts` too. |
| `lib/niches.json` | The 12 niche playbooks. |

After any change that could move scores, bump `PROMPT_VERSION` in `lib/schema.ts`. Every generation and performance log stores it, so you can compare results across prompt versions.

## Deploying to Vercel

1. Import the repo in Vercel and set **Root Directory = `reelforge`**. This is needed only because the repo root holds another app. Everything else is auto-detected.
2. Add `ANTHROPIC_API_KEY` (and any optional vars) under Project → Settings → Environment Variables.
3. Deploy.

`next.config.mjs` bundles `lib/prompts/**` with the API routes (`outputFileTracingIncludes`). `/api/generate` sets `maxDuration = 300`. A 5-script generation usually takes 1-3 minutes, so you need Fluid Compute (on by default) or a plan that allows 300s functions. The rate limiter is in memory, so each serverless instance counts separately. That's fine for an MVP. Use Redis/Upstash if you need a hard global cap.

## How the scoring works

The **writer never scores itself**. A second call, the critic, reads the scripts with a strict rubric (total 100):

| Criterion | Max | What earns points |
|---|---|---|
| Hook | 20 | Stops the scroll in under 1.5s; specific; instant tension/curiosity |
| Retention | 20 | Open loop held to the end, a new beat every 2-3s, payoff lands |
| Niche fit | 15 | Proven pillar + trust trigger for this sub-niche |
| Relatability | 15 | B2C: "ye toh mere area ki baat hai". B2B: "ye toh mere business ki problem hai" |
| Emotion | 10 | One clear dominant emotion |
| Share/save | 10 | Useful enough to save or relatable enough to send |
| CTA | 10 | One natural action, right for the mode |

- Calibration is strict: 90+ is rare, 60-74 is "posted and forgotten". Every sub-score needs a one-line justification (tap a bar on the card to read it).
- Any script below 70, or with any violation (including failed automated checks), is **rewritten** by the critic and re-scored. The card then shows a "Rewritten by critic" badge.
- The app recomputes the total from the breakdown, so the sum always matches the bars. Colours: red <60, amber 60-74, green 75+.
- If every script scores 85+, a "possible score inflation" warning appears.
- **Scores estimate potential. They do not guarantee views.** The Performance tab exists to check that: log real numbers and it plots critic score against views/saves and shows the correlation (r).

### Deterministic checks (`lib/validate.ts`)

These run in code, before and after the critic:

- Beats are continuous; the last beat ends at or before `length_sec`.
- Spoken words ≤ `length_sec × 2.5`.
- Hook on-screen text ≤ 7 words.
- No two scripts share a hook type or content pillar.
- No hook library example line reused.
- Exactly one CTA.
- Reel summary is 2-4 sentences.
- 6-8 hashtags.
- B2B: no consumer/hyperlocal lifestyle hashtags, and the CTA asks for a quote/call/WhatsApp.
- No Devanagari when a Roman-script language is selected.

## Performance Tracker

Tap **I posted this** on a script card, or use "Log a posted script", to record platform, date, views, 3-second hold %, average watch %, likes, comments, shares, saves, profile visits and DMs. The dashboard shows:

- every posted script with predicted vs actual numbers
- a scatter chart of critic score vs views/saves, with the correlation
- averages by hook type, pillar, niche and emotion
- auto-insights computed in code, e.g. `"Pain call-out" hooks averaged 2.1x more saves than "POV" hooks`

**Get learnings** (pick a client first) sends **only aggregated stats** (no names, captions or dates) to the model and saves 5 bullets for that client. The next time you generate for that business name, the form offers to inject them under `PAST PERFORMANCE`.

## Decisions & simplifications

These were ambiguous in the spec, so the simplest option was picked:

- **Location:** built in `reelforge/` because the repo root already holds another Next.js app. Vercel needs Root Directory set (see above).
- **City + area** are two separate required fields.
- **"Exactly one CTA"** is checked by counting distinct action types in the CTA text (follow / comment / save / share / contact / visit). DM, call and WhatsApp count as one "contact" action. "Book" and "order" count as the purpose, not a second action.
- **"Hook library reuse"** means a hook that is an example template filled in (placeholders treated as wildcards), e.g. "Gurugram mein koi ye nahi batata". Templates with fewer than 4 fixed words (like `POV: tum …`) only fail on an exact copy. Otherwise every POV hook would fail.
- **B2B consumer hashtags:** flagged when the tag contains the city/area (or a major metro) plus a lifestyle word (food, foodie, blogger, lifestyle, makeup…), or is a generic lifestyle tag (#foodie, #instafood…).
- **Beats:** the first beat must start by ~3s (right after the 0-2s hook).
- **Model output** is free-text JSON validated with Zod + one retry (as specified), not the API's structured-outputs mode.
- **Learnings** are stored per client (normalised business name) and injected only for that client.
- **Rate limits** are per server instance (in memory), as the spec allows.
- **Cost** uses list prices from `lib/anthropic.ts`. Unknown model ids show token counts only. INR uses a fixed ₹85/$ for a rough feel.
