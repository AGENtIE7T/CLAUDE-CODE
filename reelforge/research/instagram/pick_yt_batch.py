"""
Batch 1 of the deep study: 50 YouTube Shorts already in the research data
(they have real view counts, so no search calls are wasted). 25 business
reels, one per business niche, alternating hit/flop; 25 creator-style reels
(vlogs, skits, hauls, journeys), 13 hits + 12 flops, max 2 hits and
2 flops per niche so one format can't dominate. Each reel's score is
its views / that niche's median views across all collected Shorts.
Writes instagram/yt_slots.tsv.
"""
import csv, glob, re, statistics as st
from pathlib import Path

HERE = Path(__file__).parent
rows, seen = [], set()
for f in sorted(glob.glob(str(HERE.parent / "round*.tsv"))):
    for r in csv.DictReader(open(f), delimiter="\t"):
        if r["video_id"] in seen or not r.get("views", "").isdigit():
            continue
        seen.add(r["video_id"]); r["views"] = int(r["views"]); rows.append(r)

med = {n: st.median([r["views"] for r in rows if r["niche"] == n]) for n in {r["niche"] for r in rows}}
CREATOR = re.compile(r"\b(vlog|minivlog|haul|pov|comedy|funny|skit|students vs|that one|my first|my \d|i (did|tried|bought|scored)|day ?\d+|ep-?\d+|part\.? ?\d|progress|journey|challenge|reaction)\b", re.I)
SHOP = re.compile(r"(wholesale|market|shop|store|showroom|price list|rate|manufacturer|factory|contact|address)", re.I)

creator = [r for r in rows if CREATOR.search(r["title"]) and not SHOP.search(r["title"])]
business = [r for r in rows if r not in creator]
cids = set()
pick = []
srt = sorted(creator, key=lambda r: r["views"] / med[r["niche"]])


def capped(order, k, per_niche=2):
    out, count = [], {}
    for r in order:
        if count.get(r["niche"], 0) < per_niche and r["video_id"] not in cids:
            out.append(r); count[r["niche"]] = count.get(r["niche"], 0) + 1
            if len(out) == k:
                break
    return out


for want, group in (("hit", capped(srt[::-1], 13)), ("flop", capped(srt, 12))):
    for r in group:
        pick.append({**r, "kind": "creator", "want": want}); cids.add(r["video_id"])
for i, n in enumerate(sorted(med)):
    g = sorted([r for r in business if r["niche"] == n and r["video_id"] not in cids], key=lambda r: r["views"])
    if len(pick) >= 50 or not g:
        continue
    want = "hit" if i % 2 == 0 else "flop"
    r = g[-1] if want == "hit" else g[min(2, len(g) - 1)]
    pick.append({**r, "kind": "business", "want": want})

# Hand review of the 50 picks (titles + transcripts): the regex split put some
# reels on the wrong side. kind = who the lesson is for (a business posting
# about itself vs a person/creator).
KIND_OVERRIDES = {
    "42qer-f2FBQ": ("creator", "forwarded-joke doctor skit, not a clinic's own reel"),
    "gtk8KvbXcZg": ("creator", "comedy channel skit"),
    "3g7YXCG-3IY": ("creator", "personal weight-loss montage"),
    "JxWrZv1g7MM": ("creator", "Korean kids trying a head massage: a creator video"),
    "cz-88P-QQc0": ("business", "a mechanic explaining his own workshop job"),
}
# ReelForge niche each creator lesson feeds (business rows keep their niche).
CREATOR_NICHE = {
    "RqA-0IX0DKc": "c_beauty_fashion", "1IvRkuzZXs8": "c_finance", "BK497h7lJvs": "c_comedy",
    "T2OEqGXebLM": "c_comedy", "S9zv4HQSqdU": "c_education", "mGVq0ULuyqA": "c_fitness",
    "qWTeQeui2T8": "c_beauty_fashion", "479195lfYeQ": "c_fitness", "19nH4sVfqwc": "c_beauty_fashion",
    "Kl2qMXXWP60": "c_music_dance", "bZHZuzwt6sU": "c_comedy", "pRCd1TrZpWY": "c_comedy",
    "IRYmRTYlSag": "c_lifestyle", "fGhZ3kSTjzQ": "c_comedy", "1Bsrmhjlud4": "c_comedy",
    "1ulsq4rRf3Q": "c_comedy", "qCePVFRPQz8": "c_motivation", "OJkkW0m85tI": "c_lifestyle",
    "x-zfV8cMVfw": "c_education", "E6Sj6gYiw68": "c_education", "ucJr66foT4w": "c_beauty_fashion",
    "uIoDuoyYBMo": "c_lifestyle", "yHJ08miFRo4": "c_lifestyle", "UmExGFoYCh4": "c_fitness",
    "42qer-f2FBQ": "c_comedy", "gtk8KvbXcZg": "c_comedy", "3g7YXCG-3IY": "c_fitness", "JxWrZv1g7MM": "c_travel",
}

with open(HERE / "yt_slots.tsv", "w", newline="") as f:
    w = csv.DictWriter(f, ["kind", "niche", "target_niche", "want", "video_id", "views", "niche_median", "title", "kind_note"], delimiter="\t", extrasaction="ignore")
    w.writeheader()
    for r in pick:
        kind, note = KIND_OVERRIDES.get(r["video_id"], (r["kind"], ""))
        target = CREATOR_NICHE.get(r["video_id"], r["niche"]) if kind == "creator" else r["niche"]
        w.writerow({**r, "kind": kind, "target_niche": target, "kind_note": note, "niche_median": int(med[r["niche"]])})
print(len(pick), "picked (before hand overrides):", sum(p["kind"] == "business" for p in pick), "business,", sum(p["kind"] == "creator" for p in pick), "creator")
