/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Task registry — the explicit, exhaustive catalogue of what the system does.
 * ─────────────────────────────────────────────────────────────────────────
 *  Every task the natural-language layer can produce MUST exist here. A task
 *  that is not registered cannot run. Each entry declares its category, the
 *  mode it runs in, its default risk level, and the permission required to
 *  execute it. The policy validator (command/policy.ts) reads this registry —
 *  it is the single source of truth for "what is allowed".
 *
 *  Categories:
 *    read       read-only; crawl/analyze/report; never changes the site
 *    preview    produces recommendations / proposed revisions; never publishes
 *    write      changes the site or sends messages; ALWAYS requires approval
 *    prohibited never allowed; the parser must refuse and offer an alternative
 */

import type { Permission } from "@/lib/rbac/roles";
import type { Mode, RiskLevel } from "@/lib/seo/types";

export type TaskCategory = "read" | "preview" | "write" | "prohibited";

export interface TaskDef {
  category: TaskCategory;
  /** The mode this task runs in. Prohibited tasks have no runnable mode. */
  mode: Mode | null;
  risk: RiskLevel;
  /** Permission needed to run/execute. Null for prohibited (never runs). */
  permission: Permission | null;
  /** One-line human description shown in plans and reports. */
  description: string;
  /** For prohibited tasks: the legitimate thing to offer instead. */
  legitimateAlternative?: string;
}

// ── READ-ONLY TASKS ─────────────────────────────────────────────────────────
const READ_TASKS = {
  website_audit: "Full read-only SEO audit of the site.",
  crawl_website: "Crawl the site within scope and record pages.",
  page_inventory: "List discovered pages and their status.",
  sitemap_audit: "Check XML sitemap presence and validity.",
  robots_audit: "Check robots.txt presence and directives.",
  canonical_audit: "Check canonical tags across pages.",
  metadata_audit: "Find duplicate/missing titles & descriptions.",
  heading_audit: "Check heading structure (H1..Hn).",
  image_alt_audit: "Find images missing alt text.",
  broken_internal_link_audit: "Find broken internal links.",
  broken_external_link_audit: "Find broken outbound links.",
  orphan_page_audit: "Find pages with no internal inbound links.",
  click_depth_audit: "Compute click depth from the homepage.",
  internal_link_audit: "Analyze internal link graph.",
  external_link_audit: "Analyze outbound link health.",
  backlink_report: "Report known backlinks (read-only).",
  search_console_report: "Read Search Console performance data.",
  analytics_report: "Read Analytics data.",
} as const;

// ── PREVIEW TASKS ───────────────────────────────────────────────────────────
const PREVIEW_TASKS = {
  internal_link_suggestions: "Propose internal links (preview only).",
  metadata_suggestions: "Propose title/description changes.",
  schema_suggestions: "Propose JSON-LD schema.",
  external_citation_suggestions: "Propose authoritative outbound citations.",
  outreach_prospect_list: "Build a backlink-outreach prospect list.",
  outreach_draft: "Draft personalized outreach messages.",
  redirect_plan: "Propose a redirect plan.",
  robots_change_plan: "Propose robots.txt changes.",
  canonical_change_plan: "Propose canonical tag changes.",
} as const;

// ── WRITE TASKS (approval required) ─────────────────────────────────────────
const WRITE_TASKS = {
  insert_internal_links: "Insert approved internal links.",
  update_metadata: "Update titles/meta descriptions.",
  update_schema: "Update JSON-LD schema.",
  update_alt_text: "Update image alt text.",
  update_page_content: "Update page content.",
  create_redirect: "Create a redirect.",
  update_robots: "Update robots.txt.",
  update_sitemap: "Update the XML sitemap.",
  publish_content: "Publish content.",
  send_outreach_email: "Send an approved outreach email.",
} as const;

