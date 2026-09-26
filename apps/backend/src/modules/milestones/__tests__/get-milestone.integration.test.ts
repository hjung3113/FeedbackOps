// #514 A5 — Milestone get authorization: per-row finding.manage,
// not_found.record for other-workspace/missing ids, User denied.
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

const SLUG_PREFIX = 'it-milestone-get';

describe.skipIf(!runIntegration)('milestone get (#514 A5)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let userCookie: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id from core.actors
        where workspace_id = $1 and external_id in ('mock-admin-1', 'mock-user-1')`,
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
    if (otherWorkspaceId) {
      await migrateHandle.pool.query('delete from task.milestones where workspace_id = $1', [
        otherWorkspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.managed_systems where workspace_id = $1', [
        otherWorkspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.actors where workspace_id = $1', [
        otherWorkspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.workspaces where id = $1', [
        otherWorkspaceId,
      ]);
    }
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedMilestone(msId: string, title: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/milestones',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        title,
        why: `${title} why`,
        primary_managed_system_id: msId,
        start_date: '2026-10-01',
        target_date: '2026-12-31',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  async function seedScopedDeveloper(managedSystemIds: string[]): Promise<string> {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    for (const msId of managedSystemIds) {
      await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'finding.manage', msId, adminActorId);
    }
    return loginAs(app, actor.externalId);
  }

  function getMilestone(cookie: string, milestoneId: string) {
    return app.inject({
      method: 'GET',
      url: `/milestones/${milestoneId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('get: in-scope Milestone returns the columns; no source_finding (A9) and no progress (B1c)', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Get MS');
    const devCookie = await seedScopedDeveloper([ms]);
    const id = await seedMilestone(ms, 'Readable milestone');

    const res = await getMilestone(devCookie, id);
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: string;
      display_id: string;
      title: string;
      why: string;
      status: string;
      owner_actor_id: string;
      analytics_area_id: string | null;
      start_date: string;
      target_date: string;
      created_by: string;
      created_at: string;
      updated_at: string;
      source_finding?: unknown;
      progress?: unknown;
    }>();
    expect(body.id).toBe(id);
    expect(body.display_id).toMatch(/^MLS-/);
    expect(body.title).toBe('Readable milestone');
    expect(body.why).toBe('Readable milestone why');
    expect(body.status).toBe('planning');
    expect(body.analytics_area_id).toBeNull();
    expect(body.start_date).toBe('2026-10-01');
    expect(body.target_date).toBe('2026-12-31');
    expect(body.source_finding).toBeUndefined();
    expect(body.progress).toBeUndefined();
  });

  it('get: out-of-scope id is permission.denied, not 404', async () => {
    const msInScope = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'In scope');
    const msOther = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other');
    const otherMilestone = await seedMilestone(msOther, 'Foreign milestone');
    const devCookie = await seedScopedDeveloper([msInScope]);

    const res = await getMilestone(devCookie, otherMilestone);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('get: other-workspace Milestone is not_found.record', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Own MS');
    const devCookie = await seedScopedDeveloper([ms]);

    otherWorkspaceId = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      otherWorkspaceId,
      `Other workspace ${SLUG_PREFIX}`,
    ]);
    const foreignActor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $4, 'admin', 'internal_member')
         returning id`,
      [
        otherWorkspaceId,
        uid(`${SLUG_PREFIX}-foreign-admin`),
        `foreign-${SLUG_PREFIX}@local`,
        'Foreign admin',
      ],
    );
    const foreignMs = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
         values ($1, $2, $3) returning id`,
      [otherWorkspaceId, uid(`${SLUG_PREFIX}-fms`), 'Foreign MS'],
    );
    const foreignMilestone = await migrateHandle.pool.query<{ id: string }>(
      `insert into task.milestones (
          workspace_id, display_id, primary_managed_system_id, title, why,
          owner_actor_id, start_date, target_date, created_by
        )
       values ($1, 'MLS-foreign', $2, 'Foreign milestone', 'why', $3, '2026-10-01', '2026-12-31', $3)
       returning id`,
      [otherWorkspaceId, foreignMs.rows[0]?.id, foreignActor.rows[0]?.id],
    );

    const res = await getMilestone(devCookie, foreignMilestone.rows[0]?.id ?? randomUUID());
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');
  });

  it('get: missing id is not_found.record', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Own MS');
    const devCookie = await seedScopedDeveloper([ms]);

    const res = await getMilestone(devCookie, randomUUID());
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');
  });

  it('get: a User is denied', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'User MS');
    const id = await seedMilestone(ms, 'User-denied milestone');

    const res = await getMilestone(userCookie, id);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });
});
