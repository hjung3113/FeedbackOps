// apps/backend/src/modules/permissions/scope-service.ts
//
// Scope resolution helpers — returns the set of managed system ids (or 'all')
// that an actor holds a given capability for. Consumed by voc/repo-read.ts
// which needs scope-level resolution (not a binary allow/deny) for list
// filtering. The permission module owns permission_grants reads; this helper
// sits here so voc/repo-read.ts does NOT reach into permission_grants directly
// (AGENTS.md: repositories access tables owned by their module only).
//
// Relationship to check-service.ts:
//   checkCapability → binary allow/deny for a single MS scope
//   actorScopeForCapability → multi-MS scope resolution for read-model filtering

import { and, eq, isNull, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { permissionGrants } from '../../db/schema/permission.js';

export type Scope = { kind: 'all' } | { kind: 'scoped'; managedSystemIds: string[] };

export interface ScopeActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

/**
 * Resolves the set of managed systems for which an actor holds
 * a non-revoked, non-expired grant for `capability`.
 *
 * When `capability` is undefined, ANY capability grant is matched
 * (used for actorEffectiveScope).
 *
 * Admin role short-circuits to 'all' regardless of grants.
 * Workspace-wide grant (managed_system_id IS NULL) → 'all'.
 * MS-scoped grants → scoped list of MS ids.
 * No grants → scoped:[].
 *
 * NOTE: Does not check permission_denies. Scope resolution is used for
 * read-model filtering (which MSs can the actor see), not for authorizing
 * mutations. Deny checks remain in check-service.checkCapability.
 */
export async function actorScopeForCapability(
  db: Db | Tx,
  actor: ScopeActorContext,
  capability?: string,
): Promise<Scope> {
  // Admin role → full workspace scope, no DB query needed.
  if (actor.role_level === 'admin') {
    return { kind: 'all' };
  }

  // Build filter clauses.
  const conditions = [
    eq(permissionGrants.workspaceId, actor.workspace_id),
    eq(permissionGrants.actorId, actor.actor_id),
    isNull(permissionGrants.revokedAt),
    // expires_at IS NULL OR expires_at > now()
    or(
      isNull(permissionGrants.expiresAt),
      sql`${permissionGrants.expiresAt} > now()`,
    ),
  ];

  if (capability !== undefined) {
    conditions.push(eq(permissionGrants.capability, capability));
  }

  const rows = await (db as Db)
    .select({ managedSystemId: permissionGrants.managedSystemId })
    .from(permissionGrants)
    .where(and(...conditions));

  // Workspace-wide grant (managed_system_id IS NULL) → 'all'.
  if (rows.some((r) => r.managedSystemId === null)) {
    return { kind: 'all' };
  }

  // Collect distinct MS ids.
  const ids = [...new Set(rows.map((r) => r.managedSystemId).filter((id): id is string => id !== null))];
  return { kind: 'scoped', managedSystemIds: ids };
}
