"""
Deep Instagram study -> research/instagram/patterns_ig.json

Inputs
  slots.tsv           Instagram: reel_url + views (+ followers) per slot
  yt_slots.tsv        YouTube Shorts batch: video_id + views + niche_median
  deep/<id>.json      the WATCH_PROMPT.md answer for each reel (IG shortcode
                      or YouTube video id)

Method
  score  = views / followers when followers is known, else views; then divided by
           the niche's median score, so a big niche can't drown a small one.
           YouTube rows use views / the niche's median over all ~1,169
           collected Shorts. Both platforms are pooled.
  lift   = median score WITH a feature / median WITHOUT, pooled per kind
           (business, creator) and across everyone.
  [deep-data] needs >= 8 reels each side, lift >= 1.6 or <= 0.6, AND a permutation
           p-value (shuffle the feature 2,000 times) that survives a
           Benjamini-Hochberg correction at 10% across all ~40 features tested.
           Without the correction, pure random test data produced fake "rules".
  Lines report the share of reels that beat their niche median (with vs
  without the feature), because hit/flop batches make raw ratios meaningless.
  [deep-test] the rest of the signals with lift >= 1.3 or <= 0.75 and p < 0.25.
Run: python3 research/instagram/analyze_ig.py
"""
import csv, json, math, random, re, statistics as st
from pathlib import Path

HERE = Path(__file__).parent
code = lambda url: (re.search(r"/(?:reel|reels|p)/([A-Za-z0-9_-]+)", url or "") or [None, None])[1]
num = lambda s: float(re.sub(r"[^\d.]", "", s) or 0) * (1e6 if "m" in s.lower() else 1e3 if "k" in s.lower() else 1) if s else 0

rows = []
for r in csv.DictReader((HERE / "slots.tsv").open(), delimiter="\t"):
    c = code(r["reel_url"])
    f = HERE / "deep" / f"{c}.json"
    if not c or not f.exists() or not num(r["views"]):
        continue
    d = json.loads(f.read_text())
    views, fol = num(r["views"]), num(r["followers"])
    rows.append({**r, "code": c, "d": d, "views": views, "raw": views / fol if fol else views})

by_niche = {}
for r in rows:
    by_niche.setdefault((r["kind"], r["niche"]), []).append(r["raw"])
for r in rows:
    r["score"] = r["raw"] / (st.median(by_niche[(r["kind"], r["niche"])]) or 1)
    r["platform"] = "instagram"

yt = HERE / "yt_slots.tsv"
if yt.exists():
    for r in csv.DictReader(yt.open(), delimiter="\t"):
        f = HERE / "deep" / f'{r["video_id"]}.json'
        if f.exists():
            views = float(r["views"])
            rows.append({**r, "code": r["video_id"], "d": json.loads(f.read_text()), "views": views, "score": views / (float(r["niche_median"]) or 1), "platform": "youtube"})
            by_niche.setdefault((r["kind"], r["niche"]), [])

FEATURES = {
    "a number in the first 2 seconds": lambda d: d.get("number_in_hook") is True,
    "speech in the first 2 seconds": lambda d: bool((d.get("spoken_first_2s") or "").strip()),
    "on-screen text in the first frame": lambda d: bool((d.get("on_screen_text_first_frame") or "").strip()),
    "a face in the first frame": lambda d: d.get("first_frame") == "face",
    "the result/product in the first frame": lambda d: d.get("first_frame") == "product_or_result",
    "motion in the first frame": lambda d: d.get("first_frame") == "action_in_motion",
    "3+ cuts in the first 5 seconds": lambda d: (d.get("cuts_first_5s") or 0) >= 3,
    "no speech at all (music + text)": lambda d: d.get("speech") == "none",
    "talking to camera": lambda d: d.get("speech") == "to_camera",
    "trending/known audio": lambda d: d.get("audio") == "trending_or_known_song",
    "a series marker (Part/EP/Day N)": lambda d: d.get("series_marker") is True,
    "a payoff in the last 3 seconds": lambda d: d.get("payoff_in_last_3s") is True,
    "2+ people on screen": lambda d: (d.get("people_on_screen") or 0) >= 2,
    "under 15 seconds": lambda d: (d.get("length_sec") or 99) < 15,
    "over 45 seconds": lambda d: (d.get("length_sec") or 0) > 45,
    "no CTA": lambda d: d.get("cta") == "none",
    "a comment CTA": lambda d: d.get("cta") == "comment",
    "a follow CTA": lambda d: d.get("cta") == "follow",
}
for k in ["skit", "pov", "tutorial", "before_after", "listicle", "story", "reveal", "vlog", "review", "talking_head", "process", "behind_the_scenes"]:
    FEATURES[f"the {k.replace('_', ' ')} format"] = lambda d, k=k: d.get("format") == k
for k in ["question", "pain_callout", "pov", "that_one_archetype", "x_vs_y", "number_claim", "myth_bust", "reveal", "warning", "challenge", "story_open", "no_hook"]:
    FEATURES[f"a {k.replace('_', ' ')} hook"] = lambda d, k=k: d.get("hook_style") == k


def perm_p(a, b, lift, rounds=2000):
    pool, k, obs = a + b, len(a), abs(math.log(lift or 1e-9))
    rng = random.Random(7)
    hits = 0
    for _ in range(rounds):
        rng.shuffle(pool)
        l = st.median(pool[:k]) / (st.median(pool[k:]) or 1e-9)
        hits += abs(math.log(l or 1e-9)) >= obs
    return (hits + 1) / (rounds + 1)


