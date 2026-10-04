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
    "[data] A specific number in the first line beats an adjective. Price, quantity, kg, years or rupee-per-unit. Real estate (price in hook ~7x median views, n=26), wholesale (~4.8x, n=11) and interior (~4.4x, n=13).",
    "[data] The number has to be specific and surprising. Bare 'sabse sasta / cheapest' claims with no figure flopped (grocery 0.01x, n=21). Price contrasts ('₹1 lakh vs ₹10 lakh kitchen') and exact budgets ('Manali ₹3,500') won.",
    "[seen] Owner-POV money talk travels: 'Dukan se kitna kama leta ho?' (2M), 'dry fruits margin reveal' (2.3M), 'mobile repair shop earning' (1.8M). Viewers love seeing inside a business.",
    "[data] Generic category labels are saturated. Titles leaning on 'transformation' (salon 0.26x, gym 0.21x), 'dirty AC cleaning/satisfying' (home services ~0.01x, n=18), 'famous' (restaurant 0.12x) or 'best X in city' (clinic 0.31x) did worse than others found by the same search. The winners add a twist or a stake: 'DSP bride', '100-year-old AC', '135 kg to 63 kg', '2BHK for ₹6 lakh'.",
    "[seen] Many top transformation reels (groom makeover 16M, client fat-loss 2.3M, kaju katli making 24M) have no speech at all: music plus visual plus on-screen text. For visual niches a near-silent script is a valid choice. Let on-screen text carry the story.",
    "[seen] An insider truth that breaks a common belief travels well. A wholesaler's '25 saal ka experience… sasta maal sirf patri pe chalta hai' rant (1.7M), 'gold jewellery scam' (4.5M), doctor myth framing (clinic myth/truth ~8x, n=16).",
    "[seen] Real shop moments staged as a 15-second skit can explode. A bargaining skit in a Surat boutique ('Kitne ka hai? ₹15,000. ₹5,000. Pack kar.') got 55M.",
    "[seen] Flops share openers: pity begging ('video pe views nahi aa rahe… comment karo hum saath hain'), slow vlog intros ('Hello doston, welcome to day six'), and 3-minute walkthroughs with no stake in the first 2 seconds.",
    "[data] Hashtag count showed no consistent effect across 25 niches. Keep 6-8 relevant tags in the caption and spend the effort on the hook.",
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
    "pet_care": {
        "do": [
            "[seen] Breed price and market explainers dominate ('Pomeranian price in India' 5.5M; the Kolkata pet market got 30–73M). Answer the price question honestly.",
            "[seen] A named pet's story with a result ('How Leo the husky transformed after training', 1M) beats anonymous grooming clips.",
        ],
        "avoid": ["[seen] Generic grooming before/after. 24 of 25 grooming 'transformation' shorts got under 25k views", "Distressed-pet footage", "Medical claims without a vet"],
    },
    "travel": {
        "do": [
            "[seen] An exact budget in the hook ('Manali trip around ₹3,500' 1.4M; 'Honeymoon under ₹10,000' 648k; 'Nepal kitna mehenga hai?' 6.7M).",
            "[seen] A cost-breakdown format (total, then line items on screen) for international trips ('Vietnam budget breakdown' 1M).",
        ],
        "avoid": ["[seen] Package posters with no story ('DM us for your next holiday package' got 16 views; 'International travel offers' 30)", "Hidden-cost surprises", "Visa guarantees"],
    },
    "interior": {
        "do": [
            "[data] Price in the hook, about 4.4x within its own search (n=13). 'Luxury modular kitchen in just ₹3.5 lakh?' got 6.5M; '₹1 lakh vs ₹10 lakh kitchen' 662k.",
            "[seen] A real before/after of a client home (Ahmedabad agency, 4.4M) or an old-flat renovation ('20-year-old apartment', 438k).",
        ],
        "avoid": ["[data] Leaning on a city name instead of a price or result hook (0.29x, n=9)", "[seen] 'Top 5 designs 2026' render compilations (under 1k)"],
    },
    "photography": {
        "do": [
            "[seen] BTS that ends on the final result ('BTS and results', 1.3–2.7M) and quick shooting tips (14M).",
            "[seen] A couple-name reel or a location-driven pre-wedding story with consent.",
        ],
        "avoid": ["[data] Generic 'behind the scenes' titles with no result (0.06x, n=18)", "Gear-only videos"],
    },
    "mobile_repair": {
        "do": [
            "[seen] Shop-life comedy POV ('POV of a mobile repair shop', 40M) and the customer side ('Got my iPhone repaired in Gaffar Market', 24M).",
            "[seen] Fast, satisfying repair footage (fastest glass change 12M; iPhone screen ASMR 1.1M). Show the cracked-to-new moment in 2 seconds.",
            "[seen] An honest money or reality angle ('Mobile repair shop earning' 1.8M; 'Reality of service centre' 893k).",
        ],
        "avoid": ["[test] Discount-price-led hooks (0.14x, n=4)", "Customer data visible on screen", "Fake 'original part' claims"],
    },
    "events": {
        "do": [
            "[seen] The budget stated up front ('birthday decoration under ₹500' 7.2M; 'DIY decor sirf 500 rupees' 5.5M; stage price 12M).",
            "[seen] An empty-to-decorated reveal of a real setup (day wedding at a farm house, 3.4M).",
        ],
        "avoid": ["[seen] Final-photo-only posts with no reveal", "Copyrighted cartoon themes"],
    },
    "tailor": {
        "do": [
            "[seen] The cutting-and-stitching process for a specific named design ('Sabyasachi blouse cutting' 20M; '34-inch size 4 tucks blouse' 5.9M; boat neck 7M).",
            "[seen] Upcycle hooks ('saree border pieces to designer blouse', 253k).",
        ],
        "avoid": ["[seen] Tailor-shop promos with no garment shown. Most got under 5k", "Claiming a designer original"],
    },
    "spa_wellness": {
        "do": [
            "[seen] Technique-first ASMR moments (street champi and head-massage ASMR, 1–17M) and a first-timer's honest reaction.",
            "[seen] Price-value framing that surprises, when it's true ('0.50p India head massage', 4.7M; '$2.50 Indian head massage', 2.1M).",
        ],
        "avoid": ["[seen] Generic spa ads where the phone number is the hook", "Any medical or cure claim", "Suggestive framing"],
    },
    "optician": {
        "do": [
            "[seen] Lens-education demos that answer a buyer's doubt ('How to check blue-cut lenses at home' 1M; 'anti-glare vs blue-cut' 975k; 'thin hi-index lenses' 2.1M).",
            "[seen] Comparisons ('Lenskart vs local store', 1.5M) and a frame-for-face-size tip (1.4M).",
        ],
        "avoid": ["[data] Factory 'how lenses are made' content with no buyer angle (0.1x, n=9)", "Eyesight cure claims"],
    },
    "grocery": {
        "do": [
            "[data] Owner-style questions ('Is a kirana store profitable?', 'Dukan se kitna kama leta ho?'). About 2.9x within its own search (n=14).",
            "[seen] Margin and stock reveals ('dry fruits margin reveal' 2.3M; 'top 5 most selling products' 506k).",
        ],
        "avoid": ["[data] 'Sabse sasta supermarket / loot deals' claims with no figure (0.01x, n=21)", "False MRP or discount claims"],
    },
    "driving_school": {
        "do": [
            "[seen] One beginner fear answered in the hook ('Clutch first or brake first?' 9.8–10.7M; 'correct feet position' 16M; left-side judgement 6.3M).",
        ],
        "avoid": ["[seen] Numbered generic series ('Driving tips for beginners part 11', ~6k)", "Unsafe driving on camera"],
    },
    "dance_music": {
        "do": [
            "[seen] Progress over time ('My 6-year guitar progress' 9M; '1 year of guitar' 500k). Use real students, with parent consent for minors.",
            "[seen] Teaching a hit song simply ('3 Idiots song guitar lesson', 5.1M) and relatable teacher skits (4.3M).",
        ],
        "avoid": ["[seen] Class promos where the phone number is the hook (23k–57k)", "Guaranteed competition results"],
    },
    "laundry": {
        "do": [
            "[seen] The stain-removal or pressing process with a clear before/after ('removing blood stains at a dry cleaner' 36M; 'how shirts get pressed' 6.8M).",
            "[seen] Shop-life comedy ('First day of my dry clean shop', 3.1M).",
        ],
        "avoid": ["[seen] Franchise pitches aimed at customers", "Unsafe chemical DIY"],
    },
}


def examples(niche):
    n = data["niches"].get(niche, {})
    return {
        "winning": [f'{e["title"][:90]} ({e["views"]:,} views)' for e in n.get("top_examples", [])[:4]],
        "flops": [f'{e["title"][:90]} ({e["views"]:,} views)' for e in n.get("flop_examples", [])[:2]],
    }


out = {
    "source": f'{data["total_videos"]} Indian YouTube Shorts across {len(data["niches"])} niches (top results by views, 1-2 searches per niche, collected 2026-10). Titles and view counts, plus 13 usable transcripts.',
    "caveats": "Correlational, not causal. Search results are biased toward already-popular videos and big creators; YouTube Shorts are a proxy for Instagram Reels. Treat [data] lines as strong defaults, [seen] as patterns worth using, [test] as A/B ideas.",
    "cross_niche": CROSS_NICHE,
    "niches": {k: {**v, **examples(k), "median_views": data["niches"].get(k, {}).get("median_views")} for k, v in NICHE.items()},
}
(ROOT / "lib" / "viral_patterns.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
print("wrote lib/viral_patterns.json:", ", ".join(out["niches"]))
