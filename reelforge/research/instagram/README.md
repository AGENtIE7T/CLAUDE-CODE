# Deep Instagram study (200 reels, business + creator)

One study for everyone: 104 business reels (4 in each of the 26 niches) and 104 creator reels (8 in each of the 13 creator niches). Every niche gets hits **and** flops, because a pattern only means something when you compare it against reels that didn't work.

## Steps
1. `python3 make_slots.py` writes `slots.tsv` (already done; re-running keeps filled rows).
2. Fill each row's `reel_url`, `views` and, if you can, `followers`. `12.5k` and `1.2M` are fine.
3. For each reel, run a video-watching model (Nexlev `watch_instagram_video_and_ask`) with `WATCH_PROMPT.md`. Save the JSON answer as `deep/<shortcode>.json`.
4. `python3 analyze_ig.py` writes `patterns_ig.json`.
5. `python3 ../build_patterns.py && node ../../artifact/build.mjs` merges the results into `lib/viral_patterns.json` and rebuilds the artifact. The JSON shape doesn't change, so no app code changes are needed.

## How it avoids fooling itself
- **Score = views ÷ followers**, when followers is known, then divided by that niche's median. A big account or a big niche can't fake a pattern.
- **Lift = median score with a feature ÷ median without it.** Lifts are pooled for everyone, for businesses only, and for creators only. One niche's 4–8 reels are too few for a lift, so a single niche only gets qualitative `[ig-seen]` lines.
- **A line only becomes a rule (`[ig-data]`)** when it has at least 8 reels on each side, a lift of at least 1.6x (or at most 0.6x), and a permutation p-value that survives a Benjamini-Hochberg correction at 10% across all ~40 features tested.
  - In a dry run with random data plus one planted effect, a plain p<0.05 cut-off produced 4 fake rules.
  - With the correction, only the planted effect came through.
- **Everything weaker becomes `[ig-test]`**: an A/B idea, never a rule.
