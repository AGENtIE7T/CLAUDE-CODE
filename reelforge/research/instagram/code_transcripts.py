"""
Codes transcript-only reels into deep/<id>.json (evidence = "transcript").

Two kinds of field, kept apart on purpose:
  descriptive  computed here from the timestamped transcript (or read off it):
               speech type, opening words, first-speech second, length estimate,
               spoken CTA, series marker, language. These feed the statistics.
  notes        the reviewer's (Claude's) judgement: format, hook, what goes
               wrong, failure mode, swipe-risk second, reusable pattern.
               Written while knowing each reel's views, so they are hindsight:
               analyze_ig.py uses them only as labelled qualitative lines,
               never in lift or failure statistics. Blind full watches
               (evidence = "watch") are the only rows that feed those.
Run: python3 research/instagram/code_transcripts.py
"""
import json, re
from pathlib import Path

HERE = Path(__file__).parent
TAG = re.compile(r"\[[^\]]*\]")

# speech type read off each transcript: dialogue (2+ voices), monologue
# (one voice, to camera or voiceover), none (music, or auto-captions of song
# lyrics / wrong-language noise).
SPEECH = {
    "1IvRkuzZXs8": "monologue", "BK497h7lJvs": "dialogue", "T2OEqGXebLM": "dialogue",
    "mGVq0ULuyqA": "none", "479195lfYeQ": "monologue", "fGhZ3kSTjzQ": "dialogue",
    "1Bsrmhjlud4": "dialogue", "OJkkW0m85tI": "monologue", "cz-88P-QQc0": "monologue",
    "-JkR9rd2SH8": "dialogue", "L3uwrlWwNWA": "dialogue", "3g7YXCG-3IY": "none",
    "ZhQ7M6QJ154": "monologue", "42qer-f2FBQ": "dialogue", "fBA62_WNim0": "none",
    "Pk8pqeF-b0Y": "monologue", "TzpbszULIpY": "monologue",
    # day 2
    "S9zv4HQSqdU": "dialogue", "qWTeQeui2T8": "none", "19nH4sVfqwc": "monologue", "Kl2qMXXWP60": "none",
    "bZHZuzwt6sU": "dialogue", "1ulsq4rRf3Q": "dialogue", "qCePVFRPQz8": "dialogue", "E6Sj6gYiw68": "none",
    "ucJr66foT4w": "none", "gtk8KvbXcZg": "dialogue", "Wsl2dhxO-WM": "none", "lI6e2Zf26C0": "none",
    "Z_NmU6-yXio": "monologue", "tvnXdMNGLXM": "none", "PBimy3IHFOI": "monologue", "pRCd1TrZpWY": "none",
    "IRYmRTYlSag": "monologue", "yHJ08miFRo4": "monologue", "UmExGFoYCh4": "none", "Lx3qaNNolG8": "monologue",
    # day 3
    "I6jdSU2MMS0": "monologue",
}
LANG = {"mGVq0ULuyqA": "none", "3g7YXCG-3IY": "none", "fBA62_WNim0": "none", "1Bsrmhjlud4": "english",
        "ZhQ7M6QJ154": "english", "TzpbszULIpY": "english", "cz-88P-QQc0": "regional",
        "gtk8KvbXcZg": "english", "Z_NmU6-yXio": "regional", "19nH4sVfqwc": "hinglish"}
CTA_WORDS = re.compile(r"\b(follow|subscribe|comment|share|like)\b|फॉलो|सब्सक्राइब|कमेंट|शेयर|लाइक|ഫോളോ|സേവ്|ഷെയർ", re.I)
SERIES = re.compile(r"\b(day|ep|part)\s*[-.]?\s*\d+|दिन\s*\d+|डे\s*\d+|सीरीज|फिर मिलते हैं कल", re.I)

