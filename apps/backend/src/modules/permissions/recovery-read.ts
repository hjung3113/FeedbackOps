import { CAPABILITIES } from '@fops/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { sqlTextArray } from '../../db/sql-arrays.js';
import type { ActorContext, CheckService } from './check-service.js';

export const RECOVERY_PERMISSION_ACTIVE_STATUSES = ['pending', 'needs_more_info'] as const;
export function permissionRecoveryPredicate(): SQL {
  return sql`p.status = ANY(${sqlTextArray([...RECOVERY_PERMISSION_ACTIVE_STATUSES])})`;
}
export async function permissionRecoveryProjection(
  check: CheckService,
  actor: ActorContext,
  sourceId?: string,
): Promise<{ query: SQL; allowed: boolean }> {
  const allowed = (
    await check.checkCapability(actor, 'workspace.admin', { workspace_id: actor.workspace_id })
  ).allow;
  return {
    allowed,
    query: sql`SELECT p.id AS source_id, NULL::uuid AS system_id, NULL::text AS display_id,
    'Permission Request'::text AS title, (${permissionRecoveryPredicate()}) AS active,
    p.status = 'cancelled' AS withdrawn, NULL::uuid AS actor_id, NULL::uuid AS team_id,
    CASE WHEN p.requested_capability = ANY(${sqlTextArray([...CAPABILITIES])}) THEN p.id END AS repair_id,
    NULL::uuid AS repair_system_id
    FROM permission.permission_requests p WHERE p.workspace_id = ${actor.workspace_id}::uuid
      AND ${allowed} AND ${sourceId ? sql`p.id = ${sourceId}::uuid` : sql`true`}`,
  };
}
export async function countRecoveryPermissionRequests(
  db: Db,
  check: CheckService,
  actor: ActorContext,
) {
  const allowed = (
    await check.checkCapability(actor, 'workspace.admin', { workspace_id: actor.workspace_id })
  ).allow;
  if (!allowed) return undefined;
  const result = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count
    FROM permission.permission_requests p WHERE p.workspace_id = ${actor.workspace_id}::uuid
    AND ${permissionRecoveryPredicate()}`);
  return Number(result.rows[0]?.count ?? 0);
}

/** Actor-independent transition truth; no request detail or access decision is returned. */
export function permissionRecoveryTruth(workspaceId: string, sourceId?: string): SQL {
  return sql`SELECT p.id AS source_id,NULL::uuid AS system_id,
    (${permissionRecoveryPredicate()}) AS active,p.status='cancelled' AS withdrawn
    FROM permission.permission_requests p WHERE p.workspace_id=${workspaceId}::uuid AND ${sourceId ? sql`p.id=${sourceId}::uuid` : sql`true`}`;
}
