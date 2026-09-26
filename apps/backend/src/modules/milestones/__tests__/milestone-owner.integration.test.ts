// #514 A7 — owner_actor_id must be a workspace actor, elevated, holding
// finding.manage on the Milestone's Managed System (requirement 3). The
// omitted-owner-is-creator case is A4's; not duplicated here.
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

const SLUG_PREFIX = 'it-milestone-owner';

describe.skipIf(!runIntegration)('milestone owner rule (#514 A7)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  let userActorId: string;
  let otherWorkspaceId: string;
  /** Developer whose finding.manage covers only the caller's MS. */
  let scopedDev: { id: string; cookie: string; msId: string };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id from core.actors
        where workspace_id = $1 and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    userActorId = actors.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !userActorId) throw new Error('seed actors not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Owner MS');
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'finding.manage', msId, adminActorId);
    scopedDev = { id: dev.id, cookie: await loginAs(app, dev.externalId), msId };
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
      await migrateHandle.pool.query('delete from core.actors where workspace_id = $1', [
        otherWorkspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.workspaces where id = $1', [
        otherWorkspaceId,
      ]);
      otherWorkspaceId = '';
    }
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function foreignWorkspaceActorId(): Promise<string> {
    otherWorkspaceId = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      otherWorkspaceId,
      `Owner foreign ws ${SLUG_PREFIX}`,
    ]);
    const row = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member') returning id`,
      [
        otherWorkspaceId,
        uid(`${SLUG_PREFIX}-foreign-dev`),
        `foreign-${SLUG_PREFIX}@local`,
        'Foreign dev',
      ],
    );
    return row.rows[0]?.id ?? '';
  }

  async function unscopedDeveloperId(): Promise<string> {
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-nodev`));
    return dev.id;
  }

  async function differentlyScopedDeveloperId(msId: string): Promise<string> {
    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-otherdev`));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'finding.manage', otherMs, adminActorId);
    expect(otherMs).not.toBe(msId);
    return dev.id;
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

  const createBody = (msId: string, ownerActorId?: string): Record<string, unknown> => ({
    title: 'Owner rule milestone',
    why: 'Why',
    primary_managed_system_id: msId,
    ...(ownerActorId !== undefined ? { owner_actor_id: ownerActorId } : {}),
    start_date: '2026-10-01',
    target_date: '2026-12-31',
  });

  async function milestoneCount(msId: string): Promise<number> {
    const rows = await dbHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from task.milestones
        where workspace_id = $1 and primary_managed_system_id = $2`,
      [WORKSPACE_ID, msId],
    );
    return rows.rows[0]?.count ?? 0;
  }

  it('create: unknown or other-workspace owner is not_found.record and writes no row', async () => {
    const foreignId = await foreignWorkspaceActorId();
    for (const ownerActorId of [randomUUID(), foreignId]) {
      const res = await createMilestone(scopedDev.cookie, createBody(scopedDev.msId, ownerActorId));
      expect(res.statusCode).toBe(404);
      expect(res.json<{ code: string }>().code).toBe('not_found.record');
    }
    expect(await milestoneCount(scopedDev.msId)).toBe(0);
  });

  it('create: a User owner is validation.failed with no row', async () => {
    const res = await createMilestone(scopedDev.cookie, createBody(scopedDev.msId, userActorId));
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
    expect(await milestoneCount(scopedDev.msId)).toBe(0);
  });

  it('create: a Developer without finding.manage on this Managed System is validation.failed', async () => {
    const unscoped = await unscopedDeveloperId();
    const res = await createMilestone(scopedDev.cookie, createBody(scopedDev.msId, unscoped));
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
    expect(await milestoneCount(scopedDev.msId)).toBe(0);
  });

  it('create: a Developer with finding.manage on a different Managed System is validation.failed', async () => {
    const differentlyScoped = await differentlyScopedDeveloperId(scopedDev.msId);
    const res = await createMilestone(
      scopedDev.cookie,
      createBody(scopedDev.msId, differentlyScoped),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
    expect(await milestoneCount(scopedDev.msId)).toBe(0);
  });

  it('create: an Admin owner is accepted (admin bypass inside checkFindingManage)', async () => {
    const res = await createMilestone(scopedDev.cookie, createBody(scopedDev.msId, adminActorId));
    expect(res.statusCode).toBe(201);
    expect(res.json<{ owner_actor_id: string }>().owner_actor_id).toBe(adminActorId);
  });

  it('create: a Developer with finding.manage on this Managed System is accepted', async () => {
    const res = await createMilestone(scopedDev.cookie, createBody(scopedDev.msId, scopedDev.id));
    expect(res.statusCode).toBe(201);
    expect(res.json<{ owner_actor_id: string }>().owner_actor_id).toBe(scopedDev.id);
  });

  it('patch: the same five outcomes; a rejected PATCH leaves owner_actor_id and updated_at unchanged', async () => {
    const created = await createMilestone(scopedDev.cookie, createBody(scopedDev.msId));
    expect(created.statusCode).toBe(201);
    const before = created.json<{
      id: string;
      owner_actor_id: string;
      updated_at: string;
    }>();
    expect(before.owner_actor_id).toBe(scopedDev.id);

    const foreignId = await foreignWorkspaceActorId();
    const unscoped = await unscopedDeveloperId();
    const differentlyScoped = await differentlyScopedDeveloperId(scopedDev.msId);

    const rejections: Array<[string, number, string]> = [
      [randomUUID(), 404, 'not_found.record'],
      [foreignId, 404, 'not_found.record'],
      [userActorId, 400, 'validation.failed'],
      [unscoped, 400, 'validation.failed'],
      [differentlyScoped, 400, 'validation.failed'],
    ];
    for (const [ownerActorId, expectedStatus, expectedCode] of rejections) {
      const res = await patchMilestone(
        scopedDev.cookie,
        before.id,
        { owner_actor_id: ownerActorId },
        before.updated_at,
      );
      expect(res.statusCode).toBe(expectedStatus);
      expect(res.json<{ code: string }>().code).toBe(expectedCode);
    }

    const afterRejections = await getMilestone(scopedDev.cookie, before.id);
    expect(afterRejections.json<{ owner_actor_id: string; updated_at: string }>()).toMatchObject({
      owner_actor_id: scopedDev.id,
      updated_at: before.updated_at,
    });

    const adminPatch = await patchMilestone(
      scopedDev.cookie,
      before.id,
      { owner_actor_id: adminActorId },
      before.updated_at,
    );
    expect(adminPatch.statusCode).toBe(200);
    expect(adminPatch.json<{ owner_actor_id: string }>().owner_actor_id).toBe(adminActorId);

    const nextRow = adminPatch.json<{ id: string; updated_at: string }>();
    const devPatch = await patchMilestone(
      scopedDev.cookie,
      nextRow.id,
      { owner_actor_id: scopedDev.id },
      nextRow.updated_at,
    );
    expect(devPatch.statusCode).toBe(200);
    expect(devPatch.json<{ owner_actor_id: string }>().owner_actor_id).toBe(scopedDev.id);
  });
});
