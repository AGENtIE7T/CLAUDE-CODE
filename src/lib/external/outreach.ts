/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Outreach drafts + tracked review queue (Section 12).
 * ─────────────────────────────────────────────────────────────────────────
 *  Generates PERSONALIZED outreach DRAFTS and moves them through review stages.
 *  Sending is a hard-gated, separate step: no email is ever sent without an
 *  explicit approved batch (final recipient list + exact message + rate check +
 *  audit). This module never sends; it only drafts and tracks. No guarantees
 *  about rankings are ever produced.
 */

export type OutreachStage = "draft" | "in_review" | "approved" | "sent" | "rejected";

export interface OutreachDraft {
  id: string;
  prospectDomain: string;
  recipient: string | null;
  subject: string;
  body: string;
  stage: OutreachStage;
  /** Personalization tokens that were filled — for transparency. */
  personalization: Record<string, string>;
  createdAt: string;
}

export interface DraftInput {
  prospectDomain: string;
  recipient?: string | null;
  senderName: string;
  brand: string;
  /** Why we're reaching out — e.g. "unlinked mention", "relevant resource". */
  reason: string;
  /** The specific page/snippet we reference, for genuine personalization. */
  context: string;
}

const BANNED_CLAIMS = [/guarantee.{0,10}rank/i, /#1 on google/i, /instant traffic/i];

/** Reject copy that makes prohibited promises. */
export function isCompliantCopy(text: string): boolean {
  return !BANNED_CLAIMS.some((re) => re.test(text));
}

let counter = 0;
function id(): string {
  counter += 1;
  return `draft_${Date.now().toString(36)}_${counter}`;
}

/** Create a single personalized draft in the `draft` stage. */
export function createDraft(input: DraftInput): OutreachDraft {
  const subject = `Quick note about ${input.context.slice(0, 40)}`.trim();
  const body = [
    `Hi,`,
    ``,
    `I'm ${input.senderName} from ${input.brand}. I came across ${input.prospectDomain} — ${input.reason}.`,
    ``,
    `Specifically: ${input.context}`,
    ``,
    `If it's useful to your readers, I'd be glad to share more. Either way, thanks for the great work.`,
    ``,
    `Best,`,
    `${input.senderName}`,
  ].join("\n");

  return {
    id: id(),
    prospectDomain: input.prospectDomain,
    recipient: input.recipient ?? null,
    subject,
    body,
    stage: "draft",
    personalization: { reason: input.reason, context: input.context.slice(0, 120) },
    createdAt: new Date().toISOString(),
  };
}

/** Valid stage transitions — enforced so drafts can't jump straight to sent. */
const TRANSITIONS: Record<OutreachStage, OutreachStage[]> = {
  draft: ["in_review", "rejected"],
  in_review: ["approved", "rejected"],
  approved: ["sent", "rejected"],
  sent: [],
  rejected: [],
};

export function canTransition(from: OutreachStage, to: OutreachStage): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface SendBatchRequest {
  drafts: OutreachDraft[];
  /** Explicit, final recipient list the user confirmed. */
  approvedRecipients: string[];
  /** Per-window send cap. */
  ratePerHour: number;
  sentThisHour: number;
  /** Must be true — the human confirmed this exact batch. */
  humanApproved: boolean;
}

export type SendGateResult =
  | { ok: true; toSend: OutreachDraft[] }
  | { ok: false; reason: string };

/**
 * The send gate. This does NOT send — it decides whether a send would be
 * permitted, enforcing every Section-12 precondition. The actual transport is a
 * separate approved connector call, only reached when this returns ok.
 */
export function evaluateSendGate(req: SendBatchRequest): SendGateResult {
  if (!req.humanApproved) return { ok: false, reason: "no explicit human approval for this batch" };
  if (req.approvedRecipients.length === 0) return { ok: false, reason: "empty approved recipient list" };

  const toSend = req.drafts.filter(
    (d) => d.stage === "approved" && d.recipient && req.approvedRecipients.includes(d.recipient),
  );
  if (toSend.length === 0) return { ok: false, reason: "no approved drafts match the confirmed recipients" };

  for (const d of toSend) {
    if (!isCompliantCopy(`${d.subject}\n${d.body}`)) {
      return { ok: false, reason: `draft ${d.id} contains a prohibited claim` };
    }
  }

  const remaining = req.ratePerHour - req.sentThisHour;
  if (remaining <= 0) return { ok: false, reason: "hourly send rate cap reached" };
  if (toSend.length > remaining) {
    return { ok: false, reason: `batch of ${toSend.length} exceeds remaining rate budget (${remaining})` };
  }

  return { ok: true, toSend };
}
