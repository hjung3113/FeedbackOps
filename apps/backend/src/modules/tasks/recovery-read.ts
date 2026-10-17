import { type SQL, sql } from 'drizzle-orm';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import { hasElevatedFindingRole } from '../findings/authorization.js';
import type { Scope } from '../permissions/scope-service.js';
import { releasedTaskUnresolvedVocPredicate, releasedTaskVocRecoverySql } from '../voc/index.js';

export function taskRecoveryPredicate(workspaceId: string): SQL {
  return sql`t.status = 'released' AND ${releasedTaskUnresolvedVocPredicate(workspaceId, sql`t.id`)}`;
}
export function taskRecoveryProjection(args: {
  workspaceId: string;
  scope: Scope;
  vocReadScope: Scope;
  vocRepairScope: Scope;
  actorId: string;
  roleLevel: 'admin' | 'developer' | 'user';
  sourceId?: string;
}): SQL {
  const sourceReadable = hasElevatedFindingRole({
    actor_id: args.actorId,
    workspace_id: args.workspaceId,
    role_level: args.roleLevel,
  });
  const readable =
    args.scope.kind === 'all'
      ? sql`true`
      : sql`t.primary_managed_system_id = ANY(${sqlUuidArray(args.scope.managedSystemIds)})`;
  const voc = releasedTaskVocRecoverySql({
    workspaceId: args.workspaceId,
    taskId: sql`t.id`,
    readScope: args.vocReadScope,
    repairScope: args.vocRepairScope,
    actorId: args.actorId,
  });
  return sql`SELECT t.id AS source_id, t.primary_managed_system_id AS system_id, CASE WHEN ${sourceReadable} THEN t.display_id END AS display_id,
    CASE WHEN ${sourceReadable} THEN t.title END AS title,
    (${taskRecoveryPredicate(args.workspaceId)}) AS active, false AS withdrawn,
    CASE WHEN ${sourceReadable} THEN t.assignee_actor_id END AS actor_id,
    CASE WHEN ${sourceReadable} THEN t.assignee_team_id END AS team_id,
    CASE WHEN ${sourceReadable} THEN (${voc.repairSubject}) END AS repair_id,
    NULL::uuid AS repair_system_id
    FROM task.tasks t WHERE t.workspace_id = ${args.workspaceId}::uuid AND ${readable}
      AND ${args.sourceId ? sql`t.id = ${args.sourceId}::uuid` : sql`true`}`;
}
