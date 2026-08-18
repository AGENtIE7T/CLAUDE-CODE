/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SEO Command Center — core domain types
 * ─────────────────────────────────────────────────────────────────────────
 *  These mirror the SQL schema in supabase/migrations/0002_seo_command_center.sql.
 *
 *  SEO Command Center is a SEPARATE product that lives alongside AEO Autopilot
 *  in the same app. It reuses the shared infrastructure (auth, Supabase, RLS,
 *  demo mode) but has its own tables, tasks, and safety model:
 *
 *    audit-first · preview-first · approval-based · reversible · fully logged
 */

export type Uuid = string;
export type Timestamp = string; // ISO 8601

// ── operating modes ────────────────────────────────────────────────────────
/** The three operating modes. Default is always `audit`. */
export type Mode = "audit" | "preview" | "execute";

/** Risk classification for a task or action. */
export type RiskLevel = "low" | "medium" | "high" | "prohibited";

// ── roles ──────────────────────────────────────────────────────────────────
/** Workspace roles, from most to least privileged. */
export type Role = "OWNER" | "ADMIN" | "SEO_MANAGER" | "EDITOR" | "VIEWER";

// ── websites ───────────────────────────────────────────────────────────────
export type Environment = "production" | "staging";
export type CmsType = "wordpress" | "shopify" | "custom" | "unknown";
export type OwnershipMethod =
  | "dns"
  | "html_file"
  | "meta_tag"
  | "search_console"
  | "cms_connection";

export interface Website {
  id: Uuid;
  workspaceId: Uuid;
  name: string;
  url: string;
  canonicalDomain: string;
  cmsType: CmsType;
  environment: Environment;
  status: "active" | "paused" | "archived";
  primaryCountry: string | null;
  primaryLanguage: string | null;
  ownershipVerifiedAt: Timestamp | null;
  ownershipMethod: OwnershipMethod | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WebsiteSettings {
  websiteId: Uuid;
  sitemapUrl: string | null;
  robotsUrl: string | null;
  includePatterns: string[];
  excludePatterns: string[];
  maxPagesPerCrawl: number;
  maxCrawlDepth: number;
  crawlFrequency: "manual" | "daily" | "weekly";
  auditExternalLinks: boolean;
  searchConsoleConnected: boolean;
  analyticsConnected: boolean;
}

/** URLs that may never be modified by any write task. */
export interface ProtectedUrl {
  id: Uuid;
  websiteId: Uuid;
  pattern: string; // glob-ish, e.g. "/checkout/*"
  reason: string | null;
  createdAt: Timestamp;
}

// ── connections ────────────────────────────────────────────────────────────
export type ConnectionKind =
  | "wordpress"
  | "shopify"
  | "custom"
  | "search_console"
  | "analytics"
  | "seo_data"
  | "email";

export type ConnectionAccess = "read_only" | "read_write";

export interface Connection {
  id: Uuid;
  workspaceId: Uuid;
  websiteId: Uuid | null;
  kind: ConnectionKind;
  label: string;
  access: ConnectionAccess;
  /** Minimum scopes granted. Never contains raw secrets. */
  scopes: string[];
  status: "connected" | "error" | "revoked";
  lastTestedAt: Timestamp | null;
  lastError: string | null;
  createdAt: Timestamp;
}

// ── tasks ──────────────────────────────────────────────────────────────────
export type TaskStatus =
  | "parsed"
  | "needs_clarification"
  | "planned"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "completed"
  | "rejected"
  | "failed"
  | "blocked";

export interface SeoTask {
  id: Uuid;
  workspaceId: Uuid;
  websiteId: Uuid | null;
  requestedBy: Uuid;
  taskType: string; // one of TaskType (registry.ts)
  rawInstruction: string;
  parsedPlan: unknown; // validated TaskPlan JSON
  mode: Mode;
  riskLevel: RiskLevel;
  status: TaskStatus;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
}

// ── previews / approvals / revisions ───────────────────────────────────────
export interface Preview {
  id: Uuid;
  taskId: Uuid;
  websiteId: Uuid;
  /** Hash of the current website state the preview was computed against. */
  contentHash: string;
  status: "open" | "approved" | "rejected" | "expired" | "stale";
  expiresAt: Timestamp;
  createdBy: Uuid;
  createdAt: Timestamp;
}

export interface Approval {
  id: Uuid;
  previewId: Uuid;
  workspaceId: Uuid;
  websiteId: Uuid;
  approvedBy: Uuid;
  /** Exact revision hash this approval authorizes — nothing else may execute. */
  approvedRevisionHash: string;
  approvedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface AuditLogEntry {
  id: Uuid;
  workspaceId: Uuid;
  userId: Uuid | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  inputHash: string | null;
  resultSummary: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Timestamp;
}
