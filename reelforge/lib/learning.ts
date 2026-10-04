/**
 * The self-improvement loop. Before each generation, gathers what this user's
 * own data says (posted-reel results, thumbs up/down, saved learnings) and
 * turns it into a PAST PERFORMANCE & YOUR TASTE block for the generator.
 * Pure function over plain data, so it is unit-tested and shared by both apps.
 */
import { insights } from "./stats";
import type { GenerationRecord } from "./schema";
import type { Feedback, Learnings, PerformanceEntry } from "./storage";

export interface LearningInputs {
  niche: string; // niche id, e.g. "salon"
  nicheLabel: string;
  clientKey: string;
  generations: GenerationRecord[];
  feedback: Record<string, Feedback>; // key: `${genId}:${scriptId}`
  performance: PerformanceEntry[];
  clientLearnings?: Learnings;
}

export interface LearningContext {
  text: string;
  counts: { learnings: number; nichePosts: number; liked: number; disliked: number };
}

const MAX = { liked: 4, disliked: 4, insights: 5 };

export function buildLearningContext(i: LearningInputs): LearningContext {
  const parts: string[] = [];

  const learn = i.clientLearnings?.bullets ?? [];
  if (learn.length) parts.push(`Learnings for this client from ${i.clientLearnings!.posts} posted reels:`, ...learn.map((b) => `- ${b}`));

  // Results from every posted reel in this niche (all clients), computed in code.
  const nichePosts = i.performance.filter((p) => p.niche.toLowerCase() === i.nicheLabel.toLowerCase());
  if (nichePosts.length >= 3) {
    const ins = insights(nichePosts).slice(0, MAX.insights);
    if (ins.length) parts.push("", `What your own ${nichePosts.length} posted ${i.nicheLabel} reels show:`, ...ins.map((x) => `- ${x}`));
  }

  // Taste: hooks this user liked or disliked on earlier scripts in the same niche.
  const liked: string[] = [];
  const disliked: string[] = [];
  for (const g of i.generations) {
    if (g.inputs.niche !== i.niche) continue;
    for (const s of g.output.scripts) {
      const fb = i.feedback[`${g.id}:${s.id}`];
      if (!fb?.vote) continue;
      const line = `"${s.hook.spoken}" (${s.hook_type}, ${s.content_pillar})${fb.note ? `. Note: ${fb.note}` : ""}`;
      if (fb.vote === "up" && liked.length < MAX.liked) liked.push(line);
      if (fb.vote === "down" && disliked.length < MAX.disliked) disliked.push(line);
    }
  }
  if (liked.length) parts.push("", "Hooks the user LIKED (write in this spirit, don't copy):", ...liked.map((x) => `- ${x}`));
  if (disliked.length) parts.push("", "Hooks the user DISLIKED (avoid what made these weak):", ...disliked.map((x) => `- ${x}`));

  return {
    text: parts.join("\n").trim().slice(0, 3800),
    counts: { learnings: learn.length, nichePosts: nichePosts.length, liked: liked.length, disliked: disliked.length },
  };
}
