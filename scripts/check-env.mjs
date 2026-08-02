#!/usr/bin/env node
/**
 * Env doctor. Reads .env.local and reports whether you're set up for demo or
 * live mode, and exactly what's missing. Run: `npm run check`
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const has = (k) => Boolean(env[k] && env[k].trim() && !env[k].includes("YOUR-"));
const mask = (v) => (!v ? "" : v.length <= 8 ? "•".repeat(v.length) : v.slice(0, 4) + "…" + v.slice(-4));
const mark = (ok) => (ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");

const demo = env.NEXT_PUBLIC_DEMO_MODE === "1" || !has("NEXT_PUBLIC_SUPABASE_URL");

console.log(`\nAEO Autopilot — environment check\n`);
console.log(`Mode: ${demo ? "\x1b[33mDEMO\x1b[0m (seeded data, no keys needed)" : "\x1b[32mLIVE\x1b[0m (real database + auth)"}\n`);

const required = [
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL", true],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key", true],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service_role key", true],
  ["ANTHROPIC_API_KEY", "Anthropic API key (content generation)", true],
  ["AHREFS_API_TOKEN", "Ahrefs Brand Radar token (optional)", false],
];

let missing = 0;
for (const [key, label, needed] of required) {
  const ok = has(key);
  if (!ok && needed) missing++;
  console.log(`  ${mark(ok || !needed)} ${key.padEnd(32)} ${ok ? mask(env[key]) : needed ? "\x1b[31mmissing\x1b[0m" : "not set (ok)"}  — ${label}`);
}

console.log("");
if (demo) {
  console.log("You're in DEMO mode. `npm run dev` works right now with no keys.");
  console.log("To go live, fill the Supabase + Anthropic values in .env.local (see GO_LIVE.md).\n");
} else if (missing > 0) {
  console.log(`\x1b[31m${missing} required value(s) missing for live mode.\x1b[0m See GO_LIVE.md.\n`);
  process.exitCode = 1;
} else {
  console.log("\x1b[32mAll set for LIVE mode.\x1b[0m Make sure you've run the migration (GO_LIVE.md step 3), then `npm run dev`.\n");
}
