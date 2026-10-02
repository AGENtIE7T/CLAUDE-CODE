import fs from "node:fs";
import path from "node:path";
import nichesData from "./niches.json";
import { LANGUAGE_LABELS, type BusinessInput } from "./schema";

const DIR = path.join(process.cwd(), "lib", "prompts");
const cache = new Map<string, string>();

/** Reads a prompt file. Cached in production; re-read in dev so edits apply instantly. */
export function loadPrompt(rel: string): string {
  if (process.env.NODE_ENV === "production" && cache.has(rel)) return cache.get(rel)!;
  const text = fs.readFileSync(path.join(DIR, rel), "utf8");
  cache.set(rel, text);
  return text;
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export type Niche = (typeof nichesData.niches)[number];

export function getNiche(id: string): Niche | undefined {
  return nichesData.niches.find((n) => n.id === id);
}

export function nicheLabel(inputs: Pick<BusinessInput, "niche" | "custom_niche">): string {
  return inputs.niche === "other" ? inputs.custom_niche || "Other" : getNiche(inputs.niche)?.label ?? inputs.niche;
}

export function modeFor(inputs: BusinessInput): "B2B" | "B2C" {
  return inputs.b2b ? "B2B" : "B2C";
}

/** Only the selected niche's playbook, never all 12. */
export function playbookText(inputs: Pick<BusinessInput, "niche" | "custom_niche" | "sub_niche">): string {
  const n = getNiche(inputs.niche);
  if (!n) {
    return JSON.stringify(
      { niche: inputs.custom_niche || "Other", sub_niche: inputs.sub_niche, playbook: null, instruction: nichesData.other.instruction },
      null,
      2,
    );
  }
  const { id: _id, ...rest } = n;
  return JSON.stringify({ ...rest, sub_niche: inputs.sub_niche }, null, 2);
}

export function inputsJson(inputs: BusinessInput): string {
  return JSON.stringify(
    {
      business_name: inputs.business_name,
      niche: nicheLabel(inputs),
      sub_niche: inputs.sub_niche,
      city: inputs.city,
      area_locality: inputs.area,
      target_customer: inputs.target_customer,
      main_offer: inputs.offer,
      usp: inputs.usp,
      on_camera: inputs.on_camera,
      language: LANGUAGE_LABELS[inputs.language],
      tone: inputs.tones.length ? inputs.tones : ["(not specified: pick what fits)"],
      upcoming_festival_season_event: inputs.festival || "(none given)",
      things_to_avoid: inputs.avoid || "(none given)",
      reference_hooks: inputs.reference_hooks,
      number_of_scripts: inputs.script_count,
      mode: modeFor(inputs),
    },
    null,
    2,
  );
}

function schemaBlock(): string {
  const gen = loadPrompt("schemas/generator.json");
  const script = loadPrompt("schemas/script.json");
  const hook = loadPrompt("schemas/hook_item.json");
  return [
    "Top-level shape:",
    gen,
    "Each item in \"scripts\" (ids s1, s2, s3, ...):",
    script,
    "Each item in \"hook_analysis\":",
    hook,
  ].join("\n");
}

export function generatorSystem(inputs: BusinessInput, pastPerformance?: string): string {
  return fill(loadPrompt("generator.md"), {
    INPUTS: inputsJson(inputs),
    PAST_PERFORMANCE: pastPerformance?.trim() || "(none)",
    NICHE_PLAYBOOK: playbookText(inputs),
  });
}

export function generatorUser(inputs: BusinessInput): string {
  return [
    `Write ${inputs.script_count} script(s) now, following every step.`,
    "",
    "# OUTPUT SCHEMA (return exactly this JSON shape)",
    schemaBlock(),
  ].join("\n");
}

export function replacementUser(inputs: BusinessInput, replaceId: string, keep: { id: string; hook_type: string; content_pillar: string; emotion: string; title: string }[]): string {
  return [
    `Write exactly ONE new script with id "${replaceId}" to replace a weak script in an existing batch.`,
    "It must use a hook type, content pillar and emotion that are DIFFERENT from these scripts that are staying:",
    JSON.stringify(keep, null, 2),
    "Follow every timing rule and non-negotiable rule.",
    "",
    "# OUTPUT SCHEMA",
    'Return ONLY: {"scripts": [ <one script object> ]} where the script object is:',
    loadPrompt("schemas/script.json"),
  ].join("\n");
}

export function criticSystem(): string {
  return loadPrompt("critic.md");
}

export function criticUser(args: {
  inputs: BusinessInput;
  scripts: unknown;
  failedChecks: { script_id: string | null; check: string; message: string }[];
  context?: unknown;
}): string {
  return [
    "# BUSINESS INPUTS",
    inputsJson(args.inputs),
    "",
    "# NICHE PLAYBOOK",
    playbookText(args.inputs),
    "",
    "# GENERATOR SCRIPTS",
    JSON.stringify(args.scripts, null, 2),
    args.context ? `\n# OTHER SCRIPTS IN THE BATCH (for similarity only; do not score these)\n${JSON.stringify(args.context, null, 2)}` : "",
    "",
    "# FAILED AUTOMATED CHECKS",
    args.failedChecks.length ? args.failedChecks.map((f) => `- [${f.script_id ?? "batch"}] ${f.check}: ${f.message}`).join("\n") : "(none)",
    "",
    "# OUTPUT SCHEMA",
    loadPrompt("schemas/critic.json"),
    "Each rewritten script uses this schema:",
    loadPrompt("schemas/script.json"),
    "Score every script listed under GENERATOR SCRIPTS exactly once.",
  ].join("\n");
}

/** Hook Analyzer: ROLE + STEP 3 + HOOK LIBRARY sections of generator.md, plus hooks.md. */
export function hooksSystem(): string {
  const g = loadPrompt("generator.md");
  const section = (title: string) => {
    const m = g.match(new RegExp(`# ${title}[\\s\\S]*?(?=\\n# )`));
    return m ? m[0].trim() : "";
  };
  return [section("ROLE"), section("STEP 3: HOOK ANALYSIS"), section("HOOK LIBRARY")].join("\n\n");
}

export function hooksUser(hooks: string[], niche: string, language: BusinessInput["language"]): string {
  return fill(loadPrompt("hooks.md"), {
    NICHE: niche,
    LANGUAGE: LANGUAGE_LABELS[language],
    SCHEMA: loadPrompt("schemas/hook_item.json"),
    HOOKS: hooks.map((h, i) => `${i + 1}. ${h}`).join("\n"),
  });
}

export function learningsSystem(): string {
  return loadPrompt("learnings.md");
}
