import type { DbHandle } from '../db/client.js';

export async function insertDevActor(
  dbHandle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-dev-read-${suffix}`;
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member')
       on conflict (workspace_id, external_id) do update set email = excluded.email
       returning id`,
    [workspaceId, externalId, `dev-read-${suffix}@local`, `Dev Read ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertDevActor failed for ${externalId}`);
  return { id, externalId };
}
