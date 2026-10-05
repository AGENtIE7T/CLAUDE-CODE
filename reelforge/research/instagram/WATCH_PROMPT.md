Watch this whole reel (visuals AND audio). Return ONLY one JSON object, no prose, with exactly these keys:

{
  "length_sec": number,
  "first_frame": "face" | "product_or_result" | "text_card" | "action_in_motion" | "before_state" | "place" | "other",
  "spoken_first_2s": "exact words spoken in the first 2 seconds, or empty string",
  "on_screen_text_first_frame": "exact text on screen in the first frame, or empty string",
  "number_in_hook": true/false   (a price, kg, count, years, marks or budget in the first 2 seconds, spoken or on screen),
  "hook_style": "question" | "pain_callout" | "pov" | "that_one_archetype" | "x_vs_y" | "number_claim" | "myth_bust" | "reveal" | "warning" | "challenge" | "story_open" | "no_hook",
  "cuts_first_5s": integer,
  "speech": "none" | "voiceover" | "to_camera" | "dialogue",
  "audio": "trending_or_known_song" | "original_music" | "voice_only" | "voice_plus_music",
  "format": "skit" | "pov" | "tutorial" | "before_after" | "listicle" | "story" | "reveal" | "vlog" | "review" | "talking_head" | "process" | "behind_the_scenes" | "other",
  "series_marker": true/false   (Part/EP/Day N on screen or spoken),
  "people_on_screen": integer,
  "payoff_in_last_3s": true/false,
  "cta": "none" | "follow" | "comment" | "save" | "share" | "dm_or_call" | "link_in_bio" | "visit",
  "language": "hindi" | "hinglish" | "english" | "regional" | "none",
  "dominant_emotion": "curiosity" | "humour" | "aspiration" | "fear_of_loss" | "satisfaction" | "nostalgia" | "outrage" | "inspiration" | "trust",
  "why_it_works_or_fails": "one sentence",
  "swipe_risk_sec": number   (the second where a typical viewer is most likely to swipe away; 0 if they'd swipe on the first frame),
  "what_goes_wrong": "one sentence: the biggest mistake in this reel, even if it went viral; what a sharper creator would fix",
  "failure_mode": "slow_start" | "unclear_hook" | "no_payoff" | "too_long" | "low_energy" | "bad_audio" | "no_story" | "generic_copy" | "text_overload" | "begging_or_pity" | "hard_sell" | "none",
  "reusable_pattern": "one sentence describing the transferable pattern, no names"
}
