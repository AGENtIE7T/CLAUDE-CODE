# Viral pattern research: 1,169 Indian Shorts, 25 niches

## What was studied
- **1,169 unique YouTube Shorts** (Indian region, sorted by views) across **25 niches**.
  - Rounds 1–2: the original 12 niches, 2 searches each. One broad (e.g. "salon makeup transformation"), one local-shop angle in Hinglish (e.g. "parlour bridal makeup price kitna").
  - Rounds 3–4: 13 new niches (pet care, travel, interior, photography, mobile repair, events, tailor, spa/wellness, optician, kirana/grocery, driving school, dance/music, laundry), 1–2 searches each.
  - Driving school, dance/music and laundry got 1 search each. Printing/packaging got none, so it has a playbook but no research lines yet. Nexlev's free tier hit its weekly cap (50 calls).
- **Title + view count** for every video (`round*.tsv`).
- **Transcripts** of 20 top or flop videos; 13 had usable speech. Nexlev's free tier allows 2 bulk transcript calls a day.

## Method (`analyze.py`)
1. Each title is tagged with 14 hook/format features by regex: price-in-hook, transformation, process, warning/scam, myth/truth, number list, place name, famous/legacy, shock words, comedy, satisfying, contact, question, owner/client story.
2. **Lift** = median views of videos with the feature ÷ median without. It is computed **inside each search batch** (minimum 4 videos each side), so a feature isn't credited just because one query found bigger channels. A first pass without this control produced fake 100–1000x lifts that flipped once controlled.
3. **Confidence:** "medium" = at least 8 videos and lift ≥2x or ≤0.5x. Everything else is "low", and only used as `[test]` ideas.

## Findings that held up (medium confidence)
| Niche | Pattern | Within-search lift | n |
|---|---|---|---|
| Real estate | Price in the first line | ~7.1x | 26 |
| Sweets/bakery | Showing the making process | ~14.6x | 14 |
| Clinic | Myth/truth framing | ~8.3x | 16 |
| Wholesale | Rate-per-unit up front | ~4.8x | 11 |
| Clinic | "Best clinic in <city>" brochure titles | 0.31x | 12 |
| Restaurant | Leaning on "famous / king of" | 0.12x | 8 |
| Salon | Leaning on the word "transformation" | 0.26x | 20 |
| Gym | Vague "transformation" label | 0.21x | 20 |
| Home services | "Dirty AC cleaning / satisfying" label | ~0.01x | 18 |
| Jewellery | "How it's made" process | 0.28x | 9 |
| Auto | City name instead of car/result | 0.13x | 9 |
| Interior | Price in the hook | ~4.4x | 13 |
| Interior | City name instead of price/result | 0.29x | 9 |
| Grocery | Owner-style question ("kitna kama leta?") | ~2.9x | 14 |
| Grocery | "Sabse sasta / loot" with no figure | 0.01x | 21 |
| Photography | Generic "behind the scenes" title | 0.06x | 18 |
| Optician | Factory "how lenses are made" | 0.1x | 9 |

**Hashtags:** a first-pass "4+ hashtags hurt" signal did not hold across 25 niches and was dropped.

**The cross-niche read:** a specific number or stake beats a category label. "Transformation", "famous", "dirty AC" and "best in city" are saturated. The winners add the twist: "DSP bride", "100-year-old AC", "135 kg to 63 kg", "2BHK for ₹6 lakh".

## From transcripts (qualitative)
- **Wholesale, 16M:** a 10-second clip with the per-unit price in the first line ("1,100 mein 10 jodi"), then "follow for the address".
- **Wholesale, 1.7M:** an insider rant to shop owners ("25 saal ka experience… sasta maal sirf patri pe chalta hai").
- **Salon, 5.8M:** exact year-by-year prices. Salon, 55k: a "why bridal costs ₹25k" backstage story.
- **Fashion, 55M:** a bargaining skit in a Surat shop, about 15 seconds.
- **Restaurant, 2.3M:** opens on the unique method plus the ₹60 unlimited thali.
- **Music-only, no speech:** many top transformation videos (groom 16M, gym client 2.3M, kaju katli 24M).
- **Flops:** a pity hook ("views nahi aa rahe… comment karo"), a "Hello doston, day six" vlog opener, 3-minute walkthroughs.

## Caveats (read before trusting any number)
- **Correlational, not causal.** A title isn't the hook, and the thumbnail and first frame weren't seen.
- **Biased sample.** Search "sort by views" over-samples big creators and old viral hits.
- **YouTube Shorts stand in for Instagram Reels.** The patterns usually transfer, but not always.
- **Small groups.** Low-confidence findings (n<8) are labelled `[test]` and are never rules.

## How ReelForge uses this
`build_patterns.py` writes `lib/viral_patterns.json`, which holds per-niche do/avoid lines tagged `[data]`/`[seen]`/`[test]`, plus real top and flop examples.
- The **generator** gets only the selected niche's block under `# VIRAL PATTERNS`.
- The **critic** gets the same block and docks points for leaning on a saturated pattern.

The research is the starting prior. **Your own data overrides it.** `lib/learning.ts` adds your posted-reel results (computed insights per niche, once 3+ are logged), your 👍/👎 hooks with notes, and saved client learnings. The prompt tells the model your data wins when the two disagree.

## Next: a deep Instagram study
`instagram/` holds a 208-reel plan (104 business, 104 creator, hits and flops in every niche), the watch prompt, and a stricter analyzer (permutation test + false-discovery correction). It is waiting on a data source: Instagram is blocked from this environment and Nexlev's free tier resets on 2026-10-11. See `instagram/README.md`.

Re-run anytime: `python3 research/analyze.py && python3 research/build_patterns.py && node artifact/build.mjs`.
