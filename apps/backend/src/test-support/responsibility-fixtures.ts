import { createDb } from '../db/client.js';

/** Diagnostics are append-only for fops_app; teardown uses migrate, scoped to suite systems. */
export async function cleanupResponsibilityFailures(workspaceId: string, systemSlugPrefix: string) {
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url) throw new Error('responsibility fixture cleanup requires DATABASE_URL_MIGRATE');
  const ops = createDb(url);
  try {
    await ops.pool.query(
      `delete from core.responsibility_default_failures
      where workspace_id=$1 and managed_system_id in
        (select id from core.managed_systems where workspace_id=$1 and slug like $2)`,
      [workspaceId, `${systemSlugPrefix}%`],
    );
  } finally {
    await ops.close();
  }
}
