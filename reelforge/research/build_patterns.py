"""
Turns research/patterns.json (quantitative) + transcript notes (qualitative)
into lib/viral_patterns.json, which ReelForge injects into the generator and
critic prompts for the selected niche only.

Guidance below is hand-curated from the analysis. Each line is tagged:
  [data]  medium-confidence within-search lift (n >= 8 videos)
  [seen]  seen in transcripts / top-vs-flop examples, not statistically tested
  [test]  low-confidence signal: write it as an A/B test, not a rule

Run: python3 research/build_patterns.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
data = json.loads((HERE / "patterns.json").read_text())

CROSS_NICHE = [
    "[data] A specific number in the first line beats an adjective. Price, quantity, kg, years or rupee-per-unit. Real estate (price in hook ~7x median views, n=26) and wholesale (~4.8x, n=11).",
    "[data] Generic category labels are saturated. Titles leaning on 'transformation' (salon 0.26x, gym 0.21x), 'dirty AC cleaning/satisfying' (home services ~0.01x, n=18), 'famous' (restaurant 0.12x) or 'best X in city' (clinic 0.31x) did worse than others found by the same search. The winners add a twist or a stake: 'DSP bride', '100-year-old AC', '135 kg to 63 kg', '2BHK for ₹6 lakh'.",
    "[seen] Many top transformation reels (groom makeover 16M, client fat-loss 2.3M, kaju katli making 24M) have no speech at all: music plus visual plus on-screen text. For visual niches a near-silent script is a valid choice. Let on-screen text carry the story.",
    "[seen] An insider truth that breaks a common belief travels well. A wholesaler's '25 saal ka experience… sasta maal sirf patri pe chalta hai' rant (1.7M), 'gold jewellery scam' (4.5M), doctor myth framing (clinic myth/truth ~8x, n=16).",
    "[seen] Real shop moments staged as a 15-second skit can explode. A bargaining skit in a Surat boutique ('Kitne ka hai? ₹15,000. ₹5,000. Pack kar.') got 55M.",
    "[seen] Flops share openers: pity begging ('video pe views nahi aa rahe… comment karo hum saath hain'), slow vlog intros ('Hello doston, welcome to day six'), and 3-minute walkthroughs with no stake in the first 2 seconds.",
    "[test] Titles with 4+ hashtags had lower median views in 7 of 12 niches. Keep 6-8 hashtags in the caption, not stuffed into the on-screen hook.",
]

NICHE = {
    "salon": {
        "do": [
            "[seen] Lead with a specific bride or client identity or twist, not the word 'transformation' ('DSP bride', 'village bride', 'groom makeover', 'mature skin'). Generic 'makeup transformation' titles were 0.26x in their own search [data].",
            "[seen] Price-transparency explainers work when they justify the price with backstage problems solved. 'Why bridal is ₹25k but party is ₹5k' told through one real wedding-day story (blouse loose, dupatta colour mismatch).",
            "[seen] Year-on-year price talk from a known artist got 5.8M. Concrete numbers ('2022 mein 40,000, ab 51,000') beat 'affordable'.",
            "[seen] Near-silent before/after with trending audio is a valid format. Keep on-screen text to the twist.",
        ],
        "avoid": ["[data] Leaning on the word 'transformation' alone", "[seen] Heavy filters on the reveal", "[test] A bare price-list post with no story (0.44x in the price search)"],
    },
    "restaurant": {
        "do": [
            "[seen] Open on the one thing only this place does ('dharti ke seene mein tadka', a flaming-leaf serve, superfast poha) plus the price-value ('unlimited thali ₹60'). That got 2.3M.",
            "[seen] Speed and skill close-ups of the cook (superfast poha 14M, cheese-burst omelette 13M) beat dish-name-only posts.",
            "[test] Relatable or comedic food skits did well where present (n=4). Test one per batch.",
        ],
        "avoid": ["[data] Leaning on 'famous'/'iconic'/'king of' without showing why (0.12x, n=8)", "[seen] Pity or 'please support' hooks", "[seen] Dark kitchen lighting"],
    },
    "gym": {
        "do": [
            "[seen] Exact numbers in the first frame: '135 kg to 63 kg', '2020 vs 2024', '6 months'. These carried most 5M+ videos. A vague 'transformation' label was 0.21x [data].",
            "[seen] A trainer's named client story ('My client Yash's fat loss', 2.3M) is mostly visual with music.",
            "[seen] Beginner-mistake hooks are crowded: dozens of 'galti mat karna' shorts got under 3k views. If you use one, make the mistake visual and specific, not a list.",
        ],
        "avoid": ["[seen] Generic 'beginner ho? ye galti mat karna' with no visual demo", "[seen] Only very muscular bodies (scares beginners)", "Any guaranteed kg or timeline claim"],
    },
    "clinic": {
        "do": [
            "[data] Myth/truth framing: 'X normal hai? Galat.', 'Biggest skincare myths in India'. About 8x within its own search (n=16).",
            "[seen] Transparent price explainers ('Braces cost in India', 'Implants starting ₹15,999'). 580k-3.4M.",
            "[seen] A procedure shown calmly on camera (RCT process 2.3M, aligner fitting 618k) builds trust without fear.",
        ],
        "avoid": ["[data] 'Best dental clinic in <city>' brochure titles (0.31x, n=12)", "Fear-bait, cure claims, before/after without consent"],
    },
    "coaching": {
        "do": [
            "[seen] Insider 'how marking really works' content (step marking 2.9M, 'secret rules teachers never tell' 2.8M).",
            "[seen] A concrete score target in the hook ('95+', '98%') plus a numbered method.",
            "[test] A student's before/after marks story (n=6, strong but low-confidence).",
        ],
        "avoid": ["[seen] Result banners with no teaching shown", "Guaranteed ranks or marks", "[seen] AI-tool gimmick hooks (300 views)"],
    },
    "real_estate": {
        "do": [
            "[data] Put the price in the first line. Price-in-hook videos had ~7x the median views of others in the same search (n=26). '2BHK for ₹6 lakh' got 3.9M; '₹21 lakh in Uttam Nagar' 1.4M.",
            "[seen] The price must feel surprising for the area (cheap for the city, or rent framed shockingly: '₹50 lakh per year rent').",
            "[test] A phone number or 'call' in the caption didn't hurt (n=6).",
        ],
        "avoid": ["[seen] Luxury spec-sheet titles with sq ft, tower names and no hook. Several got under 1,000 views", "Guaranteed-returns claims"],
    },
    "wholesale": {
        "do": [
            "[data] Rate-per-unit up front ('1,100 mein 10 jodi', '₹130 jeans', '₹120 saree'). About 4.8x within its own search (n=11). The Surat shoe factory video did it in 10 seconds and got 16M.",
            "[seen] Market or area names that buyers already know (Sadar Bazar, Gandhi Nagar, Surat, Khari Baoli) signal 'insider source'.",
            "[seen] Insider straight-talk to shop owners ('25 saal ka experience… 25,000 mein business? Kya aata hai?') builds B2B trust.",
        ],
        "avoid": ["[seen] Slow vlog openers ('Hello doston, day six of opening…', 37 views)", "[data] Generic factory-process content with no buyer angle (process 0.07x in wholesale market search)"],
    },
    "fashion": {
        "do": [
            "[seen] Shop-floor skits around bargaining or customer behaviour (55M). Comedy rooted in a real shop moment.",
            "[seen] Fabric or texture named in the title with elegant slow visuals ('tissue cotton saree', 29M).",
            "[seen] Ready-to-wear or 'ready in 5 seconds' convenience hooks (728k-17M).",
        ],
        "avoid": ["[seen] Bare 'Rs 199 offer' with no visual hook", "[seen] Long collection catalogue posts (most under 5k views)"],
    },
    "home_services": {
        "do": [
            "[seen] Extreme stakes on a specific unit ('100-year-old AC', 'my lungs hurt watching this', 16M) rather than 'dirty AC cleaning'.",
            "[seen] Fast, specific installation tricks ('how to clamp a faucet in a tight space', 19M) work when they look like expert skill, not a manual.",
        ],
        "avoid": ["[data] Generic 'dirty AC cleaning / satisfying' titles (~0.01x, n=18)", "[seen] 3-minute walkthroughs about labour charges", "Unsafe DIY electrical or gas steps"],
    },
    "sweets": {
        "do": [
            "[data] Show the making. Process videos had ~14.6x the median views within their own search (n=14). A halwai making kaju katli in bulk got 24M.",
            "[seen] Bulk or festive-scale production ('balushahi in bulk for Diwali', 1.4M) adds stakes.",
            "[test] A 'guess the price?' question on a showpiece cake (20M, n=4).",
        ],
        "avoid": ["[seen] 'Halwai jaisi mithai at home' recipe clones (most under 30k)", "Unbacked '100% pure' claims"],
    },
    "auto": {
        "do": [
            "[seen] A named car plus a visible result ('Baleno: dirt to dazzle', 3.8M; 'Fortuner touchless wash', 2.4M).",
            "[seen] Customer fear made specific ('Scared of scratches? Got PPF at HR26 Garage', 12M).",
            "[test] Question hooks about a symptom ('Is your car jerking?', n=6).",
        ],
        "avoid": ["[data] Leaning on a city name instead of a car/result hook (0.13x, n=9)", "[seen] Long Hindi repair tutorials (mostly under 1,000 views)", "Safety-risk DIY"],
    },
    "jewellery": {
        "do": [
            "[seen] Buyer-protection hooks: making-charge truth, GST maths, hallmark/HUID check ('0% making charges ka sach' 2.6M, 'gold jewellery scam' 4.5M, 'GST on gold' 19M).",
            "[seen] Weight-specific bridal sets ('full wedding set in just 50 grams', 989k) answer the real budget question.",
        ],
        "avoid": ["[data] 'How X jewellery is made' process content (0.28x, n=9)", "False purity or investment-return claims"],
    },
}


def examples(niche):
    n = data["niches"].get(niche, {})
    return {
        "winning": [f'{e["title"][:90]} ({e["views"]:,} views)' for e in n.get("top_examples", [])[:4]],
        "flops": [f'{e["title"][:90]} ({e["views"]:,} views)' for e in n.get("flop_examples", [])[:2]],
    }


out = {
    "source": f'{data["total_videos"]} Indian YouTube Shorts (top results by views across 2 searches per niche, collected 2026-10). Titles and view counts, plus 13 usable transcripts.',
    "caveats": "Correlational, not causal. Search results are biased toward already-popular videos and big creators; YouTube Shorts are a proxy for Instagram Reels. Treat [data] lines as strong defaults, [seen] as patterns worth using, [test] as A/B ideas.",
    "cross_niche": CROSS_NICHE,
    "niches": {k: {**v, **examples(k), "median_views": data["niches"].get(k, {}).get("median_views")} for k, v in NICHE.items()},
}
(ROOT / "lib" / "viral_patterns.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
print("wrote lib/viral_patterns.json:", ", ".join(out["niches"]))
