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
