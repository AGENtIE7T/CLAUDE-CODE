/**
 * Plain-text (WhatsApp / Notes friendly: no tables, no JSON, no markdown) and
 * Markdown exporters.
 */
import { placeText } from "./niche-label";
import { CRITERIA, type CriticScore, type GenerationRecord, type Script } from "./schema";

const t = (n: number) => `${Math.round(n * 10) / 10}s`;

export function scoreFor(rec: GenerationRecord, id: string): CriticScore | undefined {
  return rec.critic.scores.find((s) => s.script_id === id);
}

export function captionText(s: Script): string {
  return `${s.caption.trim()}\n\n${s.hashtags.join(" ")}`;
}

export function scriptPlainText(s: Script, score?: CriticScore): string {
  const L: string[] = [];
  L.push(`🎬 ${s.title.toUpperCase()}`);
  L.push(`${s.length_sec}s | ${s.hook_type} | ${s.content_pillar} | ${s.emotion} | On camera: ${s.on_camera}`);
  if (score) L.push(`Critic score: ${score.total}/100${score.rewritten ? " (rewritten by critic)" : ""}`);
  L.push("");
  L.push("HOOK (0-2s)");
  L.push(`First frame: ${s.hook.visual}`);
  L.push(`On screen: ${s.hook.on_screen_text}`);
  L.push(`Say: "${s.hook.spoken}"`);
  L.push("");
  L.push("SCRIPT");
  for (const b of s.beats) {
    L.push(`${t(b.start)}-${t(b.end)}: ${b.visual}`);
    if (b.spoken) L.push(`   Say: "${b.spoken}"`);
    if (b.on_screen_text) L.push(`   On screen: ${b.on_screen_text}`);
  }
  L.push("");
  L.push(`PAYOFF: ${s.payoff}`);
  L.push(`CTA: "${s.cta.spoken}"${s.cta.on_screen_text ? ` (on screen: ${s.cta.on_screen_text})` : ""}`);
  L.push("");
  L.push("HOW TO SHOOT");
  L.push(`Location: ${s.shooting.location}`);
  L.push(`Props: ${s.shooting.props.join(", ")}`);
  L.push(`Phone: ${s.shooting.phone_setup}`);
  L.push(`B-roll: ${s.shooting.broll.map((b) => `\n - ${b}`).join("")}`);
  L.push(`Editing tip: ${s.shooting.editing_tip}`);
  L.push(`Audio: ${s.audio}`);
  L.push("");
  L.push("CAPTION");
  L.push(captionText(s));
  L.push("");
  L.push(`Why it could work: ${s.why_it_works}`);
  L.push(`Biggest risk: ${s.biggest_risk}`);
  L.push("");
  L.push(`REEL SUMMARY: ${s.reel_summary}`);
  return L.join("\n");
}

export function allPlainText(rec: GenerationRecord): string {
  const L: string[] = [];
  L.push(`REELFORGE SCRIPTS: ${rec.inputs.business_name}${placeText(rec.inputs) ? ` (${placeText(rec.inputs)})` : ""}`);
  L.push(`Generated ${new Date(rec.created_at).toLocaleString("en-IN")}`);
  L.push(rec.critic.honesty_note);
  for (const s of rec.output.scripts) {
    L.push("", "━━━━━━━━━━━━━━━━", "");
    L.push(scriptPlainText(s, scoreFor(rec, s.id)));
  }
  const tp = rec.output.testing_plan;
  L.push("", "━━━━━━━━━━━━━━━━", "", "TESTING PLAN");
  for (const p of tp.post_first) L.push(`Post first: ${titleOf(rec, p.script_id)}: ${p.reason}`);
  L.push("Alternative hooks for the strongest script:");
  tp.ab_hooks.forEach((h, i) => L.push(` ${i + 1}. ${h}`));
  L.push(`What to watch after 48h: ${tp.metrics}`);
  L.push(`If it flops: ${tp.if_flops}`);
  L.push(`If it works: ${tp.if_works}`);
  L.push(`Posting frequency: ${tp.posting_frequency}`);
  L.push(`Next seasonal moment: ${tp.next_seasonal_moment}`);
  return L.join("\n");
}

function titleOf(rec: GenerationRecord, id: string) {
  return rec.output.scripts.find((s) => s.id === id)?.title ?? id;
}

const md = (s: string) => s.replace(/\|/g, "\\|");
const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

