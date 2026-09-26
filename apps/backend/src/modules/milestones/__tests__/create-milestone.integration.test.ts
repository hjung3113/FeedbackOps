// #514 A4 — Milestone create, happy path only.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor
// runs this outside the sandbox after applying migration 0049.

import { randomUUID } from 'node:crypto';

import { milestoneCreatedDetailSchema } from '@fops/shared';
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

const SLUG_PREFIX = 'it-milestone-create';

describe.skipIf(!runIntegration)('milestone create (#514 A4)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id = 'mock-admin-1'`,
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
        where workspace_id = $1
          and event_type in ('milestone_created', 'milestone_updated')`,
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
      `delete from core.idempotency_keys
        where actor_id in (
          select id from core.actors
           where workspace_id = $1
             and external_id like 'mock-dev-read-%'
        )`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  /** Developer with finding.manage on one Managed System. */
  async function seedScopedDeveloper(msId: string): Promise<string> {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'finding.manage', msId, adminActorId);
    return loginAs(app, actor.externalId);
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

  const validBody = (msId: string): Record<string, unknown> => ({
    title: 'Checkout reliability milestone',
    why: 'Reporters keep hitting the same payment failures',
    primary_managed_system_id: msId,
    start_date: '2026-10-01',
    target_date: '2026-12-31',
  });

  it('create: scoped developer gets 201, MLS- display id, planning default, creator owner', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Milestone MS');
    const devCookie = await seedScopedDeveloper(msId);

    const res = await createMilestone(devCookie, validBody(msId));
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      id: string;
      display_id: string;
      status: string;
      owner_actor_id: string;
      primary_managed_system_id: string;
      title: string;
    }>();
    expect(body.display_id).toMatch(/^MLS-/);
    expect(body.status).toBe('planning');
    expect(body.primary_managed_system_id).toBe(msId);
    expect(body.title).toBe('Checkout reliability milestone');

    const actors = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors
        where workspace_id = $1 and external_id like $2`,
      [WORKSPACE_ID, `mock-dev-read-${SLUG_PREFIX}%`],
    );
    expect(actors.rows.map((row) => row.id)).toContain(body.owner_actor_id);

    const row = await dbHandle.pool.query<{ status: string }>(
      'select status from task.milestones where id = $1',
      [body.id],
    );
    expect(row.rows[0]?.status).toBe('planning');

    const audits = await dbHandle.pool.query<{ event_type: string; detail: unknown }>(
      `select event_type, detail
         from core.audit_log
        where workspace_id = $1 and subject_id = $2 and event_type = 'milestone_created'`,
      [WORKSPACE_ID, body.id],
    );
    expect(audits.rows).toHaveLength(1);
    expect(() => milestoneCreatedDetailSchema.parse(audits.rows[0]?.detail)).not.toThrow();
  });

  it('create: repeating the same Idempotency-Key and body returns the same id without a second display id', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Milestone MS');
    const devCookie = await seedScopedDeveloper(msId);
    const key = randomUUID();

    const first = await createMilestone(devCookie, validBody(msId), key);
    expect(first.statusCode).toBe(201);
    const second = await createMilestone(devCookie, validBody(msId), key);
    expect(second.statusCode).toBe(201);
    expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);

    const rows = await dbHandle.pool.query<{ display_id: string }>(
      'select display_id from task.milestones where id = $1',
      [first.json<{ id: string }>().id],
    );
    expect(rows.rows).toHaveLength(1);

    const created = await dbHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from task.milestones
        where workspace_id = $1 and display_id like 'MLS-%'`,
      [WORKSPACE_ID],
    );
    expect(created.rows[0]?.count).toBe(1);
  });

  it('create: missing Idempotency-Key is rejected like task mutations', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Milestone MS');
    const devCookie = await seedScopedDeveloper(msId);

    const res = await app.inject({
      method: 'POST',
      url: '/milestones',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${devCookie}`,
        'content-type': 'application/json',
      },
      payload: validBody(msId),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');

    const rows = await dbHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from task.milestones
        where workspace_id = $1 and primary_managed_system_id = $2`,
      [WORKSPACE_ID, msId],
    );
    expect(rows.rows[0]?.count).toBe(0);
  });

  it('create: a body that includes status is validation.failed and writes no row (A4 guard until A-status)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Milestone MS');
    const devCookie = await seedScopedDeveloper(msId);

    const res = await createMilestone(devCookie, { ...validBody(msId), status: 'planning' });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');

    const rows = await dbHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from task.milestones
        where workspace_id = $1 and primary_managed_system_id = $2`,
      [WORKSPACE_ID, msId],
    );
    expect(rows.rows[0]?.count).toBe(0);
  });
});
