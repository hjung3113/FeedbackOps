import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import { findingExecutionPredicate, findingRecoveryPredicate } from '../findings/index.js';
import { type Scope, scopeIncludes, scopeIsNonEmpty } from '../permissions/scope-service.js';
import { pendingTaskRequestPredicate } from '../task-requests/index.js';
import {
  taskInFlightPredicate,
  taskRecoveryPredicate,
  taskReleasedWithPublicUpdatePredicate,
} from '../tasks/index.js';

function scopePredicate(
  column: string,
  scope: Scope,
  managedSystemId?: string,
): ReturnType<typeof sql> {
  const columnRef = sql.raw(column);
  if (managedSystemId !== undefined) return sql`${columnRef} = ${managedSystemId}::uuid`;
  if (scope.kind === 'all') return sql`TRUE`;
  if (scope.managedSystemIds.length === 0) return sql`FALSE`;
  return sql`${columnRef} = ANY(${sqlUuidArray(scope.managedSystemIds)})`;
}

async function count(db: Db, query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute<{ count: number | string }>(query);
  return Number(result.rows[0]?.count ?? 0);
}

export async function countActiveFindingsWithoutExecution(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  return count(
    db,
    sql`
    SELECT count(*)::int AS count FROM finding.findings f
    WHERE f.workspace_id = ${workspaceId}
      AND ${scopePredicate('f.primary_managed_system_id', scope, managedSystemId)}
      AND ${findingRecoveryPredicate()}
  `,
  );
}

export async function countActiveFindings(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  return count(
    db,
    sql`SELECT count(*)::int AS count FROM finding.findings f
    WHERE f.workspace_id = ${workspaceId} AND f.status = 'active'
      AND ${scopePredicate('f.primary_managed_system_id', scope, managedSystemId)}`,
  );
}

export async function countActiveFindingsWithExecution(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  return count(
    db,
    sql`SELECT count(*)::int AS count FROM finding.findings f
    WHERE f.workspace_id = ${workspaceId} AND f.status = 'active'
      AND ${scopePredicate('f.primary_managed_system_id', scope, managedSystemId)}
      AND ${findingExecutionPredicate()}`,
  );
}

export async function countTasksInFlight(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  return count(
    db,
    sql`SELECT count(*)::int AS count FROM task.tasks t WHERE t.workspace_id = ${workspaceId}
    AND ${taskInFlightPredicate(sql`t.status`)} AND ${scopePredicate('t.primary_managed_system_id', scope, managedSystemId)}`,
  );
}

export async function countPendingTaskRequests(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  return count(
    db,
    sql`SELECT count(*)::int AS count FROM task_request.task_requests tr WHERE tr.workspace_id = ${workspaceId}
    AND ${pendingTaskRequestPredicate(sql`tr.status`)} AND ${scopePredicate('tr.primary_managed_system_id', scope, managedSystemId)}`,
  );
}

export async function countReleasedTasksWithUnresolvedVoc(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  return count(
    db,
    sql`
    SELECT count(*)::int AS count
    FROM task.tasks t
    WHERE t.workspace_id = ${workspaceId}

      AND ${scopePredicate('t.primary_managed_system_id', scope, managedSystemId)}
      AND ${taskRecoveryPredicate(workspaceId)}
  `,
  );
}

/**
 * Coverage for the dashboard's "Released Task with public update" label.
 * A skipped row records a deliberate status transition without publishing a
 * reporter-visible update, so it cannot satisfy this coverage metric.
 */
export async function countReleasedTasksWithPublicUpdate(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  const result = await db.execute<{ value: number | string; total: number | string }>(sql`
    SELECT
      count(*) FILTER (WHERE ${taskReleasedWithPublicUpdatePredicate(sql`t`)})::int AS value,
      count(*)::int AS total
    FROM task.tasks t
    WHERE t.workspace_id = ${workspaceId}
      AND t.status = 'released'
      AND ${scopePredicate('t.primary_managed_system_id', scope, managedSystemId)}
      AND EXISTS (
        SELECT 1
        FROM core.entity_links_app link
        JOIN voc.vocs voc
          ON voc.id = link.source_id
         AND voc.workspace_id = link.workspace_id
         AND voc.archived_at IS NULL
        WHERE link.workspace_id = t.workspace_id
          AND link.source_type = 'voc'
          AND link.target_type = 'task'
          AND link.target_id = t.id
          AND link.relation_type = 'evidence_of'
          AND link.status = 'active'
      )
  `);
  return { value: Number(result.rows[0]?.value ?? 0), total: Number(result.rows[0]?.total ?? 0) };
}

export async function countSurveyGaps(
  db: Db,
  workspaceId: string,
  scope: Scope,
  managedSystemId?: string,
) {
  const selectedManagedSystemId = managedSystemId === 'all' ? undefined : managedSystemId;
  if (
    !scopeIsNonEmpty(scope) ||
    (selectedManagedSystemId !== undefined && !scopeIncludes(scope, selectedManagedSystemId))
  )
    return 0;
  const managedSystemIds =
    selectedManagedSystemId === undefined
      ? scope.kind === 'all'
        ? undefined
        : scope.managedSystemIds
      : [selectedManagedSystemId];
  const filter =
    managedSystemIds === undefined ? sql`NULL::uuid[]` : sqlUuidArray(managedSystemIds);
  return count(
    db,
    sql`SELECT survey.count_negative_outcome_without_followup(
    ${workspaceId}::uuid, ${filter}
  )::int AS count`,
  );
}
