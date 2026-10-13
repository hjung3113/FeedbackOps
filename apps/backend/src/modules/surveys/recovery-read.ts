import { type SQL, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import { checkFindingManage } from '../findings/authorization.js';
import type { CheckService } from '../permissions/check-service.js';
import type { Scope, ScopeActorContext } from '../permissions/scope-service.js';
import { checkSurveyPersonalResponseRead, checkSurveyRead } from './authorization.js';

/** Safe Survey-grain batch adapter; never calls the personal reader or exposes responses. */
export async function surveyRecoveryProjection(
  db: Db,
  check: CheckService,
  actor: ScopeActorContext,
  scope: Scope,
  sourceId?: string,
): Promise<{ query: SQL; repairSystems: string[] }> {
  // Fail closed before calling any privileged classifier, including for point reads.
  const systems =
    scope.kind === 'all'
      ? (
          await db.execute<{ id: string }>(sql`SELECT DISTINCT primary_managed_system_id AS id
      FROM survey.surveys WHERE workspace_id = ${actor.workspace_id}::uuid`)
        ).rows.map((row) => row.id)
      : scope.managedSystemIds;
  const checks = await Promise.all(
    systems.map(async (id) => {
      const read = await checkSurveyRead(check, actor, id);
      if (!read.allow) return { id, read: false, repair: false };
      const [personal, manage] = await Promise.all([
        checkSurveyPersonalResponseRead(check, actor, id),
        checkFindingManage(check, actor, id, { requireElevatedRole: false }),
      ]);
      return { id, read: true, repair: personal.allow && manage.allow };
    }),
  );
  const readIds = checks.filter((row) => row.read).map((row) => row.id);
  const repairIds = checks.filter((row) => row.repair).map((row) => row.id);
  // Materialize the authorized source set before the lateral safe-definer calls.
  return {
    repairSystems: repairIds,
    query: sql`WITH authorized AS MATERIALIZED (
    SELECT id, primary_managed_system_id, display_id, title, operator_actor_id
    FROM survey.surveys WHERE workspace_id = ${actor.workspace_id}::uuid AND type = 'outcome'
      AND primary_managed_system_id = ANY(${sqlUuidArray(readIds)})
      AND ${sourceId ? sql`id = ${sourceId}::uuid` : sql`status = 'closed'`}
  ) SELECT s.id AS source_id, s.primary_managed_system_id AS system_id, s.display_id, s.title,
    state.follow_up_needed AS active, false AS withdrawn,
    s.operator_actor_id AS actor_id, NULL::uuid AS team_id,
    CASE WHEN state.follow_up_needed AND s.primary_managed_system_id = ANY(${sqlUuidArray(repairIds)}) THEN s.id END AS repair_id,
    s.primary_managed_system_id AS repair_system_id
    FROM authorized s CROSS JOIN LATERAL survey.read_outcome_follow_up_survey_state(
      ${actor.workspace_id}::uuid, s.id) state`,
  };
}
