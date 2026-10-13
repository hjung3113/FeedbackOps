import { type SQL, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { vocs } from '../../db/schema/voc.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import { managedSystemIsLiveSql } from '../managed-systems/read-projections.js';
import type { CheckService } from '../permissions/check-service.js';
import type { Scope, ScopeActorContext } from '../permissions/scope-service.js';
import { similarVocVisibilityPredicate } from './authorization.js';
import { buildVocListPredicate } from './read/repository-list.js';

/** Owner-backed projection: inbox membership is exactly the grouped count predicate. */
export function vocRecoveryProjection(
  workspaceId: string,
  scope: Scope,
  category: 'unassigned-voc' | 'high-severity-unlinked',
  repairScope: Scope,
  sourceId?: string,
): SQL {
  const predicates = buildVocListPredicate({
    workspaceId,
    scopeFilter: scope,
    view: 'inbox',
    tab: category === 'unassigned-voc' ? 'unassigned' : 'high-no-link',
  });
  const active = predicates ? sql.join(predicates, sql` AND `) : sql`false`;
  const readable =
    scope.kind === 'all'
      ? sql`true`
      : sql`${vocs.primaryManagedSystemId} = ANY(${sqlUuidArray(scope.managedSystemIds)})`;
  const repairable = sql`${vocs.archivedAt} IS NULL
    AND ${managedSystemIsLiveSql(vocs.primaryManagedSystemId)} AND ${
      repairScope.kind === 'all'
        ? sql`true`
        : sql`${vocs.primaryManagedSystemId} = ANY(${sqlUuidArray(repairScope.managedSystemIds)})`
    }`;
  return sql`SELECT id AS source_id, primary_managed_system_id AS system_id, display_id, title,
    (${active}) AS active, archived_at IS NOT NULL AS withdrawn,
    owner_user_id AS actor_id, owner_team_id AS team_id,
    CASE WHEN ${repairable} THEN id END AS repair_id,
    primary_managed_system_id AS repair_system_id
    FROM ${vocs} WHERE workspace_id = ${workspaceId}::uuid AND ${readable}
      AND ${sourceId ? sql`id = ${sourceId}::uuid` : sql`true`}`;
}

/** Same scoped command decision as update-triage/public-update, once per distinct system. */
export async function vocRecoveryRepairScope(
  db: Db,
  checkService: CheckService,
  actor: ScopeActorContext,
) {
  const rows = await db.execute<{ id: string }>(sql`SELECT DISTINCT primary_managed_system_id AS id
    FROM ${vocs} WHERE workspace_id = ${actor.workspace_id}::uuid`);
  const decisions = await Promise.all(
    rows.rows.map((row) =>
      checkService.checkCapability(actor, 'voc.triage', {
        workspace_id: actor.workspace_id,
        managed_system_id: row.id,
      }),
    ),
  );
  return {
    kind: 'scoped' as const,
    managedSystemIds: rows.rows.filter((_, i) => decisions[i]?.allow).map((row) => row.id),
  };
}

export function releasedTaskUnresolvedVocPredicate(workspaceId: string, taskId: SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM core.entity_links_app link JOIN voc.vocs v
    ON v.id = link.source_id AND v.workspace_id = link.workspace_id
    WHERE link.workspace_id = ${workspaceId}::uuid AND link.source_type = 'voc'
    AND link.target_type = 'task' AND link.target_id = ${taskId}
    AND link.relation_type = 'evidence_of' AND link.status = 'active'
    AND v.archived_at IS NULL AND v.reporter_facing_status NOT IN ('resolved', 'closed'))`;
}

/** Task-grain membership may use hidden VOCs; repair targets may only use visible VOCs. */
export function releasedTaskVocRecoverySql(args: {
  workspaceId: string;
  taskId: SQL;
  readScope: Scope;
  repairScope: Scope;
  actorId: string;
}) {
  const membership = releasedTaskUnresolvedVocPredicate(args.workspaceId, args.taskId);
  const visible = similarVocVisibilityPredicate(args.readScope, args.actorId, sql`v`);
  const canRepair =
    args.repairScope.kind === 'all'
      ? sql`true`
      : sql`v.primary_managed_system_id = ANY(${sqlUuidArray(args.repairScope.managedSystemIds)})`;
  const repairSubject = sql`SELECT v.id FROM core.entity_links_app link JOIN voc.vocs v
    ON v.id = link.source_id AND v.workspace_id = link.workspace_id
    WHERE link.workspace_id = ${args.workspaceId}::uuid AND link.source_type = 'voc'
    AND link.target_type = 'task' AND link.target_id = ${args.taskId}
    AND link.relation_type = 'evidence_of' AND link.status = 'active'
    AND v.archived_at IS NULL AND v.reporter_facing_status NOT IN ('resolved', 'closed')
    AND ${visible} AND ${canRepair} AND ${managedSystemIsLiveSql(sql`v.primary_managed_system_id`)}
    ORDER BY v.id LIMIT 1`;
  return { membership, repairSubject };
}

/** Bounded safe hydration, one query for a whole page. Hidden linked owners never enter hints. */
export async function readTaskRecoveryVocs(
  db: Db,
  args: {
    workspaceId: string;
    taskIds: string[];
    readScope: Scope;
    actorId: string;
  },
) {
  if (args.taskIds.length === 0) return [];
  const result = await db.execute<{
    task_id: string;
    id: string;
    display_id: string;
    title: string;
    actor_id: string | null;
    team_id: string | null;
    owner_keys: string[];
  }>(sql`WITH visible AS (
    SELECT DISTINCT link.target_id AS task_id, v.id, v.display_id, v.title,
      v.owner_user_id AS actor_id, v.owner_team_id AS team_id
    FROM core.entity_links_app link JOIN voc.vocs v
      ON v.id = link.source_id AND v.workspace_id = link.workspace_id
    WHERE link.workspace_id = ${args.workspaceId}::uuid AND link.source_type = 'voc'
      AND link.target_type = 'task' AND link.target_id = ANY(${sqlUuidArray(args.taskIds)})
      AND link.relation_type = 'evidence_of' AND link.status = 'active'
      AND v.archived_at IS NULL AND v.reporter_facing_status NOT IN ('resolved', 'closed')
      AND ${similarVocVisibilityPredicate(args.readScope, args.actorId, sql`v`)}
  ), owners AS (
    SELECT task_id, array_agg(DISTINCT COALESCE('a:' || actor_id::text, 't:' || team_id::text))
      FILTER (WHERE actor_id IS NOT NULL OR team_id IS NOT NULL) AS owner_keys
    FROM visible GROUP BY task_id
  ), ranked AS (
    SELECT *, row_number() OVER (PARTITION BY task_id ORDER BY id) AS n FROM visible
  ) SELECT ranked.*, COALESCE(owners.owner_keys, ARRAY[]::text[]) AS owner_keys
    FROM ranked JOIN owners USING (task_id) WHERE n <= 100 ORDER BY task_id, id`);
  return result.rows;
}
