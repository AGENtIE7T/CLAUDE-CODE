"""
Deep-watch study -> research/instagram/patterns_ig.json

Inputs
  slots.tsv           Instagram: reel_url + views (+ followers) per slot
  yt_slots.tsv        YouTube Shorts batch: video_id + views + niche_median,
                      kind and target_niche after hand review
  deep/<id>.json      one coded reel (IG shortcode or YouTube video id):
                        evidence "watch"      a blind full watch (WATCH_PROMPT.md)
                        evidence "transcript" coded from a timestamped
                                              transcript by code_transcripts.py

Method
  score  = views / followers when followers is known, else views; then divided by
           the baseline of the same niche measured the same way (with or without
           followers), partially pooled towards the kind's baseline because a
           niche holds only 4-8 reels. YouTube rows use views / the niche's
           median over all ~1,169 collected Shorts.
           Both platforms are pooled.
  Features return True / False / None. None means unknown and the reel is left
  out of that comparison (a transcript can't see the first frame; a full
  watch can).
  Judgement fields (format, hook, payoff, failure mode, swipe second...) only
  count from blind full watches. Transcript notes were written knowing each
  reel's views, so they appear only as labelled qualitative lines.
  lift   = median score WITH a feature / median WITHOUT, pooled per kind
           (business, creator) and across everyone.
  [deep-data] needs >= 8 reels each side, lift >= 1.6 or <= 0.6, AND a permutation
           p-value (shuffle the feature 2,000 times) that survives a
           Benjamini-Hochberg correction at 10% across every feature defined.
           Without the correction, pure random test data produced fake "rules".
  Lines report the share of reels that beat their niche median (with vs
  without the feature), because hit/flop batches make raw ratios meaningless.
  [deep-test] the rest of the signals with lift >= 1.3 or <= 0.75, p < 0.25 and
           at least 16 reels where the feature is known.
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
    views, fol = num(r["views"]), num(r["followers"])
    rows.append({**r, "code": c, "d": json.loads(f.read_text()), "views": views, "raw": views / fol if fol else views,
                 "has_fol": bool(fol), "platform": "instagram", "target_niche": r["niche"], "title": ""})

# views/followers and raw views are different units: normalise each only
# against reels measured the same way. A niche holds only 4-8 reels, so its
# baseline is partially pooled (in log space) towards the baseline of all
# reels of that kind: log b = (n*log niche_median + K*log kind_median)/(n + K).
# With K = 4 a 4-reel niche counts half; a single reel can't set its own bar.
K = 4
logmed = lambda xs: st.median([math.log(max(x, 1e-9)) for x in xs])
groups, kind_pool = {}, {}
for r in rows:
    groups.setdefault((r["kind"], r["niche"], r["has_fol"]), []).append(r["raw"])
    kind_pool.setdefault((r["kind"], r["has_fol"]), []).append(r["raw"])
for r in rows:
    g, pool = groups[(r["kind"], r["niche"], r["has_fol"])], kind_pool[(r["kind"], r["has_fol"])]
    base = (len(g) * logmed(g) + K * logmed(pool)) / (len(g) + K)
    r["score"] = max(r["raw"], 1e-9) / math.exp(base)

yt = HERE / "yt_slots.tsv"
if yt.exists():
    for r in csv.DictReader(yt.open(), delimiter="\t"):
        f = HERE / "deep" / f'{r["video_id"]}.json'
        if f.exists():
            views = float(r["views"])
            rows.append({**r, "code": r["video_id"], "d": json.loads(f.read_text()), "views": views,
                         "score": views / (float(r["niche_median"]) or 1), "platform": "youtube",
                         "target_niche": r.get("target_niche") or r["niche"]})


def blind(d):
    return d.get("evidence", "watch") == "watch"


def note(d, key):
    """A judgement field: top level for full watches, under notes otherwise."""
    return d[key] if key in d else (d.get("notes") or {}).get(key)


def watch_only(fn):
    return lambda r: fn(r["d"]) if blind(r["d"]) else None


def first_line(r):
    s = r["d"].get("spoken_first_2s")
    return None if s is None else s.strip()


NUMBER = re.compile(r"\d")
QUESTION = re.compile(r"\?|\b(kya|kitna|kitne|kitni|kaise|kyun|kyon|kaun|why|what|how|which)\b|क्या|कितन|कैसे|क्यों|कौन", re.I)
INTRO = re.compile(r"assalam|namaste|namaskar|\bhello\b|\bhi guys|\bhey guys|doston?|welcome|aaj main|aaj hum|is video|this video"
                   r"|इस वीडियो|आज मैं|आज हम|दोस्तों|दोस्तो|नमस्ते|नमस्कार|अस्सलाम|हेलो|वेलकम", re.I)
SERIES = re.compile(r"\b(day|ep|episode|part)\s*[-.]?\s*\d+", re.I)


def text_feature(rx):
    def fn(r):
        s = first_line(r)
        return None if s is None else bool(rx.search(s))
    return fn


def speech_is(*values):
    def fn(r):
        sp = r["d"].get("speech")
        return None if sp is None else sp in values
    return fn


def length(pred):
    def fn(r):
        n = r["d"].get("length_sec")
        return None if not isinstance(n, (int, float)) else pred(n)
    return fn


# Works for full watches and transcripts alike.
FEATURES = {
    "speech in the first 2 seconds": lambda r: None if first_line(r) is None else bool(first_line(r)),
    "a number in the first spoken line": text_feature(NUMBER),
    "a question in the first spoken line": text_feature(QUESTION),
    "a greeting or 'in this video...' opener": text_feature(INTRO),
    "dialogue between 2+ voices": speech_is("dialogue"),
    "no speech at all (music + visuals)": speech_is("none"),
    "a series marker (Part/EP/Day N)": lambda r: bool(r["d"].get("series_marker") or SERIES.search(r.get("title", ""))),
    "under 15 seconds": length(lambda n: n < 15),
    "over 45 seconds": length(lambda n: n > 45),
    "no CTA": lambda r: None if r["d"].get("cta") is None else r["d"]["cta"] == "none",
}
# Only a full watch can see these, and only a blind coder may judge them.
WATCH = {
    "a number in the first 2 seconds (spoken or on screen)": lambda d: d.get("number_in_hook") is True,
    "on-screen text in the first frame": lambda d: bool((d.get("on_screen_text_first_frame") or "").strip()),
    "a face in the first frame": lambda d: d.get("first_frame") == "face",
    "the result/product in the first frame": lambda d: d.get("first_frame") == "product_or_result",
    "motion in the first frame": lambda d: d.get("first_frame") == "action_in_motion",
    "3+ cuts in the first 5 seconds": lambda d: (d.get("cuts_first_5s") or 0) >= 3,
    "talking to camera": lambda d: d.get("speech") == "to_camera",
    "trending/known audio": lambda d: d.get("audio") == "trending_or_known_song",
    "a payoff in the last 3 seconds": lambda d: d.get("payoff_in_last_3s") is True,
    "2+ people on screen": lambda d: (d.get("people_on_screen") or 0) >= 2,
    "a comment CTA": lambda d: d.get("cta") == "comment",
    "a follow CTA": lambda d: d.get("cta") == "follow",
}
for k in ["skit", "pov", "tutorial", "before_after", "listicle", "story", "reveal", "vlog", "review", "talking_head", "process", "behind_the_scenes"]:
    WATCH[f"the {k.replace('_', ' ')} format"] = lambda d, k=k: d.get("format") == k
for k in ["question", "pain_callout", "pov", "that_one_archetype", "x_vs_y", "number_claim", "myth_bust", "reveal", "warning", "challenge", "story_open", "no_hook"]:
    WATCH[f"a {k.replace('_', ' ')} hook"] = lambda d, k=k: d.get("hook_style") == k
FEATURES.update({name: watch_only(fn) for name, fn in WATCH.items()})


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
        vals = [(fn(r), r["score"]) for r in group]
        a = [s for v, s in vals if v is True]
        b = [s for v, s in vals if v is False]
        if len(a) < 4 or len(b) < 4:
            continue
        lift = st.median(a) / (st.median(b) or 1e-9)
        beat = lambda xs: round(100 * sum(x > 1 for x in xs) / len(xs))
        cand.append({"feature": name, "lift": round(lift, 2), "n_with": len(a), "n_without": len(b), "p": round(perm_p(a, b, lift), 3), "beat_with": beat(a), "beat_without": beat(b)})
    # Benjamini-Hochberg: largest rank k with p_k <= k/m * 0.10 sets the cut-off.
    # m = every feature defined, not just the measurable ones, otherwise a
    # sparse batch makes the correction too lenient.
    ps, m = sorted(c["p"] for c in cand), len(FEATURES)
    cut = max([p for k, p in enumerate(ps, 1) if p <= k / m * 0.10], default=-1)
    out = []
    for c in cand:
        big = c["lift"] >= 1.6 or c["lift"] <= 0.6
        if big and c["n_with"] >= 8 and c["n_without"] >= 8 and c["p"] <= cut:
            out.append({**c, "tag": "deep-data"})
        elif (c["lift"] >= 1.3 or c["lift"] <= 0.75) and c["p"] < 0.25 and c["n_with"] + c["n_without"] >= 16:
            # Below 16 known reels a "test idea" is noise; on the first real
            # batch it produced "dialogue hurts creators" (n=5 vs 6) while the
            # two biggest hits were dialogue skits.
            out.append({**c, "tag": "deep-test"})
    return sorted(out, key=lambda x: (x["tag"] != "deep-data", -abs(math.log(x["lift"] or 1e-9))))


def line(l):
    # Report "share that beat the niche median", not the raw median ratio: the
    # batches are picked from both extremes (hits and flops), which blows the
    # ratio up to meaningless 1,000x+ figures.
    return (f"[{l['tag']}] Deep study: {l['beat_with']}% of reels with {l['feature']} beat their niche's median views, "
            f"vs {l['beat_without']}% without it (n={l['n_with']} vs {l['n_without']}, p={l['p']}).")


def views_tag(r):
    return f'{int(r["views"]):,} views, {"IG" if r["platform"] == "instagram" else "YT"}'


def failure_lines(group, label):
    """Where reels go wrong, from blind full watches only: failure modes that
    pile up in the weaker half, and the typical swipe-away second."""
    g = sorted([r for r in group if blind(r["d"])], key=lambda r: r["score"])
    if len(g) < 8:
        return []
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
    if len(swipe_low) >= 8 and len(swipe_high) >= 8:
        gap = st.median(swipe_high) - st.median(swipe_low)
        if gap >= 2 and diff_p(swipe_low, swipe_high, gap) < 0.01:
            out.append(f"[deep-seen] Typical swipe-away point: second {st.median(swipe_low):g} in the weakest {label} reels vs second {st.median(swipe_high):g} in the strongest. Fix the moment before it.")
    return out


def diff_p(a, b, gap, rounds=2000):
    """Permutation p-value for a gap in medians at least this large."""
    pool, k, rng, hits = a + b, len(a), random.Random(11), 0
    for _ in range(rounds):
        rng.shuffle(pool)
        hits += (st.median(pool[k:]) - st.median(pool[:k])) >= gap
    return (hits + 1) / (rounds + 1)


def reviewer_lines(group, label):
    """Failure modes from transcript reviews (not blind): reported as what the
    flops had in common, never as a statistic."""
    flops = [r for r in group if not blind(r["d"]) and r["score"] < 1 and note(r["d"], "failure_mode") not in (None, "none")]
    if len(flops) < 3:
        return []
    count = {}
    for r in flops:
        m = note(r["d"], "failure_mode")
        count[m] = count.get(m, 0) + 1
    top = sorted(count.items(), key=lambda kv: -kv[1])
    parts = ", ".join(f'{m.replace("_", " ")} ({n})' for m, n in top)
    ex = next(note(r["d"], "what_goes_wrong") for r in flops if note(r["d"], "failure_mode") == top[0][0])
    return [f"[deep-seen] Where {label} flops went wrong (reviewer read of {len(flops)} transcripts, not blind): {parts}. Example: {ex}"]


kinds = {k: [r for r in rows if r["kind"] == k] for k in ("business", "creator")}
res = {
    "reels": len(rows),
    "by_kind": {k: len(v) for k, v in kinds.items()},
    "by_platform": {p: sum(r["platform"] == p for r in rows) for p in ("instagram", "youtube")},
    "by_evidence": {e: sum(r["d"].get("evidence", "watch") == e for r in rows) for e in ("watch", "transcript")},
    "everyone": [line(l) for l in lifts(rows)] + failure_lines(rows, "all") + reviewer_lines(rows, "all"),
    "business": [line(l) for l in lifts(kinds["business"])] + failure_lines(kinds["business"], "business") + reviewer_lines(kinds["business"], "business"),
    "creator": [line(l) for l in lifts(kinds["creator"])] + failure_lines(kinds["creator"], "creator") + reviewer_lines(kinds["creator"], "creator"),
    "niches": {},
}
# Per niche: "do" only from reels that beat their niche median, "avoid" only
# from reels that didn't, so a flop is never taught as a "do".
for niche in sorted({r["target_niche"] for r in rows}):
    g = [r for r in rows if r["target_niche"] == niche]
    hits = sorted([r for r in g if r["score"] > 1], key=lambda r: -r["score"])
    flops = sorted([r for r in g if r["score"] < 1], key=lambda r: r["score"])
    v = {
        "do": [f'[deep-seen] {note(r["d"], "reusable_pattern")}' for r in hits[:2] if note(r["d"], "reusable_pattern")],
        "winning": [f'{note(r["d"], "reusable_pattern")} ({views_tag(r)})' for r in hits[:2] if note(r["d"], "reusable_pattern")],
        "flops": [f'{note(r["d"], "what_goes_wrong")} ({views_tag(r)})' for r in flops[:1] if note(r["d"], "what_goes_wrong")],
        "avoid": [f'[deep-seen] {note(r["d"], "what_goes_wrong")}' for r in flops[:2] if note(r["d"], "what_goes_wrong")],
    }
    if any(v.values()):
        res["niches"][niche] = v
(HERE / "patterns_ig.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
print(f"{len(rows)} reels analysed ({res['by_kind']}, {res['by_evidence']}); lines: everyone {len(res['everyone'])}, business {len(res['business'])}, creator {len(res['creator'])}; niches {len(res['niches'])}")
