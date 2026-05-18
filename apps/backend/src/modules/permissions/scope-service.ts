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
import { allManagedSystemIds } from '../core/managed-systems/read-projections.js';
import { permissionDenies, permissionGrants } from '../../db/schema/permission.js';

export type Scope = { kind: 'all' } | { kind: 'scoped'; managedSystemIds: string[] };

export interface ScopeActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

/**
 * Resolves the set of managed systems for which an actor holds
 * a non-revoked, non-expired grant for `capability`, minus any active denies.
 *
 * When `capability` is undefined, ANY capability grant is matched
 * (used for actorEffectiveScope).
 *
 * Admin role short-circuits to 'all' regardless of grants.
 * Workspace-wide grant (managed_system_id IS NULL) resolves as follows:
 *   - Workspace-wide deny exists → scope collapses to empty (scoped:[]).
 *   - MS-scoped deny(ies) exist → resolve allManagedSystemIds(workspace) minus
 *     denied set → {kind:'scoped', managedSystemIds: <all minus denied>}.
 *   - No denies → {kind:'all'}.
 *   NOTE: Admin role bypasses this function entirely (short-circuit above).
 * MS-scoped grants → scoped list of MS ids (after deny subtraction).
 * No grants → scoped:[].
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

  // Build grant filter clauses.
  const grantConditions = [
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
    grantConditions.push(eq(permissionGrants.capability, capability));
  }

  // Fetch grants and active denies in parallel.
  const denyConditions = [
    eq(permissionDenies.workspaceId, actor.workspace_id),
    eq(permissionDenies.actorId, actor.actor_id),
    isNull(permissionDenies.revokedAt),
  ];

  if (capability !== undefined) {
    denyConditions.push(eq(permissionDenies.capability, capability));
  }

  const [grantRows, denyRows] = await Promise.all([
    (db as Db)
      .select({ managedSystemId: permissionGrants.managedSystemId })
      .from(permissionGrants)
      .where(and(...grantConditions)),
    (db as Db)
      .select({ managedSystemId: permissionDenies.managedSystemId })
      .from(permissionDenies)
      .where(and(...denyConditions)),
  ]);

  // Workspace-wide deny (managed_system_id IS NULL) → scope collapses to empty
  // for this capability regardless of grants.
  if (denyRows.some((r) => r.managedSystemId === null)) {
    return { kind: 'scoped', managedSystemIds: [] };
  }

  // Build set of denied MS ids.
  const deniedMsIds = new Set(
    denyRows.map((r) => r.managedSystemId).filter((id): id is string => id !== null),
  );

  // Workspace-wide grant (managed_system_id IS NULL) → resolve with deny subtraction.
  if (grantRows.some((r) => r.managedSystemId === null)) {
    // WHY (N-MAJ-1 cycle-2 fix): a workspace-wide grant gives access to all MSs,
    // but MS-scoped denies must carve out specific MSs from that set.
    // If no MS-scoped denies exist, return 'all' (fast path).
    // If MS-scoped denies exist, enumerate all workspace MSs and subtract the denied
    // set — this is the only correct model; returning 'all' silently drops the denies.
    // Admin actors never reach this branch (short-circuited to 'all' above).
    if (deniedMsIds.size === 0) {
      return { kind: 'all' };
    }
    // Fetch all non-archived MS ids in the workspace and subtract denied ones.
    const allMsIds = await allManagedSystemIds(db, actor.workspace_id);
    const allowed = allMsIds.filter((id) => !deniedMsIds.has(id));
    return { kind: 'scoped', managedSystemIds: allowed };
  }

  // Collect distinct MS ids from grants, subtracting denied ones.
  const ids = [
    ...new Set(
      grantRows
        .map((r) => r.managedSystemId)
        .filter((id): id is string => id !== null && !deniedMsIds.has(id)),
    ),
  ];
  return { kind: 'scoped', managedSystemIds: ids };
}
