import type { DbHandle } from '../db/client.js';

export async function grantCapability(
  dbHandle: DbHandle,
  workspaceId: string,
  actorId: string,
  capability: string,
  msId: string | null,
  grantedByActorId: string,
): Promise<string> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into permission.permission_grants
       (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [workspaceId, actorId, capability, msId, grantedByActorId],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`grantCapability: no id returned for ${capability}`);
  return id;
}

export async function revokeCapabilityGrant(
  dbHandle: DbHandle,
  grantId: string,
  revokedByActorId: string,
): Promise<void> {
  const result = await dbHandle.pool.query(
    `update permission.permission_grants
        set revoked_at = now(), revoked_by_actor_id = $2, revoked_reason = 'test'
      where id = $1
      returning id`,
    [grantId, revokedByActorId],
  );
  if (result.rowCount !== 1) throw new Error(`revokeCapabilityGrant: grant not found: ${grantId}`);
}

export async function expireCapabilityGrant(dbHandle: DbHandle, grantId: string): Promise<void> {
  const result = await dbHandle.pool.query(
    `update permission.permission_grants
        set expires_at = now() - interval '1 second'
      where id = $1
      returning id`,
    [grantId],
  );
  if (result.rowCount !== 1) throw new Error(`expireCapabilityGrant: grant not found: ${grantId}`);
}

export async function denyCapability(
  dbHandle: DbHandle,
  workspaceId: string,
  actorId: string,
  capability: string,
  msId: string | null,
  createdByActorId: string,
): Promise<string> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into permission.permission_denies
       (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
     values ($1, $2, $3, $4, 'test-deny', $5)
     returning id`,
    [workspaceId, actorId, capability, msId, createdByActorId],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`denyCapability: no id returned for ${capability}`);
  return id;
}

export async function revokeDeny(
  dbHandle: DbHandle,
  denyId: string,
  revokedByActorId: string,
): Promise<void> {
  await dbHandle.pool.query(
    `update permission.permission_denies set revoked_at = now(), revoked_by_actor_id = $2 where id = $1`,
    [denyId, revokedByActorId],
  );
}

export async function insertPermissionRequestRow(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    requesterActorId: string;
    requestedCapability: string;
    requestedManagedSystemId?: string | null;
    reason: string;
    status?: 'pending' | 'needs_more_info' | 'approved' | 'rejected' | 'expired' | 'revoked';
  },
): Promise<{ id: string }> {
  const result = await dbHandle.pool.query<{ id: string }>(
    `insert into permission.permission_requests (
        workspace_id, requester_actor_id, requested_capability,
        requested_managed_system_id, reason, status
      )
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      input.workspaceId,
      input.requesterActorId,
      input.requestedCapability,
      input.requestedManagedSystemId ?? null,
      input.reason,
      input.status ?? 'pending',
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('insertPermissionRequestRow failed');
  return { id };
}

/** Target-scale selected-read fixture; seed canonical rows first, then populate their shape. */
export async function seedPermissionSelectedReadScale(
  dbHandle: DbHandle,
  input: { workspaceId: string; managedSystemId: string; actorId: string; prefix: string },
): Promise<{ vocId: string; taskId: string; vocCount: number; taskCount: number }> {
  const { insertVocDirectly } = await import('./voc-fixtures.js');
  const { insertTaskRow } = await import('./task-fixtures.js');
  const voc = await insertVocDirectly(
    dbHandle,
    input.workspaceId,
    input.managedSystemId,
    input.actorId,
    'Scale VOC',
  );
  const task = await insertTaskRow(dbHandle, {
    workspaceId: input.workspaceId,
    primaryManagedSystemId: input.managedSystemId,
    title: 'Scale Task',
    createdBy: input.actorId,
  });
  await dbHandle.pool.query(
    `insert into voc.vocs (workspace_id, primary_managed_system_id, reporter_id, display_id,
      title, description_rich_content, source_context, reporter_facing_status, triage_state)
     select v.workspace_id, v.primary_managed_system_id, v.reporter_id, $2 || '-VOC-' || n,
       v.title, v.description_rich_content, v.source_context, v.reporter_facing_status, v.triage_state
     from voc.vocs v cross join generate_series(1, 4999) n where v.id = $1`,
    [voc.id, input.prefix],
  );
  await dbHandle.pool.query(
    `insert into task.tasks (workspace_id, primary_managed_system_id, display_id, title, status, priority, created_by)
     select t.workspace_id, t.primary_managed_system_id, $2 || '-Task-' || n,
       t.title, t.status, t.priority, t.created_by
     from task.tasks t cross join generate_series(1, 4999) n where t.id = $1`,
    [task.id, input.prefix],
  );
  const populations = await dbHandle.pool.query<{ voc_count: number; task_count: number }>(
    `select (select count(*)::int from voc.vocs where primary_managed_system_id = $1) as voc_count,
      (select count(*)::int from task.tasks where primary_managed_system_id = $1) as task_count`,
    [input.managedSystemId],
  );
  const population = populations.rows[0];
  if (!population) throw new Error('selected-read population count missing');
  return {
    vocId: voc.id,
    taskId: task.id,
    vocCount: population.voc_count,
    taskCount: population.task_count,
  };
}
