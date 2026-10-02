/**
 * npm run test:live
 * Runs every fixture through the real two-pass pipeline, saves outputs to
 * tests/output, and prints a pass/fail table + average critic score.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveModel } from "../lib/anthropic";
import { runPipeline } from "../lib/pipeline";
import { BusinessInputSchema, type GenerationRecord } from "../lib/schema";

const ROOT = process.cwd();

// Minimal .env.local loader so the script works without extra deps.
for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local or export it, then re-run `npm run test:live`.");
  process.exit(2);
}

const only = process.argv.slice(2);
const fixtureDir = path.join(ROOT, "tests", "fixtures");
const outDir = path.join(ROOT, "tests", "output");
fs.mkdirSync(outDir, { recursive: true });
const fixtures = fs
  .readdirSync(fixtureDir)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !only.length || only.includes(f.replace(/\.json$/, "")));

interface Row {
  fixture: string;
  status: "PASS" | "FAIL" | "ERROR";
  scripts: number;
  initialFails: number;
  finalFails: number;
  avgScore: number | null;
  rewritten: number;
  seconds: number;
  cost: string;
  note: string;
}

async function main() {
  const model = resolveModel();
  console.log(`Model: ${model}. Fixtures: ${fixtures.join(", ")}\n`);
  const rows: Row[] = [];

  for (const f of fixtures) {
    const name = f.replace(/\.json$/, "");
    const t0 = Date.now();
    try {
      const inputs = BusinessInputSchema.parse(JSON.parse(fs.readFileSync(path.join(fixtureDir, f), "utf8")));
      const rec: GenerationRecord = await runPipeline({
        inputs,
        model,
        onStage: (s) => process.stdout.write(`  [${name}] ${s}\n`),
      });
      fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rec, null, 2));
      const totals = rec.critic.scores.map((s) => s.total);
      const final = rec.checks.final.filter((c) => c.check !== "score_inflation");
      rows.push({
        fixture: name,
        status: final.length === 0 ? "PASS" : "FAIL",
        scripts: rec.output.scripts.length,
        initialFails: rec.checks.initial.length,
        finalFails: rec.checks.final.length,
        avgScore: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null,
        rewritten: rec.critic.scores.filter((s) => s.rewritten).length,
        seconds: Math.round((Date.now() - t0) / 1000),
        cost: rec.usage.cost_usd != null ? `$${rec.usage.cost_usd.toFixed(3)}` : `${rec.usage.input_tokens + rec.usage.output_tokens} tok`,
        note: rec.checks.final.map((c) => `${c.script_id ?? "batch"}:${c.check}`).join(", "),
      });
    } catch (e) {
      rows.push({
        fixture: name,
        status: "ERROR",
        scripts: 0,
        initialFails: 0,
        finalFails: 0,
        avgScore: null,
        rewritten: 0,
        seconds: Math.round((Date.now() - t0) / 1000),
        cost: "-",
        note: (e as Error).message.slice(0, 120),
      });
    }
  }

  console.log("");
  console.table(
    rows.map((r) => ({
      fixture: r.fixture,
      result: r.status,
      scripts: r.scripts,
      "checks failed (gen)": r.initialFails,
      "checks failed (final)": r.finalFails,
      "avg critic score": r.avgScore ?? "-",
      "rewritten by critic": r.rewritten,
      secs: r.seconds,
      cost: r.cost,
    })),
  );
  for (const r of rows) if (r.note) console.log(`${r.fixture}: ${r.note}`);
  console.log(`\nOutputs saved to ${path.relative(ROOT, outDir)}/`);
  process.exit(rows.every((r) => r.status === "PASS") ? 0 : 1);
}

main();
