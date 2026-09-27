#!/usr/bin/env node
/**
 * Write the staging content pack as a WordPress import file.
 *
 *   node scripts/make-staging-content.mjs [--site https://your-site] [--out FILE]
 *
 * Import the result with: wp-admin → Tools → Import → WordPress.
 * Nothing here touches the network or reads any credential.
 */
import { writeFileSync } from "node:fs";
import { SEED_CONTENT, toWxr } from "./staging-seed.mjs";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
};

const siteUrl = flag("site", "https://example.com").replace(/\/+$/, "");
const out = flag("out", "staging-content.xml");

writeFileSync(out, toWxr({ siteUrl }), "utf8");

const pages = SEED_CONTENT.filter((c) => c.type === "page").length;
const posts = SEED_CONTENT.filter((c) => c.type === "post").length;

console.log(`Wrote ${out}`);
console.log(`  ${pages} service pages, ${posts} blog posts, all published.`);
console.log("");
console.log("Import it:  wp-admin → Tools → Import → WordPress → Upload file and import");
console.log("Then check: the pages appear under /services/ and the posts under /blog/");
console.log("");
console.log("This is sample content for a DISPOSABLE staging site. Do not import into production.");
