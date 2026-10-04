"""
Pattern analysis of 591 Indian YouTube Shorts across ReelForge's 12 niches.

Each title is tagged with hook/format features by regex. For every niche we
compare the median views of videos WITH a feature against those WITHOUT it
(lift), and the share of videos with 1M+ views (hit rate). Views are heavy
tailed, so medians (not means) are used throughout.

Run: python3 research/analyze.py   (writes research/patterns.json)
"""
import csv
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent

FEATURES = {
    "price_in_hook": r"(₹|\brs\.?\s?\d|\d+\s?/-|\blakh\b|\blakhs\b|\bcr\b|\bcrore|\bk\b|\bsirf\b|\bjust\b|\bonly\b|\bunder\b|\bstarting\b|\bcheapest\b|\bsasta|सस्ता|मात्र|\bprice\b|\bcost\b|\bcharges?\b|\brate\b)",
    "transformation": r"(transform|before|after|makeover|fat to fit|\bto\b.*\bto\b|dirt to|from .* to|\bvs\b|\d{4}\s?(➡️|vs|-)\s?\d{4}|\d+\s?kg)",
    "process_how_made": r"(how .* (made|make)|making|process|manufactur|kaise ban|banta|banana|behind the scenes|step.by.step|installation|fitting)",
    "warning_mistake_scam": r"(scam|don'?t|avoid|mistake|galti|beware|mat karna|stop|ignore mat|ripping|deceptive|warning|roko)",
    "myth_secret_truth": r"(myth|truth|secret|sach|reveal|exposed|nobody|no one tells|never tell|real reason|why )",
    "number_list": r"(\btop \d|\b\d+ (things|tips|ways|steps|signs|rules|hacks|myths|mistakes|sweets|wholesale|tricks)|\b\d+ (cheezein|galti))",
    "named_place": r"(delhi|mumbai|kolkata|gurgaon|gurugram|noida|pune|jaipur|surat|chandni chowk|sadar bazar|bangalore|bengaluru|hyderabad|chennai|indore|ludhiana|thane|dwarka|madurai|kerala|punjab|chandigarh|uttam nagar|karol bagh)",
    "famous_legacy": r"(famous|king of|oldest|iconic|legend|best .* in|biggest|world'?s|india'?s (first|biggest))",
    "shock_emoji_words": r"(😱|🤯|😳|shocking|shock|unbelievable|won'?t believe|insane|extreme|omg)",
    "comedy_relatable": r"(😂|🤣|funny|comedy|\bvs\b|pov|when the|reaction|drama|meme)",
    "satisfying_asmr": r"(satisfying|asmr|deep clean|super dirty|dirty)",
    "contact_in_title": r"(contact|call\b|call now|\b\d{10}\b|whatsapp|code[:\s-])",
    "question_hook": r"(\?|kya |kitna|kitne|kaise|how much|what happens)",
    "owner_or_client_story": r"(my client|client|owner|my story|day in|daily tasks|a day|work a day|vlog|journey)",
}
HIT = 1_000_000


def load():
    seen, rows = set(), []
    for name in ("round1.tsv", "round2a.tsv", "round2b.tsv"):
        with open(HERE / name, encoding="utf8") as f:
            for r in csv.DictReader(f, delimiter="\t"):
                if r["video_id"] in seen:
                    continue
                seen.add(r["video_id"])
                # One search query per niche per round: the batch is the unit of comparison,
                # so a feature isn't credited for the query that happened to find it.
                r["batch"] = f'{r["niche"]}:{"r1" if name == "round1.tsv" else "r2"}'
                r["views"] = int(r["views"])
                t = r["title"].lower()
                r["features"] = [k for k, rx in FEATURES.items() if re.search(rx, t)]
                r["hashtags"] = len(re.findall(r"#\w", r["title"]))
                rows.append(r)
    return rows


def med(xs):
    return statistics.median(xs) if xs else 0


