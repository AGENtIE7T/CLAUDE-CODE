/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Natural-language command parser.
 * ─────────────────────────────────────────────────────────────────────────
 *  Turns a plain-English instruction into a structured TaskPlan candidate.
 *  This is a DETERMINISTIC, rule-based parser so the whole pipeline works with
 *  no LLM key (demo-safe) and is unit-testable. In live mode an LLM can produce
 *  the same TaskPlan shape for higher accuracy — but the output ALWAYS passes
 *  through the strict schema (command/schema.ts) and policy validator
 *  (command/policy.ts) before anything runs, so parser quality can never widen
 *  what is permitted.
 *
 *  The user's instruction is treated as intent, never as code. It never grants
 *  permissions, changes policy, or bypasses approval — those are enforced
 *  downstream regardless of what the text says.
 */

import type { TaskPlan } from "@/lib/command/schema";

export interface ParseResult {
  plan: TaskPlan;
  /** Prohibited request detected in the raw text (validator will block). */
  prohibitedHint: string | null;
  notes: string[];
}

// Phrases that indicate a prohibited request (mapped to a registry-ish label).
const PROHIBITED_HINTS: { re: RegExp; label: string }[] = [
  { re: /\b(buy|purchase|sell|paid)\b[\w\s]{0,15}\b(back\s?)?links?\b/i, label: "paid_link_manipulation" },
  { re: /\bmass\s+(back)?links?\b|\blink\s+farm\b/i, label: "mass_backlink_creation" },
  { re: /\b(pbn|private\s+blog\s+network)\b/i, label: "private_blog_network_creation" },
  { re: /\b(comment|forum)\s+spam\b|\bpost\s+comments?\s+with\s+links?\b/i, label: "automated_comment_links" },
  { re: /\bfake\s+(reviews?|testimonials?)\b/i, label: "fake_review_creation" },
  { re: /\blink\s+exchange(s)?\b/i, label: "automated_link_exchanges" },
  { re: /\bmass\s+(directory|directories)\b|\bsubmit\s+to\s+\d+\s+director/i, label: "mass_directory_submission" },
  { re: /\bsend\s+bulk\b|\bblast\b.*\bemail/i, label: "bulk_email_without_approval" },
];

function detectProhibited(text: string): string | null {
  for (const { re, label } of PROHIBITED_HINTS) if (re.test(text)) return label;
  return null;
}

function detectTaskType(t: string): TaskPlan["task_type"] {
  // "broken links" is always an AUDIT, never a linking-build request. Decide
  // this before the linking patterns so "broken internal links" ≠ linking.
  if (/\bbroken\b[\s\w]{0,20}\blinks?\b|\blinks?\b[\s\w]{0,20}\bbroken\b/i.test(t)) {
    return /\bexternal|outbound\b/i.test(t) ? "external_link_audit" : "audit";
  }
  // Building/suggesting internal links.
  if (/\binterlink|internal\s+linking\b/i.test(t)) return "internal_linking";
  if (/\blinks?\s+(from|between)\b/i.test(t)) return "internal_linking";
  if (/\b(suggest|add|insert|propose)\b[\s\w]{0,20}\blinks?\b/i.test(t)) return "internal_linking";

  if (/\bmeta\s*(data|description)?|title\s+tag/i.test(t)) return "metadata";
  if (/\bschema|json-?ld|structured\s+data/i.test(t)) return "schema";
  if (/\bcitation|authoritative\s+source|external\s+source/i.test(t)) return "citation_suggestions";
  if (/\bexternal\s+link|outbound\s+link/i.test(t)) return "external_link_audit";
  if (/\bbacklink|unlinked\s+mention|outreach\s+prospect/i.test(t)) return "backlink_monitoring";
  if (/\boutreach|draft.*(email|message)/i.test(t)) return "outreach_draft";
  if (/\bcrawl\b/i.test(t)) return "crawl";
  return "audit";
}

function detectMode(t: string): TaskPlan["mode"] {
  // Execute requires explicit, unambiguous action verbs.
  if (/\b(apply|publish|insert the|make the changes?|execute|go live|update the (live|site))\b/i.test(t)) {
    return "execute";
  }
  if (/\b(suggest|preview|recommend|draft|propose|plan|show me (the )?changes)\b/i.test(t)) {
    return "preview";
  }
  // "show a preview only" / "preview only"
  if (/\bpreview\s+only\b/i.test(t)) return "preview";
  return "audit";
}