NOTES = {
    "1IvRkuzZXs8": dict(format="vlog", hook="money question ('dukan se kitna kama leta hoon?') answered only in the last line", payoff_in_last_3s=True,
        what_goes_wrong="The middle (refilling namkeen boxes, 4-10s) is filler; a running earnings tally on screen would hold people to the reveal.",
        failure_mode="none", swipe_risk_sec=6,
        reusable_pattern="Open on the money question everyone is curious about, hold the number until the last line, and show the day's grind in between."),
    "BK497h7lJvs": dict(format="skit", hook="near-silent school-exam scene; first line only at 6s", payoff_in_last_3s=True,
        what_goes_wrong="No words for the first 6 seconds, so the opening frame alone has to stop the scroll; that only works for an already famous face.",
        failure_mode="none", swipe_risk_sec=3,
        reusable_pattern="Play a shared school memory as a near-silent skit on music; one line of dialogue lands the twist."),
    "T2OEqGXebLM": dict(format="skit", hook="kids chanting a vegetable rhyme in class, then a delivery boy walks in asking for a 5-star rating", payoff_in_last_3s=True,
        what_goes_wrong="The rating joke peaks at 26s and the last 20s repeat the chant; ending right after the payoff would raise completion.",
        failure_mode="none", swipe_risk_sec=30,
        reusable_pattern="Collide two everyday worlds everyone knows (classroom plus delivery-app rating culture) in one absurd scene."),
    "mGVq0ULuyqA": dict(format="before_after", hook="time-span claim in the title ('My 5 years of natural bodybuilding') carried by a progress montage", payoff_in_last_3s=True,
        what_goes_wrong="No spoken or visible starting number in the transcript; an exact year-1 vs year-5 figure would make the jump undeniable.",
        failure_mode="none", swipe_risk_sec=8,
        reusable_pattern="A time-span progress montage on an epic song; the years do the storytelling, no talking needed."),
    "479195lfYeQ": dict(format="story", hook="exact starting numbers in the first line ('44 saal, 5 feet 8 inch, 85 kilo')", payoff_in_last_3s=False,
        what_goes_wrong="Seconds 24-33 repeat the pledge ('six pack bana ke rahunga') instead of showing day 5's actual workout; the series promise is strong, the proof is missing.",
        failure_mode="none", swipe_risk_sec=24,
        reusable_pattern="State your exact starting numbers in the first line and make a public day-by-day promise; 'phir milte hain kal' turns one reel into a series."),
    "fGhZ3kSTjzQ": dict(format="story", hook="AI-cartoon Hulk opens a ₹1 restaurant ('ek din Hulk ne socha...')", payoff_in_last_3s=False,
        what_goes_wrong="A magic spoon solves everything, so there is no real stake or payoff, and AI-cartoon versions of famous characters are a flooded format with no 'ye toh main hoon' moment.",
        failure_mode="generic_copy", swipe_risk_sec=2,
        reusable_pattern="Avoid: AI-cartoon stories of famous characters with a magic fix; nothing real is at stake."),
    "1Bsrmhjlud4": dict(format="skit", hook="'Mike, why are you looking at your test paper upside down?'", payoff_in_last_3s=True,
        what_goes_wrong="Four recycled joke-book one-liners in a row with a generic Western character; viewers have heard every punchline, and there is no single build.",
        failure_mode="generic_copy", swipe_risk_sec=5,
        reusable_pattern="Avoid: strings of old textbook jokes with generic characters; one original situation beats four borrowed punchlines."),
    "OJkkW0m85tI": dict(format="vlog", hook="'Aaj main aapko le chalta hoon Smart Bazaar' tour opener", payoff_in_last_3s=False,
        what_goes_wrong="A tour opener, vague 'itna sasta' claims, 78 seconds with long music gaps, and an ending that sounds like the store's ad ('sabse sasta Smart Bazaar').",
        failure_mode="too_long", swipe_risk_sec=3,
        reusable_pattern="Avoid: 'aaj main aapko le chalta hoon' tours with vague 'sasta' claims; lead with the single best price."),
    "cz-88P-QQc0": dict(format="tutorial", hook="'Assalam walekum, is video ke andar do cheez share karunga, gaur se dekhna'", payoff_in_last_3s=False,
        what_goes_wrong="Greeting plus an agenda fills the first 5 seconds, then jargon about piston rings with no visible cost of getting it wrong.",
        failure_mode="slow_start", swipe_risk_sec=1,
        reusable_pattern="Avoid: greeting + 'is video mein do cheezein' openers; lead with the costly symptom (engine smoke, a ₹ repair bill)."),
    "-JkR9rd2SH8": dict(format="skit", hook="a learner driver so scared of scratches he gets PPF, iron bumpers and bail papers ready", payoff_in_last_3s=True,
        what_goes_wrong="Speech starts at 2.5s, so the first frame must already show the nervous character; the garage name is said nowhere in the dialogue.",
        failure_mode="none", swipe_risk_sec=3,
        reusable_pattern="Build a character whose exaggerated fear is exactly what your product solves; the product appears inside the joke (at 13s), not after it."),
    "L3uwrlWwNWA": dict(format="skit", hook="'Kitne ka hai ye?' '₹15,000.' '₹5,000.' 'Chhotu, pack kar.' in the first 4 seconds", payoff_in_last_3s=True,
        what_goes_wrong="Almost nothing; at 19 seconds the only risk is the 8-second gap with no line (4-12s).",
        failure_mode="none", swipe_risk_sec=6,
        reusable_pattern="A 15-20 second shop-counter haggling skit with real prices said out loud; the punchline is the shopkeeper's reaction."),
    "3g7YXCG-3IY": dict(format="before_after", hook="exact numbers in the title ('135 kgs to 63 kgs') carried by a montage", payoff_in_last_3s=True,
        what_goes_wrong="Music-only; whether the numbers are on screen in the first frame can't be checked from a transcript (needs a full watch).",
        failure_mode="none", swipe_risk_sec=None,
        reusable_pattern="Exact before/after numbers plus a montage and music; no talking needed."),
    "ZhQ7M6QJ154": dict(format="tutorial", hook="'If you have a high prescription, avoid the coke bottle glasses look'", payoff_in_last_3s=True,
        what_goes_wrong="Nothing major; at 8 seconds it could show the thick vs thin lens side by side to make the fix visual.",
        failure_mode="none", swipe_risk_sec=None,
        reusable_pattern="Name the viewer's exact situation in the first words ('high prescription?') and give the fix in one sentence; 8 seconds total."),
    "42qer-f2FBQ": dict(format="skit", hook="'Doctor sahab, mujhe bahut kamzori hai' -> 'badaam kaju daal ke phoonk maar ke piyo'", payoff_in_last_3s=True,
        what_goes_wrong="A forwarded WhatsApp joke acted out word for word; no new character, twist or visual, so there is nothing to share.",
        failure_mode="generic_copy", swipe_risk_sec=3,
        reusable_pattern="Avoid: acting out a joke that is already on WhatsApp; if people know the punchline, the reel is dead."),
    "fBA62_WNim0": dict(format="vlog", hook="title promises 'aaj kya sasta mila?' but nothing is said for 43 seconds", payoff_in_last_3s=None,
        what_goes_wrong="A deals video where no price is spoken in 43 seconds of music; if the prices are only in small on-screen text, nobody waits for them.",
        failure_mode="no_payoff", swipe_risk_sec=2,
        reusable_pattern="Avoid: 'what's cheap today' reels with no price up front; say the best price in the first 2 seconds."),
    "Pk8pqeF-b0Y": dict(format="talking_head", hook="podcast clip: 'gold jewellery khareedte waqt pehli cheez...'", payoff_in_last_3s=False,
        what_goes_wrong="The useful insight (a jeweller charges you three things: gold price, wastage, making) arrives only at 24-34s behind a rambling setup.",
        failure_mode="slow_start", swipe_risk_sec=5,
        reusable_pattern="Lead with the money insight ('your jeweller charges you 3 things'); a podcast clip needs its punchline first."),
    "TzpbszULIpY": dict(format="other", hook="room-by-room voiceover ('15x10 hall size... first bedroom 10x10')", payoff_in_last_3s=False,
        what_goes_wrong="63 seconds of room sizes with no rent, no price and no standout feature in the opening; it reads like a listing, not a reel.",
        failure_mode="no_story", swipe_risk_sec=2,
        reusable_pattern="Avoid: room-by-room walkthroughs; lead with the rent and the one feature that's unusual for that price."),
    # ---- day 2 (2026-10-12) ----
    "S9zv4HQSqdU": dict(format="tutorial", hook="'Guddu bhai, gaadi pe helicopter sign jalta hai, gaadi ud to nahi jayegi?' flipped into 'ignore kiya to bahut paise uda degi'", payoff_in_last_3s=False,
        what_goes_wrong="After the joke, seconds 13-30 are a sensor lecture; one real symptom and one real repair bill would keep the money stake alive.",
        failure_mode="none", swipe_risk_sec=14,
        reusable_pattern="Open with the dumb question a beginner is scared to ask, flip it into a money stake ('ignore kiya to paise udayegi'), then teach one thing as Day N of a series."),
    "qWTeQeui2T8": dict(format="before_after", hook="music-only makeover (title: 'From Braids to Glam')", payoff_in_last_3s=None,
        what_goes_wrong=None, failure_mode=None, swipe_risk_sec=None, reusable_pattern=None),
    "19nH4sVfqwc": dict(format="review", hook="'Hi guys, welcome to my mini saree haul', then the sale and 'under 999'", payoff_in_last_3s=False,
        what_goes_wrong="It opens with 'hi guys welcome'; the sale plus '4 sarees under ₹999' should be the first line. It worked on sale-week demand, not because of the opener.",
        failure_mode="none", swipe_risk_sec=3,
        reusable_pattern="A sale-week haul: name the sale and the price ceiling, then one line per item on who it suits (farewell, office, teacher)."),
    "Kl2qMXXWP60": dict(format="before_after", hook="music-only progress video (title: 'My 6 year guitar progress!')", payoff_in_last_3s=None,
        what_goes_wrong=None, failure_mode=None, swipe_risk_sec=None, reusable_pattern=None),
    "bZHZuzwt6sU": dict(format="skit", hook="'That one music teacher': harmonium and sa-re-ga-ma vs kids asking for the trending song", payoff_in_last_3s=None,
        what_goes_wrong="66 seconds; the joke (kids know Diljit, not sa-re-ga-ma) is clear by 30s and then repeats.",
        failure_mode="none", swipe_risk_sec=30,
        reusable_pattern="A 'that one teacher' archetype: the old-school teacher vs kids who only know the song trending this month; name the real song."),
    "1ulsq4rRf3Q": dict(format="skit", hook="'History jaante ho? Gandhi ji ke bete ka naam?' -> 'Dineshan'", payoff_in_last_3s=True,
        what_goes_wrong="A decades-old 'father of the nation' pun acted out by AI characters; nothing new to share.",
        failure_mode="generic_copy", swipe_risk_sec=3,
        reusable_pattern="Avoid: famous old puns acted out by AI characters."),
    "qCePVFRPQz8": dict(format="story", hook="'Aaj agar ₹5,000 nahi kamaye to yeh dhaba hamesha ke liye band'", payoff_in_last_3s=None,
        what_goes_wrong="A real stake and a number in the first line, but a stock 'garib dhaba' turnaround plot with a 10-second silent gap (28-38s); the hook can't save a story viewers have seen a hundred times (visuals unchecked).",
        failure_mode="generic_copy", swipe_risk_sec=28,
        reusable_pattern="Avoid: stock rags-to-riches plots; a strong first-line stake still needs a story people haven't seen."),
    "E6Sj6gYiw68": dict(format="tutorial", hook="silent wiring repair (title hashtags: #garenafreefire #funny)", payoff_in_last_3s=None,
        what_goes_wrong="A silent 33-second repair clip tagged with unrelated hashtags (#garenafreefire, #funny); nothing says what problem is being fixed or what it costs (visuals unchecked).",
        failure_mode="unclear_hook", swipe_risk_sec=None,
        reusable_pattern="Avoid: silent repair clips with no stated problem; say the symptom and the cost in the first line."),
    "ucJr66foT4w": dict(format="reveal", hook="song-only reveal (title: 'My first outfit which I designed and stitched')", payoff_in_last_3s=None,
        what_goes_wrong=None, failure_mode=None, swipe_risk_sec=None, reusable_pattern=None),
    "gtk8KvbXcZg": dict(format="skit", hook="teacher's roll-call of answers ('four, four, six...') building to the '7 8 9' joke", payoff_in_last_3s=True,
        what_goes_wrong="The punchline is the old '7 ate 9' joke; it hit 43M anyway, so casting and delivery carried it (visuals unchecked). Old jokes are not automatically dead, but they need a stronger performance.",
        failure_mode="none", swipe_risk_sec=None,
        reusable_pattern="A roll-call build-up where one pattern repeats until someone breaks it; the break is the punchline."),
    "Wsl2dhxO-WM": dict(format="other", hook="music-only pre-wedding couple film (Tamil song)", payoff_in_last_3s=None,
        what_goes_wrong=None, failure_mode=None, swipe_risk_sec=None, reusable_pattern=None),
    "lI6e2Zf26C0": dict(format="process", hook="music-only 'deep clean satisfaction: restoring your AC unit'", payoff_in_last_3s=None,
        what_goes_wrong="Music-only 'satisfying AC deep clean', the exact pattern the 25-niche data found saturated ('dirty AC / satisfying' ~0.01x, n=18); no problem, price or twist is stated (visuals unchecked).",
        failure_mode="generic_copy", swipe_risk_sec=None,
        reusable_pattern="Avoid: generic 'satisfying AC cleaning' clips; add the stake (bill saved, 10-year-old AC, what was inside)."),
    "Z_NmU6-yXio": dict(format="other", hook="'If you're in Sharjah, Dubai or Ajman, this video is useful for you, don't skip'", payoff_in_last_3s=False,
        what_goes_wrong="A 'useful video, don't skip' opener, a vague 'great price' with no number, and two CTAs at the end (follow and save): an ad, not a reel.",
        failure_mode="hard_sell", swipe_risk_sec=2,
        reusable_pattern="Avoid: 'useful video, don't skip' openers and 'great price' with no number; show the cracked screen and say the price."),
    "tvnXdMNGLXM": dict(format="tutorial", hook="music-only 'step-by-step makeup tutorial | glam makeup transformation'", payoff_in_last_3s=None,
        what_goes_wrong="A generic 'transformation tutorial', the label the 25-niche data found weak for salons (0.26x, n=20); no client, occasion or twist is named (visuals unchecked).",
        failure_mode="generic_copy", swipe_risk_sec=None,
        reusable_pattern="Avoid: generic 'glam transformation tutorial' titles; name the client and the twist."),
    "PBimy3IHFOI": dict(format="tutorial", hook="voiceover recipe from step one: 'taaze nariyal ko bareek kaddukas kar lein'", payoff_in_last_3s=False,
        what_goes_wrong="Starts on step one of a coconut-ladoo recipe with no reason to watch; 'halwai jaisi' recipe clones were already flagged as crowded in the 25-niche data.",
        failure_mode="generic_copy", swipe_risk_sec=2,
        reusable_pattern="Avoid: recipe voiceovers that start on step one; open on the finished sweet and the one trick a halwai uses."),
    "pRCd1TrZpWY": dict(format="skit", hook="music-only comedy (title: 'Unhygienic Indian street food')", payoff_in_last_3s=None,
        what_goes_wrong=None, failure_mode=None, swipe_risk_sec=None, reusable_pattern=None),
    "IRYmRTYlSag": dict(format="vlog", hook="'Aaj main dekhne wala hoon itne bade DMart mein sirf ₹5 ki cheez khareedta, unka reaction kaisa hoga?'", payoff_in_last_3s=False,
        what_goes_wrong="The payoff (the cashier counting coins) is narrated instead of shown, and it ends on a throwaway 'like kar dena'.",
        failure_mode="none", swipe_risk_sec=15,
        reusable_pattern="A tiny-budget challenge in a big store ('sirf ₹5 mein DMart'): a price limit plus other people's reactions."),
    "yHJ08miFRo4": dict(format="vlog", hook="nothing for 6 seconds, then 'Assalam walekum ji, ye hamare Afzal bhai hain'", payoff_in_last_3s=False,
        what_goes_wrong="Six seconds with no words, then a greeting, then 'complete video dekhiyega': the reel is a trailer for another video.",
        failure_mode="slow_start", swipe_risk_sec=2,
        reusable_pattern="Avoid: greeting-first vlogs that send people to 'the complete video'; the reel has to pay off on its own."),
    "UmExGFoYCh4": dict(format="before_after", hook="music-only 'Fat Loss Journey | Before After Transformation' with no numbers in the title", payoff_in_last_3s=None,
        what_goes_wrong="A generic 'fat loss journey before after' with no kg or time span; the 25-niche data had vague 'transformation' labels at 0.21x while '135 kg to 63 kg' got 10M (visuals unchecked).",
        failure_mode="generic_copy", swipe_risk_sec=None,
        reusable_pattern="Avoid: 'transformation journey' with no numbers; put the kg and the months in the first frame."),
    "Lx3qaNNolG8": dict(format="review", hook="'Festivals aa rahe hain isliye maine kuch backdrop mangaye hain'", payoff_in_last_3s=False,
        what_goes_wrong="A seasonal hook, but 51 seconds of 'affordable' and 'bahut accha lagta hai' with no single price and a comment-for-link ask: a catalogue, not a story.",
        failure_mode="generic_copy", swipe_risk_sec=5,
        reusable_pattern="Avoid: 'affordable' with no price; show one room before and after and say what the backdrop cost."),
    # ---- day 3 (2026-10-13) ----
    "I6jdSU2MMS0": dict(format="other", hook="'Thailand is calling: 3 nights Pattaya, 1 night Bangkok from just ₹52,999 per person, only 10 seats, WhatsApp now'", payoff_in_last_3s=False,
        what_goes_wrong="The whole 12-second reel is a spoken price list with 'only 10 seats' and a WhatsApp ask: a price in the first line doesn't help when the reel is only an ad.",
        failure_mode="hard_sell", swipe_risk_sec=2,
        reusable_pattern="Avoid: price-list ads ('from ₹52,999, only 10 seats, WhatsApp now'); put the price inside a story or a comparison."),
}

