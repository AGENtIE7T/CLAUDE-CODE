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

/**
 * Rules the operator stated in prose that do not belong in the TaskPlan itself
 * (which is `.strict()`), but which the caller must honour: protected URLs,
 * and whether they asked for unattended application.
 */
export interface ExtractedRules {
  /** Glob patterns the operator said must never be modified. */
  protectedUrls: string[];
  /**
   * True when the instruction asks for changes to be applied without
   * per-item approval ("automatically", "autopilot"). This never grants
   * anything — it only signals that Autopilot rules should govern the run,
   * and Autopilot still issues an ordinary hash-bound approval.
   */
  autopilotRequested: boolean;
}

export interface ParseResult {
  plan: TaskPlan;
  /** Prohibited request detected in the raw text (validator will block). */
  prohibitedHint: string | null;
  notes: string[];
  rules: ExtractedRules;
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

function detectConstraints(t: string): {
  maxChanges: number;
  maxLinksPerPage?: number;
  maxLinksToSameTarget?: number;
  minConfidence: number;
} {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const num = (raw: string): number | null => {
    const n = words[raw.toLowerCase()] ?? Number(raw);
    return Number.isNaN(n) ? null : n;
  };

  let maxLinksPerPage: number | undefined;
  const lp = /\b(no\s+more\s+than|up\s+to|max(?:imum)?\s+of?)\s+(\d+|one|two|three|four|five)\s+links?\s+(per|to\s+each|in\s+each)\b/i.exec(t);
  if (lp) {
    const n = num(lp[2]);
    if (n !== null) maxLinksPerPage = Math.min(10, Math.max(0, n));
  }

  // "no more than 1 link to the same target/destination/page"
  let maxLinksToSameTarget: number | undefined;
  const st =
    /\b(no\s+more\s+than|up\s+to|max(?:imum)?\s+of?|only)\s+(\d+|one|two|three|four|five)\s+links?\s+to\s+(?:the\s+)?same\s+(?:target|destination|page|url)\b/i.exec(
      t,
    );
  if (st) {
    const n = num(st[2]);
    if (n !== null) maxLinksToSameTarget = Math.min(10, Math.max(0, n));
  }

  const mc = /\b(no\s+more\s+than|up\s+to|max(?:imum)?\s+of?)\s+(\d{1,3})\s+changes?\b/i.exec(t);
  const maxChanges = mc ? Math.min(100, Number(mc[2])) : 20;

  // Confidence. An EXPLICIT number always wins over the vague adjectives, so
  // "aggressive, but confidence at least 0.9" resolves to 0.9 rather than 0.7.
  let minConfidence = 0.8;
  if (/\bhigh(ly)?\s+confiden|only\s+(the\s+)?strong|conservative\b/i.test(t)) minConfidence = 0.9;
  if (/\baggressive|as\s+many\s+as\s+possible\b/i.test(t)) minConfidence = 0.7;

  // The number must sit immediately beside the word "confidence" (only the
  // listed connectors may intervene), so an unrelated figure elsewhere in the
  // sentence — "high confidence, limit this task to 25 pages" — cannot be
  // mistaken for a threshold.
  const explicit =
    /\bconfidence\s*(?:score|threshold|level)?\s*(?:of\s+)?(?:at\s+least\s+|above\s+|over\s+|>=?\s*|minimum\s+of\s+|min\s+)?(\d{1,3}(?:\.\d+)?)\s*(%)?/i.exec(
      t,
    ) ?? /(\d{1,3}(?:\.\d+)?)\s*(%)?\s+(?:or\s+(?:higher|better)\s+)?confidence\b/i.exec(t);
  if (explicit) {
    const raw = Number(explicit[1]);
    // "0.85" and "85%" and a bare "85" all mean the same threshold.
    const value = explicit[2] === "%" || raw > 1 ? raw / 100 : raw;
    if (!Number.isNaN(value) && value > 0 && value <= 1) {
      minConfidence = Math.round(value * 100) / 100;
    }
  }

  return { maxChanges, maxLinksPerPage, maxLinksToSameTarget, minConfidence };
}

/**
 * Phrases that put a URL out of bounds. Matching is deliberately narrow: a
 * trigger must be followed by an explicit path, so ordinary prose can never
 * silently protect (or, worse, un-protect) anything.
 */
const PROTECT_TRIGGERS =
  /\b(?:never|do\s+not|don't|avoid|exclude|except|protect(?:ed)?|off[-\s]?limits|stay\s+(?:away\s+)?off|leave\s+alone|keep\s+away\s+from)\b/gi;
const PATH_TOKEN = /\/[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9._~*-]*)*\*{0,2}/g;

/** Normalise an extracted path into a glob that also covers its children. */
function toProtectedGlob(path: string): string {
  const trimmed = path.replace(/[.,;:]+$/, "").replace(/\/$/, "");
  if (!trimmed || trimmed === "/") return "/**";
  return /[*?]/.test(trimmed) ? trimmed : `${trimmed}**`;
}

/**
 * Pull protected URL patterns out of prose. These are advisory input to the
 * website's protected-URL list — they widen protection, never narrow it, and
 * the write path re-checks the stored list regardless of what was parsed here.
 */
function detectProtectedUrls(t: string): string[] {
  const found = new Set<string>();
  PROTECT_TRIGGERS.lastIndex = 0;
  for (let m = PROTECT_TRIGGERS.exec(t); m; m = PROTECT_TRIGGERS.exec(t)) {
    // Read to the end of the clause: a sentence break ends the exclusion.
    const rest = t.slice(m.index + m[0].length);
    const stop = rest.search(/[.!?;]\s|$/);
    const clause = rest.slice(0, stop === -1 ? rest.length : stop);
    PATH_TOKEN.lastIndex = 0;
    for (let p = PATH_TOKEN.exec(clause); p; p = PATH_TOKEN.exec(clause)) {
      found.add(toProtectedGlob(p[0]));
    }
  }
  return [...found].slice(0, 50);
}

/**
 * Did the operator ask for changes to be applied without stopping at each one?
 * This NEVER grants anything. It only routes the batch through the Autopilot
 * rule engine, which still has to issue a revision-bound approval, and which
 * refuses outright unless the operator has separately enabled it.
 */
function detectAutopilot(t: string): boolean {
  if (/\b(?:do\s+not|don't|never)\s+(?:run\s+)?(?:on\s+)?auto(?:pilot|matically)?\b/i.test(t)) {
    return false;
  }
  return /\bauto\s?pilot\b|\bautomatic(?:ally)?\b|\bunattended\b|\bwithout\s+(?:asking|approval|me|stopping|confirmation)\b|\bon\s+my\s+behalf\b/i.test(
    t,
  );
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
  const { maxChanges, maxLinksPerPage, maxLinksToSameTarget, minConfidence } = detectConstraints(t);
  const rules: ExtractedRules = {
    protectedUrls: detectProtectedUrls(t),
    autopilotRequested: prohibitedHint ? false : detectAutopilot(t),
  };

  if (mode === "execute") {
    notes.push("Detected an execute request — this will require explicit approval of an exact revision.");
  }
  if (prohibitedHint) {
    notes.push(`Detected a prohibited request (${prohibitedHint}); it will be refused with a legitimate alternative.`);
  }
  if (rules.protectedUrls.length) {
    notes.push(`Treating ${rules.protectedUrls.join(", ")} as protected — they will never be modified.`);
  }
  if (rules.autopilotRequested) {
    notes.push(
      "Detected a request to apply changes unattended. Autopilot still has to be enabled for this website, and every change is still bound to an approved revision.",
    );
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
      ...(maxLinksToSameTarget !== undefined
        ? { max_links_to_same_target: maxLinksToSameTarget }
        : {}),
      minimum_confidence: minConfidence,
    },
    actions: [],
    requires_approval: mode === "execute",
    clarifications: [],
  };

  return { plan, prohibitedHint, notes, rules };
}
