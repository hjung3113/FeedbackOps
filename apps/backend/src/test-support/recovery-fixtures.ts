import type { DbHandle } from '../db/client.js';

/** Migrate-role teardown, scoped to the suite's existing Managed System cohort. */
export async function cleanupSystemRecoveryFixtures(
  handle: DbHandle,
  workspaceId: string,
  slugPattern: string,
) {
  for (const table of ['recovery_history', 'recovery_presentations', 'recovery_identities']) {
    await handle.pool.query(
      `DELETE FROM dashboard.${table} p WHERE p.workspace_id=$1::uuid
      AND p.recovery_item_id IN (SELECT i.recovery_item_id FROM dashboard.recovery_identities i
        JOIN core.managed_systems ms ON ms.id=i.managed_system_id
        WHERE i.workspace_id=$1::uuid AND ms.slug LIKE $2::text)`,
      [workspaceId, slugPattern],
    );
  }
  for (const table of [
    'outcome_recovery_history',
    'outcome_recovery_presentations',
    'outcome_recovery_identities',
  ]) {
    await handle.pool.query(
      `DELETE FROM survey.${table} p WHERE p.workspace_id=$1::uuid
      AND p.outcome_recovery_item_id IN (SELECT i.outcome_recovery_item_id FROM survey.outcome_recovery_identities i
        JOIN survey.survey_responses r ON r.id=i.source_id AND r.workspace_id=i.workspace_id
        JOIN survey.surveys s ON s.id=r.survey_id JOIN core.managed_systems ms ON ms.id=s.primary_managed_system_id
        WHERE i.workspace_id=$1::uuid AND ms.slug LIKE $2::text)`,
      [workspaceId, slugPattern],
    );
  }
}