export function toMarkdown(rec: GenerationRecord): string {
  const o = rec.output;
  const L: string[] = [];
  L.push(`# ReelForge scripts: ${rec.inputs.business_name}`);
  L.push(`_${[rec.inputs.sub_niche, placeText(rec.inputs)].filter(Boolean).join(" · ")} · ${rec.mode} · ${new Date(rec.created_at).toLocaleString("en-IN")} · prompt ${rec.prompt_version} · ${rec.model}_`);
  L.push("", `> ${rec.critic.honesty_note}`);
  L.push("", "## Assumptions", list(o.assumptions));
  L.push("", "## Audience & pain map");
  L.push(`**Pains**\n${list(o.audience_map.pains)}`, `\n**Desires**\n${list(o.audience_map.desires)}`, `\n**Objections**\n${list(o.audience_map.objections)}`);
  L.push(`\n**Relatable references**\n${list(o.audience_map.relatable_refs)}`, `\n**Key emotion:** ${o.audience_map.key_emotion}`);
  L.push("", "## Niche strategy");
  const ns = o.niche_strategy;
  L.push(`**Pillars**\n${list(ns.pillars)}`, `\n**Trust triggers**\n${list(ns.trust_triggers)}`, `\n**Visuals**\n${list(ns.visuals)}`);
  L.push(`\n**Niche hooks**\n${list(ns.niche_hooks)}`, `\n**Seasonal moments**\n${list(ns.seasonal_moments)}`);
  L.push(`\n**Common mistakes**\n${list(ns.common_mistakes)}`, `\n**Cautions**\n${list(ns.cautions)}`);

  for (const s of o.scripts) {
    const sc = scoreFor(rec, s.id);
    L.push("", `## ${s.title}${sc ? ` (${sc.total}/100)` : ""}`);
    L.push(`${s.length_sec}s · ${s.hook_type} · ${s.content_pillar} · ${s.emotion} · on camera: ${s.on_camera}${sc?.rewritten ? " · rewritten by critic" : ""}`);
    if (sc) {
      L.push("", "| Criterion | Score | Why |", "|---|---|---|");
      for (const c of CRITERIA) L.push(`| ${c.label} | ${sc.breakdown[c.key]}/${c.max} | ${md(sc.justifications[c.key])} |`);
      if (sc.violations.length) L.push("", `**Critic violations:**\n${list(sc.violations)}`);
    }
    L.push("", "### Hook (0-2s)", `- **First frame:** ${s.hook.visual}`, `- **On screen:** ${s.hook.on_screen_text}`, `- **Say:** "${s.hook.spoken}"`);
    L.push("", "### Beats", "| Time | Visual | Spoken | On screen |", "|---|---|---|---|");
    for (const b of s.beats) L.push(`| ${t(b.start)}-${t(b.end)} | ${md(b.visual)} | ${md(b.spoken)} | ${md(b.on_screen_text)} |`);
    L.push("", `**Payoff:** ${s.payoff}`, "", `**CTA:** "${s.cta.spoken}"${s.cta.on_screen_text ? ` (on screen: ${s.cta.on_screen_text})` : ""}`);
    L.push("", "### Shooting notes", `- **Location:** ${s.shooting.location}`, `- **Props:** ${s.shooting.props.join(", ")}`, `- **Phone setup:** ${s.shooting.phone_setup}`, `- **B-roll:** ${s.shooting.broll.join("; ")}`, `- **Editing tip:** ${s.shooting.editing_tip}`, `- **Audio:** ${s.audio}`);
    L.push("", "### Caption", s.caption, "", s.hashtags.join(" "));
    L.push("", `**Why it could work:** ${s.why_it_works}`, "", `**Biggest risk:** ${s.biggest_risk}`);
    L.push("", `> **Reel summary:** ${s.reel_summary}`);
    const warn = rec.checks.final.filter((f) => f.script_id === s.id);
    if (warn.length) L.push("", `**Automated check warnings:**\n${list(warn.map((w) => w.message))}`);
  }

  const tp = o.testing_plan;
  L.push("", "## Testing plan");
  L.push(list(tp.post_first.map((p) => `**Post first:** ${titleOf(rec, p.script_id)}: ${p.reason}`)));
  L.push("", "**Alternative hooks for the strongest script**", tp.ab_hooks.map((h, i) => `${i + 1}. ${h}`).join("\n"));
  L.push("", `**What to watch after 48h:** ${tp.metrics}`, "", `**If it flops:** ${tp.if_flops}`, "", `**If it works:** ${tp.if_works}`);
  L.push("", `**Posting frequency:** ${tp.posting_frequency}`, "", `**Next seasonal moment:** ${tp.next_seasonal_moment}`);
  if (rec.critic.weakest_note) L.push("", `**Critic's note on the weakest script:** ${rec.critic.weakest_note}`);
  if (rec.critic.similarity_flags.length) L.push("", `**Similarity flags:**\n${list(rec.critic.similarity_flags)}`);
  return L.join("\n") + "\n";
}
