// #514 A6 — Analytics Area scope on create and PATCH: not_found.record for
// unknown/other-workspace ids, out_of_scope for cross-Managed-System areas,
// conflict.parent_archived for archived areas; null clears on PATCH.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-milestone-aa';

describe.skipIf(!runIntegration)('milestone analytics area scope (#514 A6)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  let otherWorkspaceId = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id from core.actors
        where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1 and event_type in ('milestone_created', 'milestone_updated')`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from task.milestones
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.analytics_areas
        where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    if (otherWorkspaceId) {
      await migrateHandle.pool.query('delete from core.analytics_areas where workspace_id = $1', [
        otherWorkspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.managed_systems where workspace_id = $1', [
        otherWorkspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.workspaces where id = $1', [
        otherWorkspaceId,
      ]);
      otherWorkspaceId = '';
    }
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedScopedAdmin(msId: string): Promise<string> {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'finding.manage', msId, adminActorId);
    return loginAs(app, actor.externalId);
  }

  async function seedArea(msId: string, archived = false): Promise<string> {
    const row = await dbHandle.pool.query<{ id: string }>(
      `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
       values ($1, $2, $3, $4) returning id`,
      [WORKSPACE_ID, msId, uid(`${SLUG_PREFIX}-aa`), 'Milestone AA'],
    );
    const id = row.rows[0]?.id;
    if (!id) throw new Error('analytics area seed failed');
    if (archived) {
      await dbHandle.pool.query(
        'update core.analytics_areas set archived_at = now(), archived_by_actor_id = $2 where id = $1',
        [id, adminActorId],
      );
    }
    return id;
  }

  async function seedForeignWorkspaceArea(): Promise<string> {
    otherWorkspaceId = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      otherWorkspaceId,
      `AA foreign ws ${SLUG_PREFIX}`,
    ]);
    const foreignMs = await insertMsDirectly(
      dbHandle,
      otherWorkspaceId,
      uid(SLUG_PREFIX),
      'Foreign MS',
    );
    const row = await dbHandle.pool.query<{ id: string }>(
      `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
       values ($1, $2, $3, $4) returning id`,
      [otherWorkspaceId, foreignMs, uid(`${SLUG_PREFIX}-aa`), 'Foreign AA'],
    );
    const id = row.rows[0]?.id;
    if (!id) throw new Error('foreign analytics area seed failed');
    return id;
  }

  function createMilestone(
    cookie: string,
    payload: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: '/milestones',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
  }

  function patchMilestone(
    cookie: string,
    milestoneId: string,
    payload: Record<string, unknown>,
    ifMatch: string,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/milestones/${milestoneId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'if-match': ifMatch,
      },
      payload,
    });
  }

  function getMilestone(cookie: string, milestoneId: string) {
    return app.inject({
      method: 'GET',
      url: `/milestones/${milestoneId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  const createBody = (msId: string, analyticsAreaId?: string | null): Record<string, unknown> => ({
    title: 'AA scope milestone',
    why: 'Why',
    primary_managed_system_id: msId,
    ...(analyticsAreaId !== undefined ? { analytics_area_id: analyticsAreaId } : {}),
    start_date: '2026-10-01',
    target_date: '2026-12-31',
  });

  it('create: unknown analytics_area_id is not_found.record and writes no row', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA MS');
    const cookie = await seedScopedAdmin(ms);

    const res = await createMilestone(cookie, createBody(ms, randomUUID()));
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');

    const rows = await dbHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from task.milestones
        where workspace_id = $1 and primary_managed_system_id = $2`,
      [WORKSPACE_ID, ms],
    );
    expect(rows.rows[0]?.count).toBe(0);
  });

  it('create: area in another Managed System is validation.failed with out_of_scope on analytics_area_id', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA MS');
    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const cookie = await seedScopedAdmin(ms);
    const foreignArea = await seedArea(otherMs);

    const res = await createMilestone(cookie, createBody(ms, foreignArea));
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }] },
    });
  });

  it('other-workspace area is not_found.record on create and patch, with no writes', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA MS');
    const cookie = await seedScopedAdmin(ms);
    const foreignWsArea = await seedForeignWorkspaceArea();

    const rejected = await createMilestone(cookie, createBody(ms, foreignWsArea));
    expect(rejected.statusCode).toBe(404);
    expect(rejected.json<{ code: string }>().code).toBe('not_found.record');
    const created = await dbHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from task.milestones
        where workspace_id = $1 and primary_managed_system_id = $2`,
      [WORKSPACE_ID, ms],
    );
    expect(created.rows[0]?.count).toBe(0);

    const ok = await createMilestone(cookie, createBody(ms));
    expect(ok.statusCode).toBe(201);
    const before = ok.json<{
      id: string;
      analytics_area_id: string | null;
      updated_at: string;
    }>();
    expect(before.analytics_area_id).toBeNull();

    const patched = await patchMilestone(
      cookie,
      before.id,
      { analytics_area_id: foreignWsArea },
      before.updated_at,
    );
    expect(patched.statusCode).toBe(404);
    expect(patched.json<{ code: string }>().code).toBe('not_found.record');

    const after = await getMilestone(cookie, before.id);
    expect(after.json<{ analytics_area_id: string | null; updated_at: string }>()).toMatchObject({
      analytics_area_id: null,
      updated_at: before.updated_at,
    });
  });

  it('create: archived area is conflict.parent_archived', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA MS');
    const cookie = await seedScopedAdmin(ms);
    const archivedArea = await seedArea(ms, true);

    const res = await createMilestone(cookie, createBody(ms, archivedArea));
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('conflict.parent_archived');
  });

  it('create: omitted analytics_area_id leaves the column null; a valid one is stored', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA MS');
    const cookie = await seedScopedAdmin(ms);
    const area = await seedArea(ms);

    const omitted = await createMilestone(cookie, createBody(ms));
    expect(omitted.statusCode).toBe(201);
    expect(omitted.json<{ analytics_area_id: string | null }>().analytics_area_id).toBeNull();

    const withArea = await createMilestone(cookie, createBody(ms, area));
    expect(withArea.statusCode).toBe(201);
    expect(withArea.json<{ analytics_area_id: string | null }>().analytics_area_id).toBe(area);
  });

  it('patch: the same three rejections leave the row unchanged', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA MS');
    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const cookie = await seedScopedAdmin(ms);
    const foreignArea = await seedArea(otherMs);
    const archivedArea = await seedArea(ms, true);

    const created = await createMilestone(cookie, createBody(ms));
    expect(created.statusCode).toBe(201);
    const before = created.json<{
      id: string;
      analytics_area_id: string | null;
      updated_at: string;
    }>();

    const cases: Array<[string, number, string]> = [
      [randomUUID(), 404, 'not_found.record'],
      [foreignArea, 422, 'validation.failed'],
      [archivedArea, 409, 'conflict.parent_archived'],
    ];
    for (const [areaId, expectedStatus, expectedCode] of cases) {
      const res = await patchMilestone(
        cookie,
        before.id,
        { analytics_area_id: areaId },
        before.updated_at,
      );
      expect(res.statusCode).toBe(expectedStatus);
      expect(res.json<{ code: string }>().code).toBe(expectedCode);
      if (areaId === foreignArea) {
        expect(res.json()).toMatchObject({
          detail: { fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }] },
        });
      }
    }

    const after = await getMilestone(cookie, before.id);
    expect(after.json<{ analytics_area_id: string | null; updated_at: string }>()).toMatchObject({
      analytics_area_id: null,
      updated_at: before.updated_at,
    });
  });

  it('patch: null clears the column; a valid area is stored', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA MS');
    const cookie = await seedScopedAdmin(ms);
    const area = await seedArea(ms);

    const created = await createMilestone(cookie, createBody(ms, area));
    expect(created.statusCode).toBe(201);
    const row = created.json<{ id: string; updated_at: string }>();

    const cleared = await patchMilestone(
      cookie,
      row.id,
      { analytics_area_id: null },
      row.updated_at,
    );
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json<{ analytics_area_id: string | null }>().analytics_area_id).toBeNull();

    const second = cleared.json<{ id: string; updated_at: string }>();
    const set = await patchMilestone(
      cookie,
      second.id,
      { analytics_area_id: area },
      second.updated_at,
    );
    expect(set.statusCode).toBe(200);
    expect(set.json<{ analytics_area_id: string | null }>().analytics_area_id).toBe(area);
  });
});
