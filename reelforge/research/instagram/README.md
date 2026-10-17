# Deep-watch study (Instagram + YouTube Shorts, business + creator)

One study for everyone: 104 business reels (4 in each of the 26 niches) and 104 creator reels (8 in each of the 13 creator niches). Every niche gets hits **and** flops, because a pattern only means something when you compare it against reels that didn't work.

## Batch 1: 50 YouTube Shorts (runs when Nexlev resets, 2026-10-11)
`pick_yt_batch.py` picks 50 Shorts from the 1,169 already collected, so no search calls are wasted. 25 are business (one per niche, alternating hit/flop) and 25 are creator-style (13 hits, 12 flops, max 2 of each per niche). The list is in `yt_slots.tsv`. Each one is watched with `WATCH_PROMPT.md` and saved as `deep/<video_id>.json`. Scores use views ÷ that niche's median.

## What Nexlev's free plan actually allows (found 2026-10-11)
- **1 full video watch per 24 hours** (`watch_*_video_and_ask`), inside the 50-calls-a-week cap.
- **2 bulk transcript calls per day, 10 videos each** (`get_bulk_video_transcripts`). These return timestamped captions.
- **Bulk subtitles only return signed YouTube links.** This environment can't open youtube.com, so they're useless here. A "Not Available" answer still hints the reel has no speech.

So batch 1 runs on two kinds of evidence:
- `evidence: "watch"`: a blind full watch with `WATCH_PROMPT.md`. Every field counts in the statistics.
- `evidence: "transcript"`: coded by `code_transcripts.py` from the saved transcript in `transcripts/`.
  - Only descriptive fields feed the statistics: opening words, number or question in the first line, greeting/"is video mein" opener, dialogue vs monologue vs no speech, spoken CTA, length.
  - Judgement notes (format, hook, what goes wrong, failure mode, swipe second) were written knowing each reel's views. They appear only as labelled `[deep-seen]` lines ("reviewer read, not blind") and never in lifts or failure statistics.

The analyzer treats unknown fields as unknown, not as "no". A transcript can't see the first frame, so that reel is left out of first-frame comparisons.

## Batch 1 status (2026-10-17)
| | Reels |
|---|---|
| Coded | 43 (5 full watches + 38 transcripts): 18 business, 25 creator |
| No captions; needs a full watch | 7 (wsU0BJ3kmkY, PVrYMT2cBHo, b4TLToQ8glg, JxWrZv1g7MM, uIoDuoyYBMo, cB7qffhC5R4, x-zfV8cMVfw) |

Every transcript has now been fetched. The 7 left are mostly big music-only reels (blouse cutting 20M, Korean kids head massage 28M, 3BHK interior 13M), so a full watch is the only way to study them, at 1 a day on the free plan. Refused attempts seem to count toward the 24-hour window (refused at 24h09m and again at 25h19m after a success), so each run makes exactly one attempt, about 26 hours after the previous one.

Twelve coded reels are music-only. Their transcripts are song lyrics or noise, so they carry no reviewer lesson until a full watch; music-only flops are judged only on facts in the title. Full watches run at 1 a day on the free plan.

**What 39 reels show so far:**
- **No surface feature separated hits from flops:** speech in the first 2 seconds, a number or question in the first spoken line, a greeting opener, dialogue, length or a CTA.
- **What did separate them was originality,** which is a judgement. In the reviewer read, 9 of 17 flops were generic copy: AI-cartoon stories, recycled jokes, stock rags-to-riches plots, "satisfying AC cleaning", "transformation" with no numbers, catalogue-style "affordable" reels.
- **Counter-example:** an old "7 ate 9" joke still got 43M, so delivery can rescue old material.

Hand review moved 5 reels to the other side (`pick_yt_batch.py` records each move and its reason).

## Where reels go wrong
Every reel, hit or flop, gets:
- `swipe_risk_sec`: the second a viewer is most likely to swipe away
- `what_goes_wrong`: the biggest mistake
- `failure_mode`: slow start, unclear hook, no payoff, too long, begging, hard sell, and so on

The analyzer turns these into "avoid" lines in three ways:
- failure modes that keep showing up in the weakest half of reels
- the typical swipe-away second for the weakest vs strongest reels
- each niche's worst mistakes, which go into its `avoid` list

## Steps (Instagram)
1. `python3 make_slots.py` writes `slots.tsv` (already done; re-running keeps filled rows).
2. Fill each row's `reel_url`, `views` and, if you can, `followers`. `12.5k` and `1.2M` are fine.
3. For each reel, run a video-watching model (Nexlev `watch_instagram_video_and_ask`) with `WATCH_PROMPT.md`. Save the JSON answer as `deep/<shortcode>.json`.
4. `python3 analyze_ig.py` writes `patterns_ig.json`.
5. `python3 ../build_patterns.py && node ../../artifact/build.mjs` merges the results into `lib/viral_patterns.json` and rebuilds the artifact. The JSON shape doesn't change, so no app code changes are needed.

## How it avoids fooling itself
- **Score = views ÷ followers**, when followers is known, then divided by that niche's median. A big account or a big niche can't fake a pattern.
- **Lift = median score with a feature ÷ median without it.** Lifts are pooled for everyone, for businesses only, and for creators only. One niche's 4–8 reels are too few for a lift, so a single niche only gets qualitative `[deep-seen]` lines.
- **Unknown is not "no".** Features return true/false/unknown, and unknown reels sit out that comparison.
- **A line only becomes a rule (`[deep-data]`)** when it has at least 8 reels on each side, a lift of at least 1.6x (or at most 0.6x), and a permutation p-value that survives a Benjamini-Hochberg correction at 10% across all ~40 features tested.
  - In a dry run with random data plus one planted effect, a plain p<0.05 cut-off produced 4 fake rules.
  - With the correction, only the planted effect came through.
- **Everything weaker becomes `[deep-test]`**: an A/B idea, never a rule. It also needs at least 16 reels where the feature is known. On the first real batch, 11 creator reels produced "dialogue hurts" while the two biggest hits were dialogue skits.
- **A flop teaches an "avoid" only when its coder found a real failure.** A blind watch of a 295-view dog-grooming reel found nothing wrong except a long end card. Some flops are about distribution (account size, timing), not the script, and a nitpick shouldn't be taught as the cause.
- **One correction across all groups.** Everyone, business and creator overlap and are reported together, so Benjamini-Hochberg runs once over every (group, feature) pair. On 12 fake runs with one planted effect, it was found in 35 of 36 groups. 3 noise lines got through in total (about 8% of lines, matching the 10% target). A plain p < 0.25 for test ideas had let up to 9 noise lines through per run.
- **Small niches are partially pooled.** A niche holds 4-8 reels, so its baseline leans on its kind's baseline (in log space, K = 4). Mixing views÷followers with raw views in one median was a real bug: it scored every follower-normalised reel at about 0.
- **The swipe-away line** needs at least 8 blind watches on each side, a gap of at least 2 seconds, and p < 0.01. On pure noise it fired once in 15 checks at p < 0.05.
- **Lines report "% of reels that beat their niche median, with vs without the feature".** Batches are picked from both extremes, so a raw median ratio blew up to fake 10,000x figures in the dry run.
- **The correction counts every feature tested (~40)**, not just the ones measurable in a batch. Otherwise a sparse batch let a random feature pass as a rule.
