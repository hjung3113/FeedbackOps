import type { DbHandle } from '../../../db/client.js';

export async function insertActorRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    externalId: string;
    email?: string;
    displayName?: string;
    roleLevel: 'admin' | 'developer' | 'user';
  },
): Promise<{ id: string }> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.actors (
        workspace_id, external_id, email, display_name, role_level, actor_type
      )
     values ($1, $2, $3, $4, $5, 'internal_member')
     returning id`,
    [
      input.workspaceId,
      input.externalId,
      input.email ?? `${input.externalId}@local`,
      input.displayName ?? input.externalId,
      input.roleLevel,
    ],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertActorRow failed for externalId=${input.externalId}`);
  return { id };
}

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

export async function insertVocClusterRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    title?: string;
    summary?: string | null;
    status?: 'draft' | 'confirmed';
    primaryManagedSystemId: string;
    createdBy: string;
  },
): Promise<{ id: string; display_id: string }> {
  const res = await dbHandle.pool.query<{ id: string; display_id: string }>(
    `insert into voc_cluster.voc_clusters (
        workspace_id, display_id, title, summary, status, primary_managed_system_id, created_by
      )
     values (
        $1, core.next_display_id($1::uuid, 'cluster'), $2, $3, $4, $5, $6
      )
     returning id, display_id`,
    [
      input.workspaceId,
      input.title ?? 'Seed cluster',
      input.summary ?? null,
      input.status ?? 'draft',
      input.primaryManagedSystemId,
      input.createdBy,
    ],
  );
  const row = res.rows[0];
  if (!row)
    throw new Error(`insertVocClusterRow failed for title=${input.title ?? 'Seed cluster'}`);
  return row;
}

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

export async function insertVocClusterMemberRow(
  dbHandle: DbHandle,
  input: { clusterId: string; vocId: string; addedBy: string },
): Promise<void> {
  await dbHandle.pool.query(
    `insert into voc_cluster.voc_cluster_members (cluster_id, voc_id, added_by)
     values ($1, $2, $3)`,
    [input.clusterId, input.vocId, input.addedBy],
  );
}
