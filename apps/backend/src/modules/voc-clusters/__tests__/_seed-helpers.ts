import type { DbHandle } from '../../../db/client.js';

export async function grantCapability(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    actorId: string;
    capability: string;
    managedSystemId: string | null;
    grantedByActorId: string;
  },
): Promise<{ id: string }> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into permission.permission_grants (
        workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id
      )
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      input.workspaceId,
      input.actorId,
      input.capability,
      input.managedSystemId,
      input.grantedByActorId,
    ],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`grantCapability failed for capability=${input.capability}`);
  return { id };
}

export {
  cleanupVocClusterFixtures,
  insertVocClusterMemberRow,
  insertVocClusterRow,
} from '../../../test-support/voc-cluster-fixtures.js';
export { insertActorRow } from '../../../test-support/actor-fixtures.js';

export async function insertVocRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    primaryManagedSystemId: string;
    reporterId: string;
    title?: string;
  },
): Promise<{ id: string }> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into voc.vocs (
        workspace_id, primary_managed_system_id, reporter_id, display_id, title,
        description_rich_content, source_context, reporter_facing_status, triage_state
      )
     values (
        $1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
        'direct_use', 'received', 'untriaged'
      )
     returning id`,
    [input.workspaceId, input.primaryManagedSystemId, input.reporterId, input.title ?? 'Seed VOC'],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertVocRow failed for title=${input.title ?? 'Seed VOC'}`);
  return { id };
}
