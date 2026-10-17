import { type DbHandle, createDb } from '../db/client.js';

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
        JOIN core.managed_systems ms ON ms.id=i.managed_system_id
        WHERE i.workspace_id=$1::uuid AND ms.slug LIKE $2::text)`,
      [workspaceId, slugPattern],
    );
  }
}

/** Clear durable projections before deleting exactly the fixture parents selected by a suite. */
export async function deleteRecoveryFixtureParents(
  handle: DbHandle,
  statement: string,
  parameters: unknown[] = [],
) {
  const parent = /^\s*delete from core\.(managed_systems|workspaces)\b/i
    .exec(statement)?.[1]
    ?.toLowerCase();
  if (!parent)
    throw new Error('recovery fixture cleanup requires a Managed System or workspace delete');
  const selected = await handle.pool.query<{ id: string }>(
    statement.replace(/^\s*delete from/i, 'SELECT id FROM'),
    parameters,
  );
  const ids = selected.rows.map((row) => row.id);
  if (ids.length > 0) {
    const url = process.env.DATABASE_URL_MIGRATE;
    if (!url) throw new Error('recovery fixture teardown requires DATABASE_URL_MIGRATE');
    const migrate = createDb(url);
    try {
      const column = parent === 'workspaces' ? 'workspace_id' : 'managed_system_id';
      for (const schema of ['dashboard', 'survey']) {
        const prefix = schema === 'dashboard' ? 'recovery' : 'outcome_recovery';
        const key = `${prefix}_item_id`;
        for (const suffix of ['history', 'presentations', 'identities']) {
          await migrate.pool.query(
            `DELETE FROM ${schema}.${prefix}_${suffix} p
            WHERE (p.workspace_id,p.${key}) IN (SELECT i.workspace_id,i.${key}
              FROM ${schema}.${prefix}_identities i WHERE i.${column}=ANY($1::uuid[]))
              ${parent === 'workspaces' ? 'OR p.workspace_id=ANY($1::uuid[])' : ''}`,
            [ids],
          );
        }
      }
      await migrate.pool.query(
        `DELETE FROM core.responsibility_default_failures
        WHERE ${column}=ANY($1::uuid[])`,
        [ids],
      );
    } finally {
      await migrate.close();
    }
  }
  return handle.pool.query(statement, parameters);
}
