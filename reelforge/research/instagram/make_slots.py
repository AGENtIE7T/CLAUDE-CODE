"""
Writes research/instagram/slots.tsv: the 200-reel (208) study plan, split
evenly between businesses and creators so the patterns work for everyone.
  business: 26 niches x 4 reels = 104
  creator:  13 niches x 8 reels = 104
Each niche asks for hits AND flops (a pattern only means something against
reels that didn't work). Fill reel_url, views and followers; leave the rest.
Run once: python3 research/instagram/make_slots.py (won't overwrite filled rows)
"""
import csv, json
from pathlib import Path

HERE = Path(__file__).parent
niches = json.loads((HERE.parent.parent / "lib" / "niches.json").read_text())
COLS = ["kind", "niche", "slot", "want", "reel_url", "views", "followers", "likes", "comments", "posted"]

plan = [("business", n["id"], 4) for n in niches["niches"]] + [("creator", n["id"], 8) for n in niches["creators"]]
out = HERE / "slots.tsv"
existing = {}
if out.exists():
    for r in csv.DictReader(out.open(), delimiter="\t"):
        existing[(r["kind"], r["niche"], r["slot"])] = r

with out.open("w", newline="") as f:
    w = csv.DictWriter(f, COLS, delimiter="\t")
    w.writeheader()
    for kind, niche, k in plan:
        for i in range(1, k + 1):
            want = "hit" if i <= (k + 1) // 2 + (1 if k == 8 else 0) else "flop"
            row = existing.get((kind, niche, str(i))) or {c: "" for c in COLS}
            row.update(kind=kind, niche=niche, slot=str(i), want=want)
            w.writerow(row)
print(f"wrote {out}: {sum(k for *_, k in plan)} slots")