def analyse(rows):
    by_niche = defaultdict(list)
    for r in rows:
        by_niche[r["niche"]].append(r)

    out = {"total_videos": len(rows), "hit_threshold": HIT, "niches": {}, "overall": {}}
    pooled = defaultdict(list)  # feature -> list of per-niche log-lift

    for niche, vids in sorted(by_niche.items()):
        views = [v["views"] for v in vids]
        n_med = med(views)
        feats = {}
        batches = defaultdict(list)
        for v in vids:
            batches[v["batch"]].append(v)
        for f in FEATURES:
            # Within-batch lifts (min 4 videos each side), combined by geometric mean.
            blifts, n_with = [], 0
            for bv in batches.values():
                bw = [v["views"] for v in bv if f in v["features"]]
                bwo = [v["views"] for v in bv if f not in v["features"]]
                if len(bw) >= 4 and len(bwo) >= 4 and med(bwo) > 0 and med(bw) > 0:
                    blifts.append(med(bw) / med(bwo))
                    n_with += len(bw)
            if not blifts:
                continue
            w = [v["views"] for v in vids if f in v["features"]]
            wo = [v["views"] for v in vids if f not in v["features"]]
            lift = statistics.geometric_mean(blifts)
            conf = "medium" if n_with >= 8 and (lift >= 2 or lift <= 0.5) else "low"
            feats[f] = {
                "n": n_with,
                "confidence": conf,
                "median_with": int(med(w)),
                "median_without": int(med(wo)),
                "lift": round(lift, 2) if lift else None,
                "hit_rate_with": round(sum(x >= HIT for x in w) / len(w), 2),
                "hit_rate_without": round(sum(x >= HIT for x in wo) / len(wo), 2),
            }
            if lift:
                pooled[f].append(lift)
        top = sorted(vids, key=lambda v: -v["views"])[:5]
        bottom = sorted(vids, key=lambda v: v["views"])[:3]
        heavy_tags = [v["views"] for v in vids if v["hashtags"] >= 4]
        light_tags = [v["views"] for v in vids if v["hashtags"] < 4]
        out["niches"][niche] = {
            "videos": len(vids),
            "median_views": int(n_med),
            "hit_rate": round(sum(x >= HIT for x in views) / len(views), 2),
            "features": dict(sorted(feats.items(), key=lambda kv: -(kv[1]["lift"] or 0))),
            "hashtag_spam": {"median_4plus_tags": int(med(heavy_tags)), "median_under_4": int(med(light_tags)), "n_4plus": len(heavy_tags)},
            "top_examples": [{"title": v["title"], "views": v["views"]} for v in top],
            "flop_examples": [{"title": v["title"], "views": v["views"]} for v in bottom],
        }

    for f, lifts in pooled.items():
        gm = statistics.geometric_mean(lifts)
        out["overall"][f] = {"niches_measured": len(lifts), "geo_mean_lift": round(gm, 2), "niches_positive": sum(l > 1 for l in lifts)}
    out["overall"] = dict(sorted(out["overall"].items(), key=lambda kv: -kv[1]["geo_mean_lift"]))
    return out


if __name__ == "__main__":
    res = analyse(load())
    (HERE / "patterns.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
    print(f"{res['total_videos']} videos")
    print("\nOVERALL (geo-mean of within-niche median lift):")
    for f, s in res["overall"].items():
        print(f"  {f:24s} lift {s['geo_mean_lift']:>5}  positive in {s['niches_positive']}/{s['niches_measured']} niches")
    for n, s in res["niches"].items():
        print(f"\n{n}: {s['videos']} videos, median {s['median_views']:,}, hit rate {s['hit_rate']}")
        for f, d in s["features"].items():
            print(f"   {'+' if d['lift']>=1 else '-'} {f:22s} lift {d['lift']} n={d['n']} [{d['confidence']}]")
        print(f"   hashtags 4+: median {s['hashtag_spam']['median_4plus_tags']:,} vs <4: {s['hashtag_spam']['median_under_4']:,}")