function detectScope(t: string): { include: string[]; exclude: string[]; pageLimit: number } {
  const include: string[] = [];
  const exclude: string[] = [];

  const pathMap: [RegExp, string][] = [
    [/\bblog(s|\s+posts?|\s+articles?)?\b/i, "/blog/"],
    [/\bproducts?\b/i, "/products/"],
    [/\bservices?\b/i, "/services/"],
    [/\bcategor(y|ies)\b/i, "/category/"],
  ];
  for (const [re, path] of pathMap) {
    if (re.test(t)) {
      // "do not touch/modify/change X" or "except X" → exclude.
      const negated = new RegExp(
        `(do\\s+not|don't|never|avoid|except|exclude)\\s+\\w*\\s*${re.source}`,
        "i",
      ).test(t);
      (negated ? exclude : include).push(path);
    }
  }

  let pageLimit = 100;
  const lim = /\b(limit(?:ed)?\s+(?:this\s+)?(?:task\s+)?to|no\s+more\s+than|up\s+to|max(?:imum)?\s+of?)\s+(\d{1,4})\s+pages?\b/i.exec(t);
  if (lim) pageLimit = Math.min(1000, Math.max(1, Number(lim[2])));

  return { include, exclude, pageLimit };
}

function detectConstraints(t: string): { maxChanges: number; maxLinksPerPage?: number; minConfidence: number } {
  let maxLinksPerPage: number | undefined;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const lp = /\b(no\s+more\s+than|up\s+to|max(?:imum)?\s+of?)\s+(\d+|one|two|three|four|five)\s+links?\s+(per|to\s+each|in\s+each)\b/i.exec(t);
  if (lp) {
    const n = words[lp[2].toLowerCase()] ?? Number(lp[2]);
    if (!Number.isNaN(n)) maxLinksPerPage = Math.min(10, Math.max(0, n));
  }
  const mc = /\b(no\s+more\s+than|up\s+to|max(?:imum)?\s+of?)\s+(\d{1,3})\s+changes?\b/i.exec(t);
  const maxChanges = mc ? Math.min(100, Number(mc[2])) : 20;

  // Confidence: default 0.8 unless the user asks for high/only-strong.
  let minConfidence = 0.8;
  if (/\bhigh(ly)?\s+confiden|only\s+(the\s+)?strong|conservative\b/i.test(t)) minConfidence = 0.9;
  if (/\baggressive|as\s+many\s+as\s+possible\b/i.test(t)) minConfidence = 0.7;

  return { maxChanges, maxLinksPerPage, minConfidence };
}

function riskFor(mode: TaskPlan["mode"], prohibited: string | null): TaskPlan["risk_level"] {
  if (prohibited) return "prohibited";
  if (mode === "execute") return "medium"; // registry raises to high where needed
  return "low";
}

export interface ParseContext {
  websiteId: string | null;
}

/** Parse an instruction into a TaskPlan candidate (still unvalidated). */
export function parseInstruction(instruction: string, ctx: ParseContext): ParseResult {
  const t = instruction.trim();
  const notes: string[] = [];
  const prohibitedHint = detectProhibited(t);

  const task_type = detectTaskType(t);
  const mode = prohibitedHint ? "audit" : detectMode(t);
  const { include, exclude, pageLimit } = detectScope(t);
  const { maxChanges, maxLinksPerPage, minConfidence } = detectConstraints(t);

  if (mode === "execute") {
    notes.push("Detected an execute request — this will require explicit approval of an exact revision.");
  }
  if (prohibitedHint) {
    notes.push(`Detected a prohibited request (${prohibitedHint}); it will be refused with a legitimate alternative.`);
  }

  const plan: TaskPlan = {
    task_type,
    mode,
    risk_level: riskFor(mode, prohibitedHint),
    website_id: ctx.websiteId,
    scope: { include_patterns: include, exclude_patterns: exclude, page_limit: pageLimit },
    constraints: {
      max_changes: maxChanges,
      ...(maxLinksPerPage !== undefined ? { max_links_per_page: maxLinksPerPage } : {}),
      minimum_confidence: minConfidence,
    },
    actions: [],
    requires_approval: mode === "execute",
    clarifications: [],
  };

  return { plan, prohibitedHint, notes };
}
