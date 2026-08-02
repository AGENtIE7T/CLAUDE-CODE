import type { AnswerEngine, AutonomyLevel, ChannelKind, ContentType } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  AEO Autopilot — central configuration
 * ─────────────────────────────────────────────────────────────────────────
 *  This is the one place to tune the product's behavior. Everything below is
 *  read by the rest of the codebase, so a change here changes the whole app —
 *  no need to hunt through files.
 *
 *  See docs/CONFIGURE.md for a "to change X, edit Y" map.
 */

export interface ChannelConfig {
  label: string;
  /** Default autonomy for the channel when an org is created. */
  defaultAutonomy: AutonomyLevel;
  /** Ceiling on posts per rolling 24h (cadence — keeps accounts human). */
  rateCapPerDay: number;
  /**
   * Whether this channel may EVER publish without a human. Set false for
   * platforms whose ToS forbid automated posting (community, directories).
   * This is the switch behind the approval-queue guarantee.
   */
  canAutoPublish: boolean;
  /** Shown on the Channels screen. */
  note: string;
}

export const appConfig = {
  // ── Content generation ──────────────────────────────────────────────────
  llm: {
    /** Override with AEO_MODEL env var; this is the fallback. */
    model: process.env.AEO_MODEL ?? "claude-sonnet-5",
    maxTokens: 4096,
  },

  // ── Answer engines we measure visibility against ────────────────────────
  engines: [
    "chatgpt",
    "perplexity",
    "google_ai_overviews",
    "claude",
    "gemini",
  ] as AnswerEngine[],

  // ── Content types the generator can produce ─────────────────────────────
  contentTypes: [
    "faq_page",
    "glossary",
    "comparison",
    "how_to",
    "stat_roundup",
    "community_answer",
    "social_post",
  ] as ContentType[],

  // ── Safety guards (thresholds are all tunable) ──────────────────────────
  guards: {
    /** Jaccard similarity above which content is treated as a near-duplicate. */
    dedupeThreshold: 0.85,
    /** Flag statistics that appear without a visible source. */
    requireSourceForStats: true,
  },

  // ── Channels: reach vs. risk, tuned per platform ────────────────────────
  channels: {
    owned_site: {
      label: "Owned site / blog",
      defaultAutonomy: "approval_queue",
      rateCapPerDay: 5,
      canAutoPublish: true,
      note: "Your property — safe to auto-publish.",
    },
    social: {
      label: "LinkedIn / X",
      defaultAutonomy: "approval_queue",
      rateCapPerDay: 3,
      canAutoPublish: true,
      note: "Auto with cadence limits once connected.",
    },
    directory: {
      label: "Directories (G2, Capterra)",
      defaultAutonomy: "approval_queue",
      rateCapPerDay: 1,
      canAutoPublish: false,
      note: "Assisted, one-time, human-verified.",
    },
    community: {
      label: "Reddit / Quora",
      defaultAutonomy: "approval_queue",
      rateCapPerDay: 1,
      canAutoPublish: false,
      note: "Draft-only. Auto-posting disabled by policy (ToS).",
    },
  } satisfies Record<ChannelKind, ChannelConfig>,
} as const;

export type AppConfig = typeof appConfig;

/** Channel kinds allowed to publish without human approval. */
export function autoPublishKinds(): ChannelKind[] {
  return (Object.keys(appConfig.channels) as ChannelKind[]).filter(
    (k) => appConfig.channels[k].canAutoPublish,
  );
}

export function channelConfig(kind: ChannelKind): ChannelConfig {
  return appConfig.channels[kind];
}
