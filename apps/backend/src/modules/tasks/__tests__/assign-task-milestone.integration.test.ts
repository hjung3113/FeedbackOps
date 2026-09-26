// #514 B1b — POST /tasks/:id/milestone (assign and unassign).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor
// runs this suite against live Postgres outside the sandbox.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-milestone-assign';

describe.skipIf(!runIntegration)('POST /tasks/:id/milestone (#514 B1b)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let foreignMilestoneId: string | null = null;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');

    const actors = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors
        where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows[0]?.id ?? '';
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
    if (foreignMilestoneId) {
      // fops_app has no DELETE on task.milestones: use the migrate role.
      await migrateHandle.pool.query('delete from task.milestones where id = $1', [
        foreignMilestoneId,
      ]);
      foreignMilestoneId = null;
    }
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and event_type = 'task_milestone_assigned'
          and subject_id in (
            select task.id
              from task.tasks task
              join core.managed_systems managed_system
                on managed_system.id = task.primary_managed_system_id
             where task.workspace_id = $1
               and managed_system.workspace_id = $1
               and managed_system.slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys
        where actor_id = (select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1')`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
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
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedManagedSystem(): Promise<string> {
    return insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Milestone assign MS');
  }

  async function seedMilestone(
    managedSystemId: string,
    status: 'planning' | 'released' = 'planning',
  ): Promise<string> {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into task.milestones (
          workspace_id, display_id, primary_managed_system_id, title, why,
          owner_actor_id, start_date, target_date
        )
       values ($1, $2, $3, 'Assign milestone', 'why', $4, '2026-10-01', '2026-12-31')
       returning id`,
      [WORKSPACE_ID, `MLS-${randomUUID().slice(0, 8)}`, managedSystemId, adminActorId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('insert milestone failed');
    if (status !== 'planning') {
      await migrateHandle.pool.query('update task.milestones set status = $2 where id = $1', [
        id,
        status,
      ]);
    }
    return id;
  }

  async function seedTask(managedSystemId: string, milestoneId: string | null = null) {
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: managedSystemId,
      title: 'Milestone assign task',
      milestoneId,
      createdBy: adminActorId,
    });
    const row = await dbHandle.pool.query<{ updated_at: Date }>(
      'select updated_at from task.tasks where id = $1',
      [task.id],
    );
    const updatedAt = row.rows[0]?.updated_at?.toISOString();
    if (!updatedAt) throw new Error('seed task updated_at missing');
    return { ...task, updatedAt };
  }

  async function taskRow(
    taskId: string,
  ): Promise<{ milestone_id: string | null; updated_at: Date }> {
    const row = await dbHandle.pool.query<{
      milestone_id: string | null;
      updated_at: Date;
    }>('select milestone_id, updated_at from task.tasks where id = $1', [taskId]);
    const found = row.rows[0];
    if (!found) throw new Error('task row missing');
    return found;
  }

  async function milestoneAuditDetails(taskId: string): Promise<unknown[]> {
    const rows = await dbHandle.pool.query<{ detail: unknown }>(
      `select detail from core.audit_log
        where workspace_id = $1 and event_type = 'task_milestone_assigned' and subject_id = $2`,
      [WORKSPACE_ID, taskId],
    );
    return rows.rows.map((row) => row.detail);
  }

  function assignTask(
    cookie: string,
    taskId: string,
    body: Record<string, unknown>,
    headers: { idempotencyKey?: string; ifMatch?: string } = {},
  ) {
    const requestHeaders: Record<string, string> = {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
    };
    if (headers.idempotencyKey !== undefined)
      requestHeaders['idempotency-key'] = headers.idempotencyKey;
    if (headers.ifMatch !== undefined) requestHeaders['if-match'] = headers.ifMatch;
    return app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/milestone`,
      headers: requestHeaders,
      payload: body,
    });
  }

  it('assigns an in-scope planning Milestone: response is the Task, only milestone_id changes, audit carries from/to', async () => {
    const msId = await seedManagedSystem();
    const milestoneId = await seedMilestone(msId, 'planning');
    const task = await seedTask(msId);

    const before = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(before.statusCode).toBe(200);

    const res = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: milestoneId },
      { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    const beforeBody = before.json<Record<string, unknown>>();
    expect(body.milestone_id).toBe(milestoneId);

    // The command writes no Task column except milestone_id (and updated_at).
    const strip = (dto: Record<string, unknown>) => {
      const { milestone_id: _m, updated_at: _u, source: _s, ...rest } = dto;
      return rest;
    };
    expect(strip(body)).toEqual(strip(beforeBody));
    expect(body.updated_at).not.toBe(task.updatedAt);

    const row = await taskRow(task.id);
    expect(row.milestone_id).toBe(milestoneId);

    const details = await milestoneAuditDetails(task.id);
    expect(details).toEqual([{ from_milestone_id: null, to_milestone_id: milestoneId }]);
  });

  it('assigning null clears the stored milestone', async () => {
    const msId = await seedManagedSystem();
    const milestoneId = await seedMilestone(msId, 'planning');
    const task = await seedTask(msId, milestoneId);

    const res = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: null },
      { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
    );

    expect(res.statusCode).toBe(200);
    expect(res.json<{ milestone_id: string | null }>().milestone_id).toBeNull();
    const row = await taskRow(task.id);
    expect(row.milestone_id).toBeNull();

    const details = await milestoneAuditDetails(task.id);
    expect(details).toEqual([{ from_milestone_id: milestoneId, to_milestone_id: null }]);
  });

  it('rejects an unknown Milestone with not_found.record and leaves the row unchanged', async () => {
    const msId = await seedManagedSystem();
    const task = await seedTask(msId);

    const res = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: randomUUID() },
      { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
    );

    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');
    const row = await taskRow(task.id);
    expect(row.milestone_id).toBeNull();
    expect(row.updated_at.toISOString()).toBe(task.updatedAt);
    expect(await milestoneAuditDetails(task.id)).toEqual([]);
  });

  it('rejects an other-workspace Milestone with not_found.record and leaves the row unchanged', async () => {
    const msId = await seedManagedSystem();
    const task = await seedTask(msId);

    const otherWs = await dbHandle.pool.query<{ id: string }>(
      'insert into core.workspaces (name) values ($1) returning id',
      [`Other workspace ${SLUG_PREFIX}`],
    );
    const otherWorkspaceId = otherWs.rows[0]?.id;
    if (!otherWorkspaceId) throw new Error('foreign workspace insert failed');
    const foreignMs = await dbHandle.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [otherWorkspaceId, uid(`${SLUG_PREFIX}-fms`), 'Foreign MS'],
    );
    const foreign = await migrateHandle.pool.query<{ id: string }>(
      `insert into task.milestones (
          workspace_id, display_id, primary_managed_system_id, title, why,
          owner_actor_id, start_date, target_date
        )
       values ($1, 'MLS-foreign', $2, 'Foreign milestone', 'why', $3, '2026-10-01', '2026-12-31')
       returning id`,
      [otherWorkspaceId, foreignMs.rows[0]?.id, adminActorId],
    );
    foreignMilestoneId = foreign.rows[0]?.id ?? null;
    if (!foreignMilestoneId) throw new Error('foreign milestone insert failed');

    const res = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: foreignMilestoneId },
      { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
    );

    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');
    const row = await taskRow(task.id);
    expect(row.milestone_id).toBeNull();
    expect(row.updated_at.toISOString()).toBe(task.updatedAt);
    expect(await milestoneAuditDetails(task.id)).toEqual([]);
  });

  it('rejects a Milestone on another Managed System with out_of_scope and leaves the row unchanged', async () => {
    const msId = await seedManagedSystem();
    const otherMsId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const milestoneId = await seedMilestone(otherMsId, 'planning');
    const task = await seedTask(msId);

    const res = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: milestoneId },
      { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['milestone_id'], code: 'out_of_scope' }] },
    });
    const row = await taskRow(task.id);
    expect(row.milestone_id).toBeNull();
    expect(row.updated_at.toISOString()).toBe(task.updatedAt);
    expect(await milestoneAuditDetails(task.id)).toEqual([]);
  });

  it('assigns a released Milestone on the Task Managed System successfully (ADR-0050)', async () => {
    // ADR-0050 Decision 5 (the answer to design §7 item 18): assigning a Task
    // does not consult Milestone status. Existence, workspace, and Managed
    // System checks stay; a released Milestone in scope is a successful
    // assign. This is the only released-status case, and it expects success.
    const msId = await seedManagedSystem();
    const milestoneId = await seedMilestone(msId, 'released');
    const task = await seedTask(msId);

    const res = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: milestoneId },
      { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
    );

    expect(res.statusCode).toBe(200);
    expect(res.json<{ milestone_id: string | null }>().milestone_id).toBe(milestoneId);
    const row = await taskRow(task.id);
    expect(row.milestone_id).toBe(milestoneId);
  });

  it('rejects a stale If-Match with conflict.stale_write and no write; requires Idempotency-Key with route identity task.milestone_assign', async () => {
    const msId = await seedManagedSystem();
    const milestoneId = await seedMilestone(msId, 'planning');
    const task = await seedTask(msId);

    const stale = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: milestoneId },
      { idempotencyKey: randomUUID(), ifMatch: '2000-01-01T00:00:00.000Z' },
    );

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: 'conflict.stale_write',
      detail: { current_updated_at: task.updatedAt },
    });
    const row = await taskRow(task.id);
    expect(row.milestone_id).toBeNull();
    expect(row.updated_at.toISOString()).toBe(task.updatedAt);
    expect(await milestoneAuditDetails(task.id)).toEqual([]);

    const noKey = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/milestone`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
        'if-match': task.updatedAt,
      },
      payload: { milestone_id: milestoneId },
    });
    expect(noKey.statusCode).toBe(422);
    expect(noKey.json<{ code: string }>().code).toBe('validation.failed');

    const key = randomUUID();
    const first = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: milestoneId },
      { idempotencyKey: key, ifMatch: task.updatedAt },
    );
    expect(first.statusCode).toBe(200);
    const replay = await assignTask(
      adminCookie,
      task.id,
      { milestone_id: milestoneId },
      { idempotencyKey: key, ifMatch: task.updatedAt },
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const stored = await dbHandle.pool.query<{ request_hash: string }>(
      'select request_hash from core.idempotency_keys where actor_id = $1 and key = $2',
      [adminActorId, key],
    );
    expect(stored.rows[0]?.request_hash).toBe(
      hashRequestBody({
        taskId: task.id,
        ifMatch: task.updatedAt,
        route: 'task.milestone_assign',
        milestone_id: milestoneId,
      }),
    );
  });

  it('keeps PATCH /tasks/:id status-only: a status body carrying milestone_id is rejected', async () => {
    const msId = await seedManagedSystem();
    const milestoneId = await seedMilestone(msId, 'planning');
    const task = await seedTask(msId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'if-match': task.updatedAt,
      },
      payload: { status: 'doing', milestone_id: milestoneId },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
    const row = await taskRow(task.id);
    expect(row.milestone_id).toBeNull();
  });
});
