import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-saved-view';

describe.skipIf(!runIntegration)('saved view routes (#143)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let actorACookie: string;
  let actorAId: string;
  let actorBCookie: string;
  let reporterId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    actorACookie = await loginAs(app, 'mock-admin-1');
    const admin = await appHandle.pool.query<{ id: string }>('select id from core.actors where external_id = $1 and workspace_id = $2', ['mock-admin-1', WORKSPACE_ID]);
    actorAId = admin.rows[0]?.id ?? '';
    actorBCookie = await loginAs(app, 'mock-user-1');
    const reporter = await appHandle.pool.query<{ id: string }>('select id from core.actors where external_id = $1 and workspace_id = $2', ['mock-user-1', WORKSPACE_ID]);
    reporterId = reporter.rows[0]?.id ?? '';
  });

  beforeEach(async () => {
    await migrateHandle.pool.query('delete from core.saved_views where workspace_id = $1', [WORKSPACE_ID]);
    await cleanupReadTestTables(appHandle, WORKSPACE_ID, PREFIX);
  });

  afterAll(async () => {
    await migrateHandle.pool.query('delete from core.saved_views where workspace_id = $1', [WORKSPACE_ID]);
    await cleanupReadTestTables(appHandle, WORKSPACE_ID, PREFIX);
    await app?.close();
    await migrateHandle?.close();
    await appHandle?.close();
  });

  it('keeps actor B unable to list, read, update, or delete actor A private views', async () => {
    const created = await app.inject({ method: 'POST', url: '/saved-views', headers: { cookie: `${SESSION_COOKIE_NAME}=${actorACookie}` }, payload: { surface: 'voc', name: 'Actor A only', filter: { view: 'inbox' } } });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    const listed = await app.inject({ method: 'GET', url: '/saved-views', headers: { cookie: `${SESSION_COOKIE_NAME}=${actorBCookie}` } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: unknown[] }>().items).toHaveLength(0);
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({ method, url: `/saved-views/${id}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${actorBCookie}` }, ...(method === 'PATCH' ? { payload: { name: 'attempt' } } : {}) });
      expect(response.statusCode).toBe(404);
      expect(response.json<{ code: string }>().code).toBe('not_found.record');
    }
  });

  it('round-trips a saved VOC filter to the same list rows as the direct query', async () => {
    const msId = await insertMsDirectly(appHandle, WORKSPACE_ID, `${uid(PREFIX)}-roundtrip`, 'Saved view round trip');
    await insertVocDirectly(appHandle, WORKSPACE_ID, msId, reporterId, 'Saved view row');
    const filter = { view: 'inbox', managed_system_id: msId };
    const saved = await app.inject({ method: 'POST', url: '/saved-views', headers: { cookie: `${SESSION_COOKIE_NAME}=${actorACookie}` }, payload: { surface: 'voc', name: 'Only this MS', filter } });
    expect(saved.statusCode).toBe(201);
    const view = saved.json<{ filter: Record<string, string> }>();
    const direct = await app.inject({ method: 'GET', url: `/vocs?view=inbox&managed_system_id=${msId}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${actorACookie}` } });
    const applied = await app.inject({ method: 'GET', url: `/vocs?${new URLSearchParams(view.filter).toString()}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${actorACookie}` } });
    expect(direct.statusCode).toBe(200);
    expect(applied.statusCode).toBe(200);
    expect(direct.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toEqual(applied.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id));
    expect(applied.json<{ items: unknown[] }>().items).not.toHaveLength(0);
  });

  it('fails closed when the migrate role inserts an invalid historical payload', async () => {
    await migrateHandle.pool.query(
      `insert into core.saved_views (workspace_id, actor_id, surface, name, filter_payload)
       values ($1, $2, 'voc', 'invalid payload', $3::jsonb)`,
      [WORKSPACE_ID, actorAId, JSON.stringify({ view: 'not-a-real-view' })],
    );
    const response = await app.inject({ method: 'GET', url: '/saved-views', headers: { cookie: `${SESSION_COOKIE_NAME}=${actorACookie}` } });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('maps the actor/surface/name unique constraint to conflict', async () => {
    const first = { surface: 'voc', name: 'Duplicate', filter: { view: 'inbox' } };
    expect((await app.inject({ method: 'POST', url: '/saved-views', headers: { cookie: `${SESSION_COOKIE_NAME}=${actorACookie}` }, payload: first })).statusCode).toBe(201);
    const duplicate = await app.inject({ method: 'POST', url: '/saved-views', headers: { cookie: `${SESSION_COOKIE_NAME}=${actorACookie}` }, payload: first });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<{ code: string }>().code).toBe('conflict.saved_view_name_taken');
  });
});
