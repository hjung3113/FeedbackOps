import type { PermissionSourceSummary } from '@fops/shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import { checkFindingManage } from '../findings/authorization.js';
import type { ActorContext, CheckService } from '../permissions/check-service.js';

/** Task-owned, workspace-scoped metadata projection with the shipped Task read gate. */
export async function permissionTaskSourceSummary(
  db: Tx,
  checkService: CheckService,
  actor: ActorContext,
  id: string,
): Promise<PermissionSourceSummary | null> {
  if (
    actor.role_level !== 'admin' &&
    actor.role_level !== 'developer' &&
    actor.role_level !== 'user'
  ) {
    throw new Error('unexpected source reader Role Level');
  }
  if (actor.role_level === 'user') return null;
  const result = await db.execute<{
    id: string;
    display_id: string;
    status: string;
    primary_managed_system_id: string;
  }>(sql`select id, display_id, status, primary_managed_system_id
    from task.tasks where workspace_id = ${actor.workspace_id} and id = ${id} limit 1`);
  const row = result.rows[0];
  if (!row) return null;
  const access = await checkFindingManage(
    checkService,
    { ...actor, role_level: actor.role_level },
    row.primary_managed_system_id,
    {
      requireElevatedRole: true,
    },
    { tx: db },
  );
  if (!access.allow) return null;
  return { type: 'task', id: row.id, display_id: row.display_id, status: row.status };
}