for f in sorted((HERE / "transcripts").glob("*.json")):
    t = json.loads(f.read_text())
    vid, lines = t["video_id"], t["lines"]
    if not lines or vid not in SPEECH:
        continue
    speech = SPEECH[vid]
    spoken = [(ms, TAG.sub("", txt).strip()) for ms, txt in lines]
    spoken = [(ms, s) for ms, s in spoken if re.search(r"\w", s)] if speech != "none" else []
    first2 = " ".join(s for ms, s in spoken if ms < 2000)
    all_text = " ".join(s for _, s in spoken)
    d = {
        "evidence": "transcript",
        # Last caption start + ~2s. Unknown for music-only reels: lyric
        # captions stop before the video does.
        "length_sec": round(lines[-1][0] / 1000 + 2) if speech != "none" else None,
        "length_is_estimate": True,
        "speech": speech,
        "spoken_first_2s": first2,
        "first_speech_sec": round(spoken[0][0] / 1000, 1) if spoken else None,
        "cta": "spoken" if CTA_WORDS.search(all_text) else "none",
        "series_marker": bool(SERIES.search(all_text)),
        "language": "none" if speech == "none" else LANG.get(vid, "hindi"),
        "notes": NOTES[vid],
    }
    (HERE / "deep" / f"{vid}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2))
    print(vid, speech, repr(first2[:60]), d["first_speech_sec"], d["length_sec"], d["cta"], d["series_marker"])
