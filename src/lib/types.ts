/**
 * Core domain types for AEO Autopilot.
 * These mirror the Supabase schema in supabase/migrations/0001_init.sql.
 */

export type Uuid = string;
export type Timestamp = string; // ISO 8601

/** Answer engines we measure visibility against. */
export type AnswerEngine =
  | "chatgpt"
  | "perplexity"
  | "google_ai_overviews"
  | "claude"
  | "gemini";

/** Channel families the posting engine publishes to. */
export type ChannelKind =
  | "owned_site" // customer's own domain — fully automatic
  | "social" // LinkedIn / X / Threads — auto with cadence limits
  | "directory" // G2 / Capterra / AlternativeTo — assisted, verified
  | "community"; // Reddit / Quora / Stack Exchange — approval required

/** Per-channel autonomy posture. Default is `approval_queue`. */
export type AutonomyLevel = "approval_queue" | "semi_auto" | "fully_auto";

/** The answer-shaped asset formats that get cited by AI. */
export type ContentType =
  | "faq_page"
  | "glossary"
  | "comparison" // "X vs Y"
  | "how_to"
  | "stat_roundup"
  | "community_answer"
  | "social_post";

export type ContentStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "failed";

export interface Organization {
  id: Uuid;
  name: string;
  domain: string;
  brandGuide: string | null;
  plan: "free" | "starter" | "growth";
  createdAt: Timestamp;
}

export interface PromptSet {
  id: Uuid;
  orgId: Uuid;
  query: string;
  intent: "definitional" | "comparative" | "how_to" | "commercial";
  priority: number; // 1 (highest) .. 5
  createdAt: Timestamp;
}

export interface ContentItem {
  id: Uuid;
  orgId: Uuid;
  promptId: Uuid | null;
  type: ContentType;
  channelKind: ChannelKind;
  title: string;
  body: string; // markdown
  schemaJsonLd: Record<string, unknown> | null;
  status: ContentStatus;
  createdAt: Timestamp;
}

export interface Channel {
  id: Uuid;
  orgId: Uuid;
  kind: ChannelKind;
  label: string;
  autonomyLevel: AutonomyLevel;
  /** Max posts per rolling 24h. Keeps accounts human and within API limits. */
  rateCapPerDay: number;
  connected: boolean;
}

export interface Publication {
  id: Uuid;
  contentId: Uuid;
  channelId: Uuid;
  url: string | null;
  state: "queued" | "posting" | "live" | "error";
  postedAt: Timestamp | null;
  error: string | null;
}

export interface VisibilityProbe {
  id: Uuid;
  orgId: Uuid;
  engine: AnswerEngine;
  prompt: string;
  mentioned: boolean;
  citedUrls: string[];
  measuredAt: Timestamp;
}
