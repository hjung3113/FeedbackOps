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
//   3. direct grant       → workspace-wide grants only (grant.managed_system_id IS NULL)
//                           allow via direct_grant (or grant_expired/revoked)
//   4. role-derived       → allow via role
//   5. managed-system     → MS-scoped grants whose managed_system_id matches
//                           scope.managed_system_id (ADR-0019 Section D: now
//                           first-class; emits via: 'managed_system_scope').
//                           Slice 3 will add the *fallback* direction
//                           (MS-scoped grant satisfies a workspace-wide
//                           check on an MS-eligible capability) — not done
//                           in Slice 2.
//   6. requestable check  → compute fallback request candidates
//
// Slice 1 role rule (issue #4):
//   - Admin satisfies workspace.read AND workspace.admin via role.
//   - User satisfies workspace.read via role; workspace.admin falls through.

import { and, eq, isNull } from 'drizzle-orm';

import { type Capability, adminModuleBypassFor } from '@fops/shared';
import type { Db } from '../../db/client.js';
import { permissionDenies, permissionGrants } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { allManagedSystemIds } from '../core/managed-systems/read-projections.js';

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

export type CapabilityScope = { kind: 'all' } | { kind: 'scoped'; managed_system_ids: string[] };

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
    options: { tx?: Tx } = {},
  ): Promise<Decision> {
    // When invoked inside a mutation transaction, callers pass `tx` so steps
    // 2/3/5 observe writes the same tx just performed (S-002, ADR-0019
    // Section D). Without it, we fall back to the pool-bound handle for
    // read-only callers like the route-level pre-check at routes.ts.
    const db: Tx = options.tx ?? deps.db;

    // (1) workspace context — actor must be acting inside their own workspace.
    if (actor.workspace_id !== scope.workspace_id) {
      return { allow: false, reason: 'workspace_mismatch', requestable: null };
    }

    // (2) explicit deny — a workspace-wide active deny blocks every check;
    // an MS-scoped deny blocks only that same MS scope. Both precede grants
    // and role checks. 05-policy:33.
    const denyRows = await db
      .select({
        id: permissionDenies.id,
        managedSystemId: permissionDenies.managedSystemId,
      })
      .from(permissionDenies)
      .where(
        and(
          eq(permissionDenies.workspaceId, actor.workspace_id),
          eq(permissionDenies.actorId, actor.actor_id),
          eq(permissionDenies.capability, capability),
          isNull(permissionDenies.revokedAt),
        ),
      );
    for (const row of denyRows) {
      if (row.managedSystemId === null || row.managedSystemId === scope.managed_system_id) {
        return { allow: false, reason: 'explicit_deny', requestable: null };
      }
    }

    // (3) direct capability grant. Active = NOT revoked AND (expires_at NULL
    // OR expires_at > now()). We fetch all rows for (actor, capability) and
    // classify rather than filtering in SQL so we can distinguish
    // grant_expired / grant_revoked from no_grant in a single round-trip.
    const grantRows = await db
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
    // Step 3 — workspace-wide grants only. MS-scoped grants are step 5's
    // territory (ADR-0019 Section D).
    for (const row of grantRows) {
      if (row.managedSystemId !== null) continue;
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

    // (5) managed-system scope (ADR-0019 Section D): when the caller
    // supplied scope.managed_system_id, match MS-scoped grants whose
    // managed_system_id is exactly that id. Emits the dedicated
    // `via: 'managed_system_scope'` attribution so the audit/state-mapper
    // can distinguish workspace-wide grants from MS-scoped grants.
    //
    // Slice 3 will add the *fallback* direction: an MS-scoped grant
    // satisfies a workspace-wide check (scope.managed_system_id absent)
    // when the capability is on the MS-eligible list. That branch is
    // intentionally not added here.
    if (scope.managed_system_id !== undefined) {
      for (const row of grantRows) {
        if (row.managedSystemId !== scope.managed_system_id) continue;
        if (row.revokedAt !== null) {
          sawRevoked = true;
          continue;
        }
        if (row.expiresAt !== null && row.expiresAt.getTime() <= rightNow.getTime()) {
          sawExpired = true;
          continue;
        }
        return { allow: true, via: 'managed_system_scope', grant_id: row.id };
      }
    }

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

  async function capabilityScope(
    actor: ActorContext,
    capability: Capability,
    scope: { workspace_id: string },
    options: { tx?: Tx } = {},
  ): Promise<CapabilityScope> {
    const db: Tx = options.tx ?? deps.db;
    if (actor.workspace_id !== scope.workspace_id)
      return { kind: 'scoped', managed_system_ids: [] };

    const bypass = actor.role_level === 'admin' ? adminModuleBypassFor(capability) : 'none';
    if (bypass === 'always') return { kind: 'all' };

    const denyRows = await db
      .select({ managedSystemId: permissionDenies.managedSystemId })
      .from(permissionDenies)
      .where(
        and(
          eq(permissionDenies.workspaceId, actor.workspace_id),
          eq(permissionDenies.actorId, actor.actor_id),
          eq(permissionDenies.capability, capability),
          isNull(permissionDenies.revokedAt),
        ),
      );
    if (denyRows.some((row) => row.managedSystemId === null)) {
      return { kind: 'scoped', managed_system_ids: [] };
    }
    const deniedIds = new Set(
      denyRows.map((row) => row.managedSystemId).filter((id): id is string => id !== null),
    );

    const grantRows = await db
      .select({
        managedSystemId: permissionGrants.managedSystemId,
        revokedAt: permissionGrants.revokedAt,
        expiresAt: permissionGrants.expiresAt,
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
    const isActive = (row: {
      revokedAt: Date | null;
      expiresAt: Date | null;
    }) =>
      row.revokedAt === null &&
      (row.expiresAt === null || row.expiresAt.getTime() > rightNow.getTime());
    const broadAllow =
      grantRows.some((row) => row.managedSystemId === null && isActive(row)) ||
      roleSatisfies(actor.role_level, capability) ||
      bypass === 'unless_denied';
    if (broadAllow && deniedIds.size === 0) return { kind: 'all' };

    const allowedIds = broadAllow
      ? await allManagedSystemIds(db, actor.workspace_id)
      : grantRows
          .filter(
            (row): row is typeof row & { managedSystemId: string } =>
              row.managedSystemId !== null && isActive(row),
          )
          .map((row) => row.managedSystemId);
    return {
      kind: 'scoped',
      managed_system_ids: allowedIds.filter((id) => !deniedIds.has(id)),
    };
  }

  return { checkCapability, capabilityScope };
}

/**
 * Mirror a domain module's admin-role bypass onto an advisory decision.
 *
 * `checkCapability` answers for the generic layer only: `roleSatisfies` covers
 * the four role-derived Slice 1 capabilities and nothing else. Several domain
 * modules layer their own admin bypass on top of it before enforcing — Finding
 * point authorization, Task Request self-approval, and Survey read/manage. A
 * caller that asks the generic service *about* one of those capabilities
 * therefore gets a stricter answer than the enforcing route would give.
 *
 * That divergence is safe in the deny direction but wrong as a display hint:
 * `GET /me/permissions/check` is what the frontend gates on, so an Admin was
 * told they needed `survey.manage` while `POST /surveys` would have let them
 * through (issue #372). This function re-applies the module's rule from the
 * single declaration in `CAPABILITY_META.adminModuleBypass`.
 *
 * It is deliberately advisory-only: enforcement still happens in the domain
 * modules, so this widens no permission wall. `workspace_mismatch` is never
 * bypassed — a cross-workspace actor is not this workspace's Admin.
 */
export function applyAdminModuleBypass(
  roleLevel: string,
  capability: Capability,
  decision: Decision,
): Decision {
  if (decision.allow || roleLevel !== 'admin') return decision;
  if (decision.reason === 'workspace_mismatch') return decision;
  switch (adminModuleBypassFor(capability)) {
    case 'always':
      return { allow: true, via: 'role' };
    case 'unless_denied':
      return decision.reason === 'explicit_deny' ? decision : { allow: true, via: 'role' };
    case 'none':
      return decision;
  }
}

function roleSatisfies(roleLevel: string, capability: Capability): boolean {
  // role_level is stored lower-case (core.actors CHECK constraint).
  if (roleLevel === 'admin') {
    // admin role implicitly satisfies voc.triage and voc.read (workspace-wide);
    // developer/user need MS-scoped grants for those capabilities.
    return (
      capability === 'workspace.read' ||
      capability === 'workspace.admin' ||
      capability === 'voc.triage' ||
      capability === 'voc.read'
    );
  }
  if (roleLevel === 'user') {
    return capability === 'workspace.read';
  }
  // 'developer' has no implicit Slice 1 capabilities; needs MS scope.
  return false;
}