// ── PROHIBITED TASKS ────────────────────────────────────────────────────────
const PROHIBITED_TASKS = {
  mass_backlink_creation: "Legitimate alternative: build an outreach prospect list for manual review.",
  private_blog_network_creation: "Legitimate alternative: earn links via original research/digital PR.",
  automated_comment_links: "Legitimate alternative: genuine community participation, drafted for human posting.",
  automated_forum_links: "Legitimate alternative: genuine community participation, drafted for human posting.",
  fake_review_creation: "Legitimate alternative: ask real customers for honest reviews.",
  fake_testimonial_creation: "Legitimate alternative: collect verifiable testimonials with consent.",
  automated_link_exchanges: "Legitimate alternative: relevant editorial linking suggestions for your own site.",
  paid_link_manipulation: "Legitimate alternative: sponsored content that is properly disclosed and nofollow/sponsored.",
  mass_directory_submission: "Legitimate alternative: a short list of relevant, high-quality directories for manual submission.",
  unauthorized_crawling: "Legitimate alternative: crawl only sites you have verified ownership of.",
  credential_extraction: "Not supported.",
  third_party_publishing_without_authorization: "Legitimate alternative: draft outreach and let the site owner publish.",
  bulk_email_without_approval: "Legitimate alternative: prepare drafts for explicit per-batch approval.",
  bypass_website_security: "Not supported.",
  bypass_cms_permissions: "Not supported.",
} as const;

export type ReadTaskType = keyof typeof READ_TASKS;
export type PreviewTaskType = keyof typeof PREVIEW_TASKS;
export type WriteTaskType = keyof typeof WRITE_TASKS;
export type ProhibitedTaskType = keyof typeof PROHIBITED_TASKS;
export type TaskType =
  | ReadTaskType
  | PreviewTaskType
  | WriteTaskType
  | ProhibitedTaskType;

/** Build the full registry from the four groups above. */
function build(): Record<TaskType, TaskDef> {
  const reg = {} as Record<TaskType, TaskDef>;

  for (const [name, description] of Object.entries(READ_TASKS)) {
    reg[name as TaskType] = {
      category: "read",
      mode: "audit",
      risk: "low",
      permission: name.includes("crawl") ? "crawl.run" : "audit.run",
      description,
    };
  }
  for (const [name, description] of Object.entries(PREVIEW_TASKS)) {
    // Preview tasks that touch high-risk surfaces carry medium risk even in
    // preview, so the UI flags them; execution risk is set on the write task.
    const mediumSurface = /redirect|robots|canonical/.test(name);
    reg[name as TaskType] = {
      category: "preview",
      mode: "preview",
      risk: mediumSurface ? "medium" : "low",
      permission: "preview.create",
      description,
    };
  }
  for (const [name, description] of Object.entries(WRITE_TASKS)) {
    // High-risk write surfaces per the spec (Section 15).
    const highRisk =
      /redirect|robots|canonical|publish|delete|outreach/.test(name);
    reg[name as TaskType] = {
      category: "write",
      mode: "execute",
      risk: highRisk ? "high" : "medium",
      permission: name === "send_outreach_email" ? "outreach.send" : "revision.execute",
      description,
    };
  }
  for (const [name, legitimateAlternative] of Object.entries(PROHIBITED_TASKS)) {
    reg[name as TaskType] = {
      category: "prohibited",
      mode: null,
      risk: "prohibited",
      permission: null,
      description: "Prohibited operation.",
      legitimateAlternative,
    };
  }
  return reg;
}

export const TASK_REGISTRY: Record<TaskType, TaskDef> = build();

export function isKnownTask(name: string): name is TaskType {
  return name in TASK_REGISTRY;
}

export function getTask(name: string): TaskDef | null {
  return isKnownTask(name) ? TASK_REGISTRY[name] : null;
}

export function isProhibited(name: string): boolean {
  return getTask(name)?.category === "prohibited";
}

export function isWrite(name: string): boolean {
  return getTask(name)?.category === "write";
}

export function requiresApproval(name: string): boolean {
  const t = getTask(name);
  return t?.category === "write";
}

export function tasksByCategory(category: TaskCategory): TaskType[] {
  return (Object.keys(TASK_REGISTRY) as TaskType[]).filter(
    (k) => TASK_REGISTRY[k].category === category,
  );
}
