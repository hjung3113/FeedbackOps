// Permission check application service.
//
// Owns the read-side of the Permission module per
// docs/implementation/02-domain-module-boundaries.md. All capability checks
// in the codebase MUST go through `checkCapability` — controllers and other
// modules never reach into `permission_grants` / `permission_denies` /
// `permission_requests` directly. AGENTS.md:65-66 ("Backend application
// services own permissions") locks this boundary.
//
// Check order: docs/implementation/05-permission-policy.md:23-31 —
//   1. workspace context → workspace_mismatch
//   2. explicit deny      → explicit_deny
//   3. direct grant       → allow via direct_grant (or grant_expired/revoked)
//   4. role-derived       → allow via role
//   5. managed-system     → (Slice 1: branch wired, zero seeded scopes)
//   6. requestable check  → compute fallback request candidates
//
// Slice 1 role rule (issue #4):
//   - Admin satisfies workspace.read AND workspace.admin via role.
//   - User satisfies workspace.read via role; workspace.admin falls through.

import { and, eq, isNull } from 'drizzle-orm';

import type { Capability } from '@fops/shared';
import type { Db } from '../../db/client.js';
import { permissionDenies, permissionGrants } from '../../db/schema/permission.js';

// ──────────────────────────────────────────────────────────────────────────
// Decision shape — locked verbatim by issue #4. Do not extend without an
// ADR; downstream code (state mapper, frontend gate) discriminates on these
// fields by name.
// ──────────────────────────────────────────────────────────────────────────

export type DenyReason =
  | 'workspace_mismatch'
  | 'explicit_deny'
  | 'no_grant'
  | 'grant_expired'
  | 'grant_revoked'
  | 'sensitive_reason_missing';

export interface RequestableScope {
  workspace_id: string;
  managed_system_id?: string;
}

export type Decision =
  | { allow: true; via: 'direct_grant' | 'role' | 'managed_system_scope'; grant_id?: string }
  | { allow: false; reason: DenyReason; requestable: RequestableScope[] | null };

export interface ActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: string; // 'admin' | 'developer' | 'user' (lower-case in DB)
}

export interface CheckScope {
  /** Workspace the actor is *attempting* to act in. */
  workspace_id: string;
  /** Optional MS scope; Slice 1 always falls through. */
  managed_system_id?: string;
}

export interface CheckServiceDeps {
  db: Db;
  now?: () => Date;
}

export type CheckService = ReturnType<typeof createCheckService>;

export function createCheckService(deps: CheckServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function checkCapability(
    actor: ActorContext,
    capability: Capability,
    scope: CheckScope,
  ): Promise<Decision> {
    // (1) workspace context — actor must be acting inside their own workspace.
    if (actor.workspace_id !== scope.workspace_id) {
      return { allow: false, reason: 'workspace_mismatch', requestable: null };
    }

    // (2) explicit deny — any active deny row (revoked_at IS NULL) blocks
    // before any grant or role check. 05-policy:33.
    const denyRows = await deps.db
      .select({ id: permissionDenies.id })
      .from(permissionDenies)
      .where(
        and(
          eq(permissionDenies.workspaceId, actor.workspace_id),
          eq(permissionDenies.actorId, actor.actor_id),
          eq(permissionDenies.capability, capability),
          isNull(permissionDenies.revokedAt),
        ),
      )
      .limit(1);
    if (denyRows.length > 0) {
      return { allow: false, reason: 'explicit_deny', requestable: null };
    }

    // (3) direct capability grant. Active = NOT revoked AND (expires_at NULL
    // OR expires_at > now()). We fetch all rows for (actor, capability) and
    // classify rather than filtering in SQL so we can distinguish
    // grant_expired / grant_revoked from no_grant in a single round-trip.
    const grantRows = await deps.db
      .select({
        id: permissionGrants.id,
        revokedAt: permissionGrants.revokedAt,
        expiresAt: permissionGrants.expiresAt,
        managedSystemId: permissionGrants.managedSystemId,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.workspaceId, actor.workspace_id),
          eq(permissionGrants.actorId, actor.actor_id),
          eq(permissionGrants.capability, capability),
        ),
      );

    const rightNow = now();
    let sawRevoked = false;
    let sawExpired = false;
    for (const row of grantRows) {
      // Slice 1 only matches workspace-scoped grants (no MS scope on the
      // check input). When scope.managed_system_id is supplied, the grant's
      // managed_system_id must match exactly; null grants do not satisfy a
      // scoped check. (Slice 2 will exercise this branch.)
      if (scope.managed_system_id !== undefined) {
        if (row.managedSystemId !== scope.managed_system_id) continue;
      } else {
        // Workspace-level check: ignore MS-scoped grants here; they're for
        // step 5, not step 3.
        if (row.managedSystemId !== null) continue;
      }
      if (row.revokedAt !== null) {
        sawRevoked = true;
        continue;
      }
      if (row.expiresAt !== null && row.expiresAt.getTime() <= rightNow.getTime()) {
        sawExpired = true;
        continue;
      }
      return { allow: true, via: 'direct_grant', grant_id: row.id };
    }

    // (4) role-derived capability — Slice 1 rule (issue #4 locked):
    if (roleSatisfies(actor.role_level, capability)) {
      return { allow: true, via: 'role' };
    }

    // (5) managed-system scope — Slice 1 has zero MS scopes seeded; branch
    // kept wired so S1.2 plugs in without a service rewrite.
    // TODO(S1.2): consult MS-scoped grants when scope.managed_system_id is
    // null but the capability is MS-eligible.

    // If we saw a revoked or expired grant earlier and nothing else allowed,
    // surface that distinct reason. Revoked takes precedence over expired
    // because revocation is an intentional action vs. passive expiry.
    if (sawRevoked) {
      return { allow: false, reason: 'grant_revoked', requestable: null };
    }
    if (sawExpired) {
      return { allow: false, reason: 'grant_expired', requestable: null };
    }

    // (6) requestable computation (Slice 1): no explicit deny here, so the
    // actor MAY request workspace-only scope on this capability. Slice 2
    // extends with MS scope candidates.
    const requestable: RequestableScope[] = [{ workspace_id: actor.workspace_id }];
    return { allow: false, reason: 'no_grant', requestable };
  }

  return { checkCapability };
}

function roleSatisfies(roleLevel: string, capability: Capability): boolean {
  // role_level is stored lower-case (core.actors CHECK constraint).
  if (roleLevel === 'admin') {
    return capability === 'workspace.read' || capability === 'workspace.admin';
  }
  if (roleLevel === 'user') {
    return capability === 'workspace.read';
  }
  // 'developer' has no implicit Slice 1 capabilities; needs MS scope.
  return false;
}
