import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Scope } from '../permissions/scope-service.js';

function sqlUuidArray(ids: readonly string[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;
}

function scopePredicate(column: string, scope: Scope, managedSystemId?: string): ReturnType<typeof sql> {
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

export async function countActiveFindingsWithoutExecution(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  return count(db, sql`
    SELECT count(*)::int AS count FROM finding.findings f
    WHERE f.workspace_id = ${workspaceId} AND f.status = 'active'
      AND ${scopePredicate('f.primary_managed_system_id', scope, managedSystemId)}
      AND f.linked_task_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM core.entity_links el WHERE el.workspace_id = f.workspace_id
        AND el.status = 'active' AND el.source_type = 'finding' AND el.source_id = f.id
        AND el.target_type = 'task_request' AND el.relation_type = 'requested_task')
  `);
}

export async function countActiveFindings(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  return count(db, sql`SELECT count(*)::int AS count FROM finding.findings f
    WHERE f.workspace_id = ${workspaceId} AND f.status = 'active'
      AND ${scopePredicate('f.primary_managed_system_id', scope, managedSystemId)}`);
}

export async function countActiveFindingsWithExecution(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  return count(db, sql`SELECT count(*)::int AS count FROM finding.findings f
    WHERE f.workspace_id = ${workspaceId} AND f.status = 'active'
      AND ${scopePredicate('f.primary_managed_system_id', scope, managedSystemId)}
      AND (f.linked_task_id IS NOT NULL OR EXISTS (SELECT 1 FROM core.entity_links el
        WHERE el.workspace_id = f.workspace_id AND el.status = 'active' AND el.source_type = 'finding'
          AND el.source_id = f.id AND el.target_type = 'task_request' AND el.relation_type = 'requested_task'))`);
}

export async function countTasksInFlight(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  return count(db, sql`SELECT count(*)::int AS count FROM task.tasks t WHERE t.workspace_id = ${workspaceId}
    AND t.status IN ('todo', 'doing', 'review') AND ${scopePredicate('t.primary_managed_system_id', scope, managedSystemId)}`);
}

export async function countPendingTaskRequests(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  return count(db, sql`SELECT count(*)::int AS count FROM task_request.task_requests tr WHERE tr.workspace_id = ${workspaceId}
    AND tr.status = 'pending_review' AND ${scopePredicate('tr.primary_managed_system_id', scope, managedSystemId)}`);
}

export async function releasedTaskIds(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`SELECT id FROM task.tasks t WHERE t.workspace_id = ${workspaceId}
    AND t.status = 'released' AND ${scopePredicate('t.primary_managed_system_id', scope, managedSystemId)}`);
  return result.rows.map((row) => row.id);
}

export async function unresolvedVocIds(db: Db, workspaceId: string, vocIds: readonly string[]): Promise<Set<string>> {
  if (vocIds.length === 0) return new Set();
  const result = await db.execute<{ id: string }>(sql`SELECT id FROM voc.vocs WHERE workspace_id = ${workspaceId}
    AND id = ANY(${sqlUuidArray(vocIds)}) AND reporter_facing_status NOT IN ('resolved', 'closed')`);
  return new Set(result.rows.map((row) => row.id));
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
      count(*) FILTER (WHERE EXISTS (
        SELECT 1
        FROM core.entity_links link
        JOIN voc.vocs voc
          ON voc.id = link.source_id
         AND voc.workspace_id = link.workspace_id
         AND voc.archived_at IS NULL
        JOIN voc.voc_public_updates public_update
          ON public_update.voc_id = voc.id
         AND public_update.skip_public_update = false
        WHERE link.workspace_id = t.workspace_id
          AND link.source_type = 'voc'
          AND link.target_type = 'task'
          AND link.target_id = t.id
          AND link.relation_type = 'evidence_of'
          AND link.status = 'active'
      ))::int AS value,
      count(*)::int AS total
    FROM task.tasks t
    WHERE t.workspace_id = ${workspaceId}
      AND t.status = 'released'
      AND ${scopePredicate('t.primary_managed_system_id', scope, managedSystemId)}
      AND EXISTS (
        SELECT 1
        FROM core.entity_links link
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

export async function countSurveyGaps(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  const selectedManagedSystemId = managedSystemId === 'all' ? undefined : managedSystemId;
  const managedSystemIds = selectedManagedSystemId === undefined
    ? (scope.kind === 'all' ? undefined : scope.managedSystemIds)
    : [selectedManagedSystemId];
  const filter = managedSystemIds === undefined ? sql`NULL::uuid[]` : sqlUuidArray(managedSystemIds);
  return count(db, sql`SELECT survey.count_negative_outcome_without_followup(
    ${workspaceId}::uuid, ${filter}
  )::int AS count`);
}

export async function countAnalyticsAreaVocCoverage(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  const result = await db.execute<{ value: number | string; total: number | string }>(sql`
    SELECT count(*) FILTER (WHERE v.analytics_area_id IS NOT NULL)::int AS value, count(*)::int AS total
    FROM voc.vocs v WHERE v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
      AND ${scopePredicate('v.primary_managed_system_id', scope, managedSystemId)}`);
  return { value: Number(result.rows[0]?.value ?? 0), total: Number(result.rows[0]?.total ?? 0) };
}

export async function countVocsWithTask(db: Db, workspaceId: string, scope: Scope, managedSystemId?: string) {
  const result = await db.execute<{ value: number | string; total: number | string }>(sql`
    SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM core.entity_links el WHERE el.workspace_id = v.workspace_id
      AND el.status = 'active' AND el.source_type = 'voc' AND el.source_id = v.id AND el.target_type = 'task'))::int AS value,
      count(*)::int AS total FROM voc.vocs v WHERE v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
      AND ${scopePredicate('v.primary_managed_system_id', scope, managedSystemId)}`);
  return { value: Number(result.rows[0]?.value ?? 0), total: Number(result.rows[0]?.total ?? 0) };
}