def lifts(group):
    cand = []
    for name, fn in FEATURES.items():
        a = [r["score"] for r in group if fn(r["d"])]
        b = [r["score"] for r in group if not fn(r["d"])]
        if len(a) < 4 or len(b) < 4:
            continue
        lift = st.median(a) / (st.median(b) or 1e-9)
        beat = lambda xs: round(100 * sum(x > 1 for x in xs) / len(xs))
        cand.append({"feature": name, "lift": round(lift, 2), "n_with": len(a), "n_without": len(b), "p": round(perm_p(a, b, lift), 3), "beat_with": beat(a), "beat_without": beat(b)})
    # Benjamini-Hochberg: largest rank k with p_k <= k/m * 0.10 sets the cut-off.
    # m = every feature we could have tested, not just the measurable ones,
    # otherwise a sparse batch makes the correction too lenient.
    ps, m = sorted(c["p"] for c in cand), len(FEATURES)
    cut = max([p for k, p in enumerate(ps, 1) if p <= k / m * 0.10], default=-1)
    out = []
    for c in cand:
        big = c["lift"] >= 1.6 or c["lift"] <= 0.6
        if big and c["n_with"] >= 8 and c["n_without"] >= 8 and c["p"] <= cut:
            out.append({**c, "tag": "deep-data"})
        elif (c["lift"] >= 1.3 or c["lift"] <= 0.75) and c["p"] < 0.25:
            out.append({**c, "tag": "deep-test"})
    return sorted(out, key=lambda x: (x["tag"] != "deep-data", -abs(math.log(x["lift"] or 1e-9))))


def line(l):
    # Report "share that beat the niche median", not the raw median ratio: the
    # batches are picked from both extremes (hits and flops), which blows the
    # ratio up to meaningless 1,000x+ figures.
    return (f"[{l['tag']}] Deep watch: {l['beat_with']}% of reels with {l['feature']} beat their niche's median views, "
            f"vs {l['beat_without']}% without it (n={l['n_with']} vs {l['n_without']}, p={l['p']}).")


def examples(group, best):
    g = sorted(group, key=lambda r: -r["score"] if best else r["score"])[:3]
    return [f'{r["d"].get("reusable_pattern", "")} ({int(r["views"]):,} views, {"IG" if r["platform"] == "instagram" else "YT"})' for r in g if r["d"].get("reusable_pattern")]


def failure_lines(group, label):
    """Where reels go wrong: the most common failure modes among the bottom
    half of reels, compared with the top half."""
    if len(group) < 8:
        return []
    g = sorted(group, key=lambda r: r["score"])
    low, high = g[: len(g) // 2], g[len(g) // 2 :]
    out = []
    for mode in sorted({r["d"].get("failure_mode") for r in low} - {None, "none"}):
        a = sum(r["d"].get("failure_mode") == mode for r in low)
        b = sum(r["d"].get("failure_mode") == mode for r in high)
        if a >= 3 and a >= 2 * b:
            ex = next(r["d"].get("what_goes_wrong") for r in low if r["d"].get("failure_mode") == mode)
            out.append(f'[deep-seen] Where {label} reels go wrong: "{mode.replace("_", " ")}" showed up in {a} of the {len(low)} weakest reels vs {b} of the {len(high)} strongest. Example: {ex}')
    swipe_low = [r["d"].get("swipe_risk_sec") for r in low if isinstance(r["d"].get("swipe_risk_sec"), (int, float))]
    swipe_high = [r["d"].get("swipe_risk_sec") for r in high if isinstance(r["d"].get("swipe_risk_sec"), (int, float))]
    if len(swipe_low) >= 4 and len(swipe_high) >= 4:
        out.append(f"[deep-seen] Typical swipe-away point: second {st.median(swipe_low):g} in the weakest {label} reels vs second {st.median(swipe_high):g} in the strongest. Fix the moment before it.")
    return out


kinds = {k: [r for r in rows if r["kind"] == k] for k in ("business", "creator")}
res = {
    "reels": len(rows),
    "by_kind": {k: len(v) for k, v in kinds.items()},
    "by_platform": {p: sum(r["platform"] == p for r in rows) for p in ("instagram", "youtube")},
    "everyone": [line(l) for l in lifts(rows)] + failure_lines(rows, "all"),
    "business": [line(l) for l in lifts(kinds["business"])] + failure_lines(kinds["business"], "business"),
    "creator": [line(l) for l in lifts(kinds["creator"])] + failure_lines(kinds["creator"], "creator"),
    "niches": {},
}
for niche in sorted({r["niche"] for r in rows}):
    g = [r for r in rows if r["niche"] == niche]
    if len(g) >= 2:
        res["niches"][niche] = {
            "do": [f'[deep-seen] {r["d"]["reusable_pattern"]}' for r in sorted(g, key=lambda r: -r["score"])[:2] if r["d"].get("reusable_pattern")],
            "winning": examples(g, True)[:2],
            "flops": examples(g, False)[:1],
            "avoid": [f'[deep-seen] {r["d"]["what_goes_wrong"]}' for r in sorted(g, key=lambda r: r["score"])[:2] if r["d"].get("what_goes_wrong")],
        }
(HERE / "patterns_ig.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
print(f"{len(rows)} reels analysed ({res['by_kind']}); lines: everyone {len(res['everyone'])}, business {len(res['business'])}, creator {len(res['creator'])}; niches {len(res['niches'])}")
