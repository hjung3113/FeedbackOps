// Integration tests for GET /actors/resolve (owner-chip name lookup, #87).
// Covers: resolves actor display_name + email; resolves team name;
// out-of-workspace / unknown ids are dropped; empty query → empty arrays.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
// core.teams is INSERT-restricted to the fops_migrate role (ADR-0008 role
// separation), so seeding a test team needs the migrate connection.
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  return null;
}

async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error(`mock-login failed: ${res.statusCode} ${res.body}`);
  return cookie;
}

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';

describe.skipIf(!runIntegration)('GET /actors/resolve', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    await migrateHandle.pool.query('delete from core.teams where id = $1', [TEAM_ID]);
    await app?.close();
    await migrateHandle?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
  });

  it('resolves actor names/emails and team names; drops unknown ids', async () => {
    const adminRow = await dbHandle.pool.query<{ id: string; display_name: string }>(
      `select id, display_name from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const admin = adminRow.rows[0];
    if (!admin) throw new Error('mock-admin-1 missing');
    await migrateHandle.pool.query(
      `insert into core.teams (id, workspace_id, name) values ($1, $2, 'Data Platform')
        on conflict (id) do nothing`,
      [TEAM_ID, WORKSPACE_ID],
    );

    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: `/actors/resolve?actor_ids=${admin.id},${UNKNOWN_ID}&team_ids=${TEAM_ID}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.actors).toHaveLength(1);
    expect(body.actors[0].id).toBe(admin.id);
    expect(body.actors[0].display_name).toBe(admin.display_name);
    expect(typeof body.actors[0].email).toBe('string');
    expect(body.teams).toEqual([{ id: TEAM_ID, name: 'Data Platform' }]);
  });

  it('empty query returns empty arrays', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: '/actors/resolve',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ actors: [], teams: [] });
  });
});
