import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { vocPreSubmitPeersResponseSchema } from '@fops/shared';

import { loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import { buildServer } from '../../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  uid,
} from '../../__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-presubmit-peers';

describe.skipIf(!runIntegration)('GET /vocs/pre-submit-peers (#293)', () => {
  let dbHandle: DbHandle;
  let ops: DbHandle;
  let app: FastifyInstance;
  let adminId: string;
  let adminCookie: string;
  let foreignWorkspaceId = '';

  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const peersUrl = (managedSystemId: string) => `/vocs/pre-submit-peers?managed_system_id=${managedSystemId}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await dbHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('mock-admin-1 not found');
  });

  beforeEach(async () => {
    await cleanup();
    foreignWorkspaceId = randomUUID();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await dbHandle?.close();
    await ops?.close();
  });

  async function seedVoc(
    managedSystemId: string,
    title: string,
    createdAt: string,
    reporterId = adminId,
  ): Promise<{ id: string; display_id: string; title: string; created_at: string }> {
    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, managedSystemId, reporterId, title);
    await dbHandle.pool.query('update voc.vocs set created_at = $2::timestamptz where id = $1', [
      voc.id,
      createdAt,
    ]);
    const row = await dbHandle.pool.query<{ display_id: string }>(
      'select display_id from voc.vocs where id = $1',
      [voc.id],
    );
    return {
      id: voc.id,
      display_id: row.rows[0]?.display_id ?? '',
      title,
      created_at: new Date(createdAt).toISOString(),
    };
  }

  async function cleanup(): Promise<void> {
    if (!ops) return;
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    if (!foreignWorkspaceId) return;
    await ops.pool.query('delete from voc.vocs where workspace_id = $1', [foreignWorkspaceId]);
    await ops.pool.query('delete from core.managed_systems where workspace_id = $1', [foreignWorkspaceId]);
    await ops.pool.query('delete from core.actors where workspace_id = $1', [foreignWorkspaceId]);
    await ops.pool.query('delete from core.workspaces where id = $1', [foreignWorkspaceId]);
  }

  it('returns exactly the newest three authorized same-system peers in order with the strict wire fields', async () => {
    const systemId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Peer system');
    const otherSystemId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other system');
    const oldest = await seedVoc(systemId, 'Oldest peer', '2026-01-01T00:00:01Z');
    const third = await seedVoc(systemId, 'Third peer', '2026-01-01T00:00:03Z');
    const second = await seedVoc(systemId, 'Second peer', '2026-01-01T00:00:04Z');
    const first = await seedVoc(systemId, 'First peer', '2026-01-01T00:00:05Z');
    const archived = await seedVoc(systemId, 'Newest but archived', '2026-01-01T00:00:09Z');
    await dbHandle.pool.query("update voc.vocs set archived_at = now() where title = 'Newest but archived' and workspace_id = $1", [WORKSPACE_ID]);
    const otherSystem = await seedVoc(otherSystemId, 'Other Managed System', '2026-01-01T00:00:10Z');

    await ops.pool.query("insert into core.workspaces (id, name) values ($1, 'pre-submit foreign workspace')", [foreignWorkspaceId]);
    const foreignActor = await ops.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, 'pre-submit-foreign', 'pre-submit-foreign@local', 'Foreign', 'admin', 'internal_member') returning id`,
      [foreignWorkspaceId],
    );
    const foreignSystem = await ops.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, 'pre-submit-foreign', 'Foreign system') returning id`,
      [foreignWorkspaceId],
    );
    await ops.pool.query(
      `insert into voc.vocs (workspace_id, primary_managed_system_id, reporter_id, display_id, title,
        description_rich_content, source_context, reporter_facing_status, triage_state, created_at)
       values ($1, $2, $3, voc.next_voc_display_id($1::uuid), 'Foreign workspace peer',
        '{"type":"doc","content":[]}'::jsonb, 'direct_use', 'received', 'untriaged', '2026-01-01T00:00:11Z')`,
      [foreignWorkspaceId, foreignSystem.rows[0]?.id, foreignActor.rows[0]?.id],
    );

    const response = await app.inject({ method: 'GET', url: peersUrl(systemId), headers: headers(adminCookie) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    const body = vocPreSubmitPeersResponseSchema.parse(response.json());
    expect(Object.keys(body)).toEqual(['items']);
    expect(body.items.map((item) => item.id)).toEqual([first.id, second.id, third.id]);
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toMatchObject({
      id: first.id,
      display_id: first.display_id,
      title: first.title,
      created_at: first.created_at,
    });
    expect(body.items[0]?.id).not.toBe(body.items[0]?.display_id);
    expect(body.items.map((item) => item.id)).not.toContain(oldest.id);
    expect(body.items.map((item) => item.id)).not.toContain(archived.id);
    expect(body.items.map((item) => item.id)).not.toContain(otherSystem.id);
    const foreign = await app.inject({
      method: 'GET',
      url: peersUrl(foreignSystem.rows[0]?.id ?? ''),
      headers: headers(adminCookie),
    });
    expect(foreign.statusCode).toBe(200);
    expect(vocPreSubmitPeersResponseSchema.parse(foreign.json())).toEqual({ items: [] });
  });

  it('excludes unreadable peers but retains the requesting reporter own peer', async () => {
    const systemId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Unreadable system');
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid('pre-submit-unscoped'));
    const hidden = await seedVoc(systemId, 'Unreadable peer', '2026-01-01T00:00:02Z');
    const owned = await seedVoc(systemId, 'Reporter own peer', '2026-01-01T00:00:01Z', actor.id);
    const cookie = await loginAs(app, actor.externalId);

    const response = await app.inject({ method: 'GET', url: peersUrl(systemId), headers: headers(cookie) });
    expect(response.statusCode).toBe(200);
    const body = vocPreSubmitPeersResponseSchema.parse(response.json());
    expect(body.items.map((item) => item.id)).not.toContain(hidden.id);
    expect(body.items.map((item) => item.id)).toEqual([owned.id]);
  });

  it('applies visibility before the cap so hidden newest rows cannot consume peer slots', async () => {
    const systemId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Cap visibility system');
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid('pre-submit-cap'));
    const visibleOldest = await seedVoc(systemId, 'Visible oldest', '2026-01-01T00:00:01Z', actor.id);
    const visibleMiddle = await seedVoc(systemId, 'Visible middle', '2026-01-01T00:00:02Z', actor.id);
    const visibleNewest = await seedVoc(systemId, 'Visible newest', '2026-01-01T00:00:03Z', actor.id);
    await seedVoc(systemId, 'Hidden newest 1', '2026-01-01T00:00:04Z');
    await seedVoc(systemId, 'Hidden newest 2', '2026-01-01T00:00:05Z');
    await seedVoc(systemId, 'Hidden newest 3', '2026-01-01T00:00:06Z');
    const cookie = await loginAs(app, actor.externalId);

    const response = await app.inject({ method: 'GET', url: peersUrl(systemId), headers: headers(cookie) });
    expect(response.statusCode).toBe(200);
    expect(vocPreSubmitPeersResponseSchema.parse(response.json()).items.map((item) => item.id)).toEqual([
      visibleNewest.id,
      visibleMiddle.id,
      visibleOldest.id,
    ]);
  });

  it('returns an empty normal result for an existing system with no peers and for a foreign system id', async () => {
    const emptySystemId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Empty system');
    const empty = await app.inject({ method: 'GET', url: peersUrl(emptySystemId), headers: headers(adminCookie) });
    expect(empty.statusCode).toBe(200);
    expect(vocPreSubmitPeersResponseSchema.parse(empty.json())).toEqual({ items: [] });

    await ops.pool.query("insert into core.workspaces (id, name) values ($1, 'pre-submit foreign empty')", [foreignWorkspaceId]);
    const foreignSystem = await ops.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, 'pre-submit-foreign-empty', 'Foreign empty') returning id`,
      [foreignWorkspaceId],
    );
    const foreign = await app.inject({ method: 'GET', url: peersUrl(foreignSystem.rows[0]?.id ?? ''), headers: headers(adminCookie) });
    expect(foreign.statusCode).toBe(200);
    expect(vocPreSubmitPeersResponseSchema.parse(foreign.json())).toEqual({ items: [] });
  });

  it('registers the static route without shadowing saved VOC detail', async () => {
    const systemId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Route system');
    const saved = await seedVoc(systemId, 'Saved VOC detail', '2026-01-01T00:00:01Z');
    expect(app.hasRoute({ method: 'GET', url: '/vocs/pre-submit-peers' })).toBe(true);
    const detail = await app.inject({ method: 'GET', url: `/vocs/${saved.id}`, headers: headers(adminCookie) });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ id: string }>().id).toBe(saved.id);
  });

  it('rejects missing and malformed managed_system_id and rejects unauthenticated requests', async () => {
    const missing = await app.inject({ method: 'GET', url: '/vocs/pre-submit-peers', headers: headers(adminCookie) });
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['managed_system_id'], code: 'invalid' }] } });
    const malformed = await app.inject({ method: 'GET', url: '/vocs/pre-submit-peers?managed_system_id=not-a-uuid', headers: headers(adminCookie) });
    expect(malformed.statusCode).toBe(422);
    expect(malformed.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['managed_system_id'], code: 'invalid' }] } });
    const unauthenticated = await app.inject({ method: 'GET', url: '/vocs/pre-submit-peers?managed_system_id=00000000-0000-4000-8000-000000000000' });
    expect(unauthenticated.statusCode).toBe(401);
  });
});
