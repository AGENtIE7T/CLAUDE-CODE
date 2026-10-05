"""
Deep Instagram study -> research/instagram/patterns_ig.json

Inputs
  slots.tsv           reel_url + views (+ followers) per slot
  deep/<code>.json    the WATCH_PROMPT.md answer for each reel

Method
  score  = views / followers when followers is known, else views; then divided by
           the niche's median score, so a big niche can't drown a small one.
  lift   = median score WITH a feature / median WITHOUT, pooled per kind
           (business, creator) and across everyone.
  [ig-data] needs >= 8 reels each side, lift >= 1.6 or <= 0.6, AND a permutation
           p-value (shuffle the feature 2,000 times) that survives a
           Benjamini-Hochberg correction at 10% across all ~40 features tested.
           Without the correction, pure random test data produced fake "rules".
  [ig-test] the rest of the signals with lift >= 1.3 or <= 0.75 and p < 0.25.
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
        cand.append({"feature": name, "lift": round(lift, 2), "n_with": len(a), "n_without": len(b), "p": round(perm_p(a, b, lift), 3)})
    # Benjamini-Hochberg: largest rank k with p_k <= k/m * 0.10 sets the cut-off.
    ps = sorted(c["p"] for c in cand)
    cut = max([p for k, p in enumerate(ps, 1) if p <= k / len(ps) * 0.10], default=-1)
    out = []
    for c in cand:
        big = c["lift"] >= 1.6 or c["lift"] <= 0.6
        if big and c["n_with"] >= 8 and c["n_without"] >= 8 and c["p"] <= cut:
            out.append({**c, "tag": "ig-data"})
        elif (c["lift"] >= 1.3 or c["lift"] <= 0.75) and c["p"] < 0.25:
            out.append({**c, "tag": "ig-test"})
    return sorted(out, key=lambda x: (x["tag"] != "ig-data", -abs(math.log(x["lift"] or 1e-9))))


def line(l):
    verb = f"~{l['lift']}x the niche-normalised views of reels without it" if l["lift"] >= 1 else f"only {l['lift']}x the views of reels without it"
    return f"[{l['tag']}] Instagram: reels with {l['feature']} got {verb} (n={l['n_with']} vs {l['n_without']}, p={l['p']})."


def examples(group, best):
    g = sorted(group, key=lambda r: -r["score"] if best else r["score"])[:3]
    return [f'{r["d"].get("reusable_pattern", "")} ({int(r["views"]):,} views, IG)' for r in g if r["d"].get("reusable_pattern")]


kinds = {k: [r for r in rows if r["kind"] == k] for k in ("business", "creator")}
res = {
    "reels": len(rows),
    "by_kind": {k: len(v) for k, v in kinds.items()},
    "everyone": [line(l) for l in lifts(rows)],
    "business": [line(l) for l in lifts(kinds["business"])],
    "creator": [line(l) for l in lifts(kinds["creator"])],
    "niches": {},
}
for (kind, niche), _ in by_niche.items():
    g = [r for r in rows if r["niche"] == niche]
    if len(g) >= 2:
        res["niches"][niche] = {
            "do": [f'[ig-seen] {r["d"]["reusable_pattern"]}' for r in sorted(g, key=lambda r: -r["score"])[:2] if r["d"].get("reusable_pattern")],
            "winning": examples(g, True)[:2],
            "flops": examples(g, False)[:1],
        }
(HERE / "patterns_ig.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
print(f"{len(rows)} reels analysed ({res['by_kind']}); lines: everyone {len(res['everyone'])}, business {len(res['business'])}, creator {len(res['creator'])}; niches {len(res['niches'])}")
