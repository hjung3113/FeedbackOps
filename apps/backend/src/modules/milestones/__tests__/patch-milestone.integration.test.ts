// #514 A8 — PATCH /milestones/:id: Managed System immutability, If-Match
// optimistic concurrency, milestone_updated audit.
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

const SLUG_PREFIX = 'it-milestone-patch';

describe.skipIf(!runIntegration)('milestone patch (#514 A8)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');

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
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedScopedDeveloper(msId: string): Promise<string> {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'finding.manage', msId, adminActorId);
    return loginAs(app, actor.externalId);
  }

  async function seedMilestone(msId: string): Promise<{
    id: string;
    updated_at: string;
    title: string;
    primary_managed_system_id: string;
  }> {
    const res = await app.inject({
      method: 'POST',
      url: '/milestones',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        title: 'Patchable milestone',
        why: 'Original why',
        primary_managed_system_id: msId,
        start_date: '2026-10-01',
        target_date: '2026-12-31',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{
      id: string;
      updated_at: string;
      title: string;
      primary_managed_system_id: string;
    }>();
  }

  function patchMilestone(
    cookie: string,
    milestoneId: string,
    payload: Record<string, unknown>,
    opts: { idempotencyKey?: string; ifMatch?: string; omitIfMatch?: boolean } = {},
  ) {
    const headers: Record<string, string> = {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
      'idempotency-key': opts.idempotencyKey ?? randomUUID(),
    };
    if (!opts.omitIfMatch) headers['if-match'] = opts.ifMatch ?? '1970-01-01T00:00:00.000Z';
    return app.inject({
      method: 'PATCH',
      url: `/milestones/${milestoneId}`,
      headers,
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

  async function currentIfMatch(devCookie: string, id: string): Promise<string> {
    const res = await getMilestone(devCookie, id);
    expect(res.statusCode).toBe(200);
    return res.json<{ updated_at: string }>().updated_at;
  }

  it('patch: primary_managed_system_id is rejected and the row keeps its Managed System, title, and updated_at', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);
    const ifMatch = await currentIfMatch(devCookie, milestone.id);

    const res = await patchMilestone(
      devCookie,
      milestone.id,
      {
        title: 'Should not land',
        primary_managed_system_id: otherMs,
      },
      { ifMatch },
    );
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');

    const after = await getMilestone(devCookie, milestone.id);
    const body = after.json<{
      primary_managed_system_id: string;
      title: string;
      updated_at: string;
    }>();
    expect(body.primary_managed_system_id).toBe(ms);
    expect(body.title).toBe('Patchable milestone');
    expect(body.updated_at).toBe(ifMatch);
  });

  it('patch: managed_system_id is rejected the same way', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);
    const ifMatch = await currentIfMatch(devCookie, milestone.id);

    const res = await patchMilestone(
      devCookie,
      milestone.id,
      { managed_system_id: otherMs },
      { ifMatch },
    );
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');

    const after = await getMilestone(devCookie, milestone.id);
    const body = after.json<{
      primary_managed_system_id: string;
      title: string;
      updated_at: string;
    }>();
    expect(body.primary_managed_system_id).toBe(ms);
    expect(body.title).toBe('Patchable milestone');
    expect(body.updated_at).toBe(ifMatch);
  });

  it('patch: a status-only body is validation.failed and the row is unchanged (A8 guard until A-status)', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);
    const ifMatch = await currentIfMatch(devCookie, milestone.id);

    const res = await patchMilestone(devCookie, milestone.id, { status: 'released' }, { ifMatch });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');

    const after = await getMilestone(devCookie, milestone.id);
    expect(after.json<{ status: string; updated_at: string }>().status).toBe('planning');
    expect(after.json<{ updated_at: string }>().updated_at).toBe(ifMatch);
  });

  it('patch: empty body is rejected', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);
    const ifMatch = await currentIfMatch(devCookie, milestone.id);

    const res = await patchMilestone(devCookie, milestone.id, {}, { ifMatch });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('patch: title change returns 200, bumps updated_at, and audits milestone_updated without a status pair', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);
    const ifMatch = await currentIfMatch(devCookie, milestone.id);

    const res = await patchMilestone(
      devCookie,
      milestone.id,
      { title: 'Renamed milestone', why: 'Rewritten why' },
      { ifMatch },
    );
    expect(res.statusCode).toBe(200);
    const body = res.json<{ title: string; why: string; updated_at: string; status: string }>();
    expect(body.title).toBe('Renamed milestone');
    expect(body.why).toBe('Rewritten why');
    expect(body.status).toBe('planning');
    expect(body.updated_at).not.toBe(ifMatch);

    const audits = await dbHandle.pool.query<{
      event_type: string;
      detail: Record<string, unknown>;
    }>(
      `select event_type, detail
         from core.audit_log
        where workspace_id = $1 and subject_id = $2 and event_type = 'milestone_updated'`,
      [WORKSPACE_ID, milestone.id],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]?.detail).toMatchObject({ fields: ['title', 'why'] });
    expect(audits.rows[0]?.detail.from_status).toBeUndefined();
    expect(audits.rows[0]?.detail.to_status).toBeUndefined();
  });

  it('patch: stale If-Match is conflict.stale_write with detail.current_updated_at and no write', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);
    const ifMatch = await currentIfMatch(devCookie, milestone.id);

    const res = await patchMilestone(
      devCookie,
      milestone.id,
      { title: 'Stale write' },
      { ifMatch: '2000-01-01T00:00:00.000Z' },
    );
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      code: 'conflict.stale_write',
      detail: { current_updated_at: ifMatch },
    });

    const after = await getMilestone(devCookie, milestone.id);
    const body = after.json<{ title: string; updated_at: string }>();
    expect(body.title).toBe('Patchable milestone');
    expect(body.updated_at).toBe(ifMatch);
  });

  it('patch: missing If-Match fails the way PATCH /tasks/:id fails', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);

    const res = await patchMilestone(
      devCookie,
      milestone.id,
      { title: 'No If-Match' },
      {
        omitIfMatch: true,
      },
    );
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('patch: Idempotency-Key is required', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Patch MS');
    const devCookie = await seedScopedDeveloper(ms);
    const milestone = await seedMilestone(ms);

    const res = await patchMilestone(
      devCookie,
      milestone.id,
      { title: 'No key' },
      { idempotencyKey: '' },
    );
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });
});
