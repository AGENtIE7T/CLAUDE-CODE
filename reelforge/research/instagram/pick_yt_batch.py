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

with open(HERE / "yt_slots.tsv", "w", newline="") as f:
    w = csv.DictWriter(f, ["kind", "niche", "want", "video_id", "views", "niche_median", "title"], delimiter="\t", extrasaction="ignore")
    w.writeheader()
    for r in pick:
        w.writerow({**r, "niche_median": int(med[r["niche"]])})
print(len(pick), "picked:", sum(p["kind"] == "business" for p in pick), "business,", sum(p["kind"] == "creator" for p in pick), "creator")
