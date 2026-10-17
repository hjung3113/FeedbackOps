import type { PermissionSourceSummary } from '@fops/shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import type { ActorContext } from '../permissions/check-service.js';
import { actorReadScope, isVocVisibleToActor } from './authorization.js';

/** VOC-owned metadata allowlist using the canonical scope-or-reporter rule. */
export async function permissionVocSourceSummary(
  db: Tx,
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
  const result = await db.execute<{
    id: string;
    display_id: string;
    reporter_facing_status: string;
    primary_managed_system_id: string;
    reporter_id: string;
  }>(sql`select id, display_id, reporter_facing_status, primary_managed_system_id, reporter_id
    from voc.vocs where workspace_id = ${actor.workspace_id} and id = ${id} limit 1`);
  const row = result.rows[0];
  if (!row) return null;
  const scope = await actorReadScope(db, { ...actor, role_level: actor.role_level });
  if (!isVocVisibleToActor(scope, actor.actor_id, row)) return null;
  return {
    type: 'voc',
    id: row.id,
    display_id: row.display_id,
    status: row.reporter_facing_status,
  };
}
