import { type SQL, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import type { Tx } from '../../db/tx.js';
import { managedSystemIsLiveSql } from '../managed-systems/read-projections.js';
import type { CheckService } from '../permissions/check-service.js';
import type { Scope, ScopeActorContext } from '../permissions/scope-service.js';
import { checkFindingManage } from './authorization.js';

export function findingRecoveryPredicate(): SQL {
  return sql`f.status = 'active' AND f.linked_task_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM core.entity_links_app el WHERE el.workspace_id = f.workspace_id
      AND el.status = 'active' AND el.source_type = 'finding' AND el.source_id = f.id
      AND el.target_type = 'task_request' AND el.relation_type = 'requested_task')`;
}
export async function findingRecoveryRepairScope(
  db: Db,
  check: CheckService,
  actor: ScopeActorContext,
) {
  const systems = await db.execute<{
    id: string;
  }>(sql`SELECT DISTINCT primary_managed_system_id AS id
    FROM finding.findings WHERE workspace_id = ${actor.workspace_id}::uuid`);
  const decisions = await Promise.all(
    systems.rows.map((row) =>
      checkFindingManage(check, actor, row.id, { requireElevatedRole: true }),
    ),
  );
  return {
    kind: 'scoped' as const,
    managedSystemIds: systems.rows.filter((_, i) => decisions[i]?.allow).map((row) => row.id),
  };
}
export function findingRecoveryProjection(
  workspaceId: string,
  scope: Scope,
  repairScope: Scope,
  sourceId?: string,
): SQL {
  const readable =
    scope.kind === 'all'
      ? sql`true`
      : sql`f.primary_managed_system_id = ANY(${sqlUuidArray(scope.managedSystemIds)})`;
  const repairable = sql`${findingRecoveryPredicate()} AND ${managedSystemIsLiveSql(sql`f.primary_managed_system_id`)}
    AND ${repairScope.kind === 'all' ? sql`true` : sql`f.primary_managed_system_id = ANY(${sqlUuidArray(repairScope.managedSystemIds)})`}`;
  return sql`SELECT f.id AS source_id, f.primary_managed_system_id AS system_id, f.display_id, f.title,
    (${findingRecoveryPredicate()}) AS active, f.status = 'archived' AS withdrawn,
    f.owner_actor_id AS actor_id, f.owner_team_id AS team_id,
    CASE WHEN ${repairable} THEN f.id END AS repair_id, f.primary_managed_system_id AS repair_system_id
    FROM finding.findings f WHERE f.workspace_id = ${workspaceId}::uuid AND ${readable}
      AND ${sourceId ? sql`f.id = ${sourceId}::uuid` : sql`true`}`;
}

/** Finding rows precede bound responses and both recovery identity families. */
export async function lockFindingRecoverySubjects(
  tx: Tx,
  workspaceId: string,
  findingIds: string[],
) {
  if (findingIds.length === 0) return;
  await tx.execute(sql`SELECT id FROM finding.findings
    WHERE workspace_id=${workspaceId}::uuid AND id=ANY(${sqlUuidArray(findingIds)})
    ORDER BY id FOR UPDATE`);
}
