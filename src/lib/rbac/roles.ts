/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Role-based access control — backend-enforced.
 * ─────────────────────────────────────────────────────────────────────────
 *  NEVER trust a role that arrives from the frontend. Every backend query and
 *  mutation resolves the caller's role from workspace membership and calls
 *  `can()` before acting.
 *
 *  Roles, most → least privileged:
 *    OWNER        full control incl. billing, members, ownership transfer
 *    ADMIN        manage websites/tasks/connections; cannot remove owner
 *    SEO_MANAGER  run crawls/audits, create previews; cannot publish writes
 *    EDITOR       review/edit/approve/reject content & link suggestions
 *    VIEWER       read-only
 */

import type { Role } from "@/lib/seo/types";

/** Every discrete capability the backend gates on. */
export type Permission =
  // workspace / members / billing
  | "workspace.manage"
  | "members.manage"
  | "billing.manage"
  | "ownership.transfer"
  // websites & connections
  | "website.create"
  | "website.update"
  | "website.delete"
  | "connection.manage"
  | "protected_url.manage"
  // read / audit (read-only tasks)
  | "task.read"
  | "crawl.run"
  | "audit.run"
  | "report.read"
  // preview generation
  | "preview.create"
  // approval decisions
  | "preview.approve"
  | "preview.reject"
  | "preview.edit"
  // write execution (publishing approved revisions)
  | "revision.execute"
  | "outreach.send"
  // recovery
  | "revision.rollback";

export const ROLES: readonly Role[] = [
  "OWNER",
  "ADMIN",
  "SEO_MANAGER",
  "EDITOR",
  "VIEWER",
] as const;

/**
 * The permission matrix. A permission is granted only if it is listed for the
 * caller's role. This is an allowlist — anything not listed is denied.
 */
const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([
    "workspace.manage",
    "members.manage",
    "billing.manage",
    "ownership.transfer",
    "website.create",
    "website.update",
    "website.delete",
    "connection.manage",
    "protected_url.manage",
    "task.read",
    "crawl.run",
    "audit.run",
    "report.read",
    "preview.create",
    "preview.approve",
    "preview.reject",
    "preview.edit",
    "revision.execute",
    "outreach.send",
    "revision.rollback",
  ]),
  ADMIN: new Set<Permission>([
    "workspace.manage",
    "members.manage", // but cannot remove owner — enforced separately in members.ts
    "website.create",
    "website.update",
    "website.delete",
    "connection.manage",
    "protected_url.manage",
    "task.read",
    "crawl.run",
    "audit.run",
    "report.read",
    "preview.create",
    "preview.approve",
    "preview.reject",
    "preview.edit",
    "revision.execute",
    "outreach.send",
    "revision.rollback",
  ]),
  SEO_MANAGER: new Set<Permission>([
    "task.read",
    "crawl.run",
    "audit.run",
    "report.read",
    "preview.create",
    // NOTE: no approve/execute — a manager proposes, someone else approves.
  ]),
  EDITOR: new Set<Permission>([
    "task.read",
    "report.read",
    "preview.create",
    "preview.approve",
    "preview.reject",
    "preview.edit",
    // Editors approve/reject content & link suggestions but do not manage
    // technical integrations, and cannot execute the CMS write themselves.
  ]),
  VIEWER: new Set<Permission>(["task.read", "report.read"]),
};

/** True iff `role` is granted `permission`. Pure, side-effect free. */
export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

/**
 * Throwing guard for use at the top of a mutation. `role` must be resolved
 * from the database (membership), never from a request body.
 */
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new AuthorizationError(role, permission);
  }
}

export class AuthorizationError extends Error {
  constructor(
    public readonly role: Role,
    public readonly permission: Permission,
  ) {
    // Deliberately generic message — do not leak matrix internals to clients.
    super(`Role ${role} is not permitted to ${permission}.`);
    this.name = "AuthorizationError";
  }
}

/** Rank for comparisons like "cannot remove someone senior to you". */
export function roleRank(role: Role): number {
  return ROLES.indexOf(role); // 0 = OWNER (most senior)
}

/** True iff `actor` outranks (is strictly more senior than) `target`. */
export function outranks(actor: Role, target: Role): boolean {
  return roleRank(actor) < roleRank(target);
}
