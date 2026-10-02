import type { FastifyInstance } from 'fastify';

import type { DbHandle } from '../db/client.js';
import { SESSION_COOKIE_NAME } from './auth.js';

// Direct SQL insert of a managed system — bypasses mutation rate limit.
// Use this in read integration tests where many MSs need to be created quickly.
export async function insertMsDirectly(
  dbHandle: DbHandle,
  workspaceId: string,
  slug: string,
  name: string,
): Promise<string> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.managed_systems (workspace_id, slug, name)
     values ($1, $2, $3)
     returning id`,
    [workspaceId, slug, name],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertMsDirectly failed for slug=${slug}`);
  return id;
}

export async function createAa(
  app: FastifyInstance,
  cookie: string,
  body: { managed_system_id: string; slug: string; name: string },
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/analytics-areas',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: body,
  });
  if (res.statusCode !== 201) throw new Error(`createAa failed: ${res.statusCode} ${res.body}`);
  return res.json().id as string;
}
