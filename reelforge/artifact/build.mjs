// Builds artifact/reelforge.html (the no-API-key Claude artifact) from the
// same prompt files, schemas and niches the Next.js app uses.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const schemaTs = read("lib/schema.ts");
const version = schemaTs.match(/PROMPT_VERSION = "([^"]+)"/)[1];

const DATA = {
  promptVersion: version,
  niches: JSON.parse(read("lib/niches.json")),
  viral: JSON.parse(read("lib/viral_patterns.json")),
  prompts: {
    generator: read("lib/prompts/generator.md"),
    critic: read("lib/prompts/critic.md"),
    learnings: read("lib/prompts/learnings.md"),
    hooks: read("lib/prompts/hooks.md"),
  },
  schemas: {
    generator: read("lib/prompts/schemas/generator.json"),
    script: read("lib/prompts/schemas/script.json"),
    hook: read("lib/prompts/schemas/hook_item.json"),
    critic: read("lib/prompts/schemas/critic.json"),
  },
};

const tpl = read("artifact/template.html");
const json = JSON.stringify(DATA).replace(/</g, "\\u003c");
const out = tpl.replace("/*__DATA__*/null", json);
fs.writeFileSync(path.join(here, "reelforge.html"), out);
console.log(`wrote artifact/reelforge.html (${(out.length / 1024).toFixed(0)} KB, prompt ${version})`);
