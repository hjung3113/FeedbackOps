import type { DbHandle } from '../../../db/client.js';

type VocClusterFixtureIds = {
  workspaceId: string;
  actorIds: readonly string[];
  managedSystemIds: readonly string[];
  clusterIds: readonly string[];
  findingIds: readonly string[];
  vocIds?: readonly string[];
  permissionGrantIds?: readonly string[];
  deleteWorkspace?: boolean;
};

/**
 * Removes only the rows owned by a VOC-cluster integration fixture.  The
 * ordering lives here so suites do not broaden shared-workspace cleanup when
 * a new FK edge is introduced.
 */
export async function cleanupVocClusterFixtures(
  dbHandle: DbHandle,
  input: VocClusterFixtureIds,
): Promise<void> {
  const vocIds = input.vocIds ?? [];
  const permissionGrantIds = input.permissionGrantIds ?? [];

  await dbHandle.pool.query(
    'delete from finding.evidence_highlights where finding_id = any($1::uuid[])',
    [input.findingIds],
  );
  await dbHandle.pool.query(
    `delete from core.entity_links
      where workspace_id = $1
        and (source_id = any($2::uuid[]) or target_id = any($3::uuid[]))`,
    [input.workspaceId, input.clusterIds, input.findingIds],
  );
  await dbHandle.pool.query(
    `delete from core.audit_log
      where workspace_id = $1
        and (
          actor_id = any($2::uuid[])
          or subject_id = any($3::uuid[])
          or detail->>'voc_cluster_id' = any($4::text[])
          or detail->'source'->>'id' = any($4::text[])
        )`,
    [input.workspaceId, input.actorIds, input.findingIds, input.clusterIds],
  );
  await dbHandle.pool.query('delete from permission.permission_grants where id = any($1::uuid[])', [
    permissionGrantIds,
  ]);
  await dbHandle.pool.query('delete from core.idempotency_keys where actor_id = any($1::uuid[])', [
    input.actorIds,
  ]);
  await dbHandle.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
    input.actorIds,
  ]);
  await dbHandle.pool.query(
    'delete from voc.voc_attachments where uploaded_by_actor_id = any($1::uuid[])',
    [input.actorIds],
  );
  await dbHandle.pool.query('delete from finding.findings where id = any($1::uuid[])', [
    input.findingIds,
  ]);
  await dbHandle.pool.query(
    'delete from voc_cluster.voc_cluster_members where cluster_id = any($1::uuid[])',
    [input.clusterIds],
  );
  await dbHandle.pool.query('delete from voc_cluster.voc_clusters where id = any($1::uuid[])', [
    input.clusterIds,
  ]);
  await dbHandle.pool.query('delete from voc.vocs where id = any($1::uuid[])', [vocIds]);
  await dbHandle.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [
    input.managedSystemIds,
  ]);
  await dbHandle.pool.query('delete from core.actors where id = any($1::uuid[])', [input.actorIds]);

  if (input.deleteWorkspace) {
    await dbHandle.pool.query('delete from core.display_counters where workspace_id = $1', [
      input.workspaceId,
    ]);
    await dbHandle.pool.query('delete from core.workspaces where id = $1', [input.workspaceId]);
  }
}

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
