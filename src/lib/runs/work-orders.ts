/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Work orders — a previewed change waiting for a human decision.
 * ─────────────────────────────────────────────────────────────────────────
 *  A work order stores the EXACT revision that was previewed. Approving it
 *  approves those precise bytes, not "the idea of adding that link": at apply
 *  time the execute engine re-reads the page and refuses if it no longer
 *  matches what was previewed.
 *
 *  Storing the revision rather than re-deriving it at approval time is the
 *  whole safety property. Re-deriving would mean the operator approves one
 *  diff and the system applies whatever the analysis produces a minute later.
 *
 *  Work orders expire. An expired one cannot be approved — the preview it was
 *  built from is too old to trust, so it has to be regenerated and re-read.
 */

import type { Revision } from "@/lib/revisions/revision";
import type { LinkCandidate } from "@/lib/linking/engine";

export interface WorkOrderCandidate {
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  confidence: number;
  reason: string;
}

export type WorkOrderStatus = "pending" | "approved" | "applied" | "rejected" | "expired" | "failed";

export interface WorkOrder {
  id: string;
  websiteId: string;
  workspaceId: string;
  instruction: string;
  /** The precise bytes an approval binds to. */
  revision: Revision;
  /** Every link this work order would add. Always at least one. */
  candidates: WorkOrderCandidate[];
  status: WorkOrderStatus;
  createdAt: string;
  expiresAt: number;
  /** Set once a decision is made. */
  decidedAt: string | null;
  outcome: string | null;
}

interface OrderState {
  orders: WorkOrder[];
}

const g = globalThis as unknown as { __seoWorkOrders?: OrderState };

function state(): OrderState {
  if (!g.__seoWorkOrders) g.__seoWorkOrders = { orders: [] };
  return g.__seoWorkOrders;
}

export const DEFAULT_WORK_ORDER_TTL_MINUTES = 30;

export function createWorkOrder(input: {
  websiteId: string;
  workspaceId: string;
  instruction: string;
  revision: Revision;
  candidates: LinkCandidate[];
  ttlMinutes?: number;
  now?: () => number;
}): WorkOrder {
  const now = input.now ?? Date.now;
  const ttl = (input.ttlMinutes ?? DEFAULT_WORK_ORDER_TTL_MINUTES) * 60_000;
  const order: WorkOrder = {
    id: `wo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    websiteId: input.websiteId,
    workspaceId: input.workspaceId,
    instruction: input.instruction,
    revision: input.revision,
    candidates: input.candidates.map((c) => ({
      sourceUrl: c.sourceUrl,
      targetUrl: c.targetUrl,
      anchor: c.anchor,
      confidence: c.confidence,
      reason: c.reason,
    })),
    status: "pending",
    createdAt: new Date(now()).toISOString(),
    expiresAt: now() + ttl,
    decidedAt: null,
    outcome: null,
  };
  state().orders.unshift(order);
  state().orders.splice(200);
  return order;
}

/** Fetch a work order, marking it expired if its window has passed. */
export function getWorkOrder(id: string, now: () => number = Date.now): WorkOrder | null {
  const order = state().orders.find((o) => o.id === id);
  if (!order) return null;
  if (order.status === "pending" && now() > order.expiresAt) order.status = "expired";
  return order;
}

export function listWorkOrders(workspaceId: string, now: () => number = Date.now): WorkOrder[] {
  return state()
    .orders.filter((o) => o.workspaceId === workspaceId)
    .map((o) => getWorkOrder(o.id, now) ?? o);
}

export function settleWorkOrder(
  id: string,
  status: Exclude<WorkOrderStatus, "pending">,
  outcome: string,
  now: () => number = Date.now,
): WorkOrder | null {
  const order = state().orders.find((o) => o.id === id);
  if (!order) return null;
  order.status = status;
  order.outcome = outcome;
  order.decidedAt = new Date(now()).toISOString();
  return order;
}

export function __resetWorkOrders(): void {
  g.__seoWorkOrders = { orders: [] };
}
