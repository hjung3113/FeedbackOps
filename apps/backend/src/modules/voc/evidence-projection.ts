import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import type { ActorContext, CheckService } from '../permissions/check-service.js';
import { isVocVisibleToActor } from './authorization.js';

/** VOC-owned, batch-safe source metadata for attached Evidence; no domain writes. */
export async function readVocEvidenceSources(
  checkService: CheckService,
  tx: Tx,
  actor: ActorContext,
  ids: string[],
): Promise<Map<string, { id: string; display_id: string; title: string; route: string }>> {
  const sources = new Map<
    string,
    { id: string; display_id: string; title: string; route: string }
  >();
  if (ids.length === 0) return sources;
  const result = await tx.execute<{
    id: string;
    display_id: string;
    title: string;
    primary_managed_system_id: string;
    reporter_id: string;
  }>(sql`SELECT id,display_id,title,primary_managed_system_id,reporter_id FROM voc.vocs
    WHERE workspace_id=${actor.workspace_id} AND id=ANY(${sql.param(ids)}::uuid[])
      AND archived_at IS NULL`);
  const allowedSystemIds: string[] = [];
  for (const id of new Set(result.rows.map((row) => row.primary_managed_system_id))) {
    if (
      (
        await checkService.checkCapability(
          actor,
          'voc.read',
          {
            workspace_id: actor.workspace_id,
            managed_system_id: id,
          },
          { tx },
        )
      ).allow
    )
      allowedSystemIds.push(id);
  }
  for (const row of result.rows) {
    if (
      !isVocVisibleToActor(
        { kind: 'scoped', managedSystemIds: allowedSystemIds },
        actor.actor_id,
        row,
      )
    )
      continue;
    sources.set(row.id, {
      id: row.id,
      display_id: row.display_id,
      title: row.title,
      route: `/vocs?view=inbox&selected=${row.id}`,
    });
  }
  return sources;
}
