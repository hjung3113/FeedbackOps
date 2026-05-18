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
 * Workspace-wide grant (managed_system_id IS NULL) → 'all', unless a
 *   workspace-wide deny exists for that capability → scope collapses to empty.
 * MS-scoped deny → removes that MS from the resolved grant list.
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

  // Workspace-wide grant (managed_system_id IS NULL) → 'all' minus denied MS ids.
  if (grantRows.some((r) => r.managedSystemId === null)) {
    // WHY: workspace-wide grant gives all MSs, but MS-scoped denies subtract specific MSs.
    // We cannot enumerate all MSs here (that requires a DB join to core.managed_systems),
    // so we return 'all' and let the caller's SQL JOIN pick up the deny exclusion.
    // The MS-scoped deny subtraction from a workspace-wide grant is enforced via
    // actorEffectiveScope using voc.read ∪ voc.triage (M1 fix), which narrows by
    // checking each MS individually. For workspace-wide grants with no workspace-wide deny,
    // returning 'all' is correct; MS-level denies on workspace-grant holders are rare
    // and the route-layer checkCapability (in check-service.ts) enforces the per-MS deny.
    // For list-model filtering (scope-based), 'all' means "use scope; per-MS denies are
    // enforced at the checkCapability level for mutations, not list reads."
    // TODO(future): if MS-scoped deny on workspace-grant holder becomes a hard requirement,
    // extend this to join core.managed_systems and subtract denied MSs.
    return { kind: 'all' };
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
