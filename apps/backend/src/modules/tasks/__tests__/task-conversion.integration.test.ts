// Task conversion and link-existing flow (#134).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox after applying migration 0025.

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
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-convert';

describe.skipIf(!runIntegration)('task conversion and link-existing (#134)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminActorId: string;
  let userActorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    userActorId = actors.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !userActorId) throw new Error('seed actors not found');
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
          and event_type in (
            'task_created_from_request',
            'task_linked_to_request',
            'task_request_approved',
            'entity_link.created'
          )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
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
      `delete from task_request.task_requests
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from finding.findings
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id in (
            select id from core.actors
             where workspace_id = $1
               and external_id like 'mock-dev-read-%'
          )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys
        where actor_id in (
          select id from core.actors
           where workspace_id = $1
             and (
               external_id in ('mock-admin-1', 'mock-user-1')
               or external_id like 'mock-dev-read-%'
             )
        )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedFinding(msId: string): Promise<string> {
    const res = await migrateHandle.pool.query<{ id: string }>(
      `insert into finding.findings (
          workspace_id, display_id, title, summary, primary_managed_system_id,
          source_type, source_id, evidence_count, severity, confidence, status, created_by
        )
       values (
          $1, core.next_display_id($1::uuid, 'finding'), $2, $3, $4,
          'voc', gen_random_uuid(), 0, 'medium', 'medium', 'active', $5
        )
       returning id`,
      [WORKSPACE_ID, 'Seed finding', 'Finding source summary', msId, adminActorId],
    );
    const id = res.rows[0]?.id;
    if (!id) throw new Error('seedFinding failed');
    return id;
  }

  async function seedApprovedTaskRequest(
    input: {
      msId?: string;
      status?: 'pending_review' | 'approved' | 'rejected' | 'needs_more_evidence' | 'converted';
      requesterActorId?: string;
    } = {},
  ): Promise<{ id: string; msId: string; findingId: string; findingLinkId: string }> {
    const msId =
      input.msId ??
      (await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Task Convert MS'));
    const findingId = await seedFinding(msId);
    const request = await migrateHandle.pool.query<{ id: string }>(
      `insert into task_request.task_requests (
          workspace_id, display_id, source_type, source_id, primary_managed_system_id,
          evidence_summary, requested_outcome, requester_actor_id, status,
          reviewer_actor_id, decision_reason, decided_at
        )
       values (
          $1, core.next_display_id($1::uuid, 'task_request'), 'finding', $2, $3,
          'Evidence summary', 'Stabilize export pipeline', $4, $5,
          $6, 'Approved in seed', now()
        )
       returning id`,
      [
        WORKSPACE_ID,
        findingId,
        msId,
        input.requesterActorId ?? userActorId,
        input.status ?? 'approved',
        adminActorId,
      ],
    );
    const id = request.rows[0]?.id;
    if (!id) throw new Error('seedApprovedTaskRequest failed');
    const link = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, 'finding', $2, 'task_request', $3, 'requested_task',
               'internal_only', 'active', $4, $5)
       returning id`,
      [WORKSPACE_ID, findingId, id, msId, adminActorId],
    );
    const findingLinkId = link.rows[0]?.id;
    if (!findingLinkId) throw new Error('seed finding link failed');
    return { id, msId, findingId, findingLinkId };
  }

  async function seedTask(msId: string, title = 'Existing scoped task'): Promise<string> {
    const row = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title,
      createdBy: adminActorId,
    });
    return row.id;
  }

  function convert(
    cookie: string,
    taskRequestId: string,
    payload: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/task-requests/${taskRequestId}/convert`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
  }

  function linkTask(
    cookie: string,
    taskRequestId: string,
    taskId: string,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/task-requests/${taskRequestId}/link-task`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: { task_id: taskId },
    });
  }

  function listTasks(cookie: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/tasks${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('convert: approved request creates backlog task, marks converted, preserves finding link, and audits separately', async () => {
    const request = await seedApprovedTaskRequest();

    const res = await convert(adminCookie, request.id, {
      title: 'Stabilize export pipeline task',
      priority: 'high',
      assignee_actor_id: userActorId,
      due_date: '2026-08-15',
      milestone_id: null,
      analytics_area_id: null,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; status: string; source_task_request_id: string }>();
    expect(body).toMatchObject({
      title: 'Stabilize export pipeline task',
      status: 'backlog',
      priority: 'high',
      assignee_actor_id: userActorId,
      due_date: '2026-08-15',
      primary_managed_system_id: request.msId,
      source_task_request_id: request.id,
    });

    const taskRequest = await dbHandle.pool.query<{ status: string }>(
      'select status from task_request.task_requests where id = $1',
      [request.id],
    );
    expect(taskRequest.rows[0]?.status).toBe('converted');

    const links = await dbHandle.pool.query<{ relation_type: string; id: string }>(
      `select id, relation_type
         from core.entity_links
        where workspace_id = $1
          and target_type = 'task'
          and target_id = $2
          and status = 'active'
        order by relation_type`,
      [WORKSPACE_ID, body.id],
    );
    expect(links.rows.map((row) => row.relation_type)).toEqual(['converted_to', 'requested_task']);

    const audits = await dbHandle.pool.query<{
      event_type: string;
      detail: Record<string, unknown>;
    }>(
      `select event_type, detail
         from core.audit_log
        where workspace_id = $1
          and subject_id in ($2, $3)
          and event_type in ('task_created_from_request', 'task_request_approved')
        order by event_type`,
      [WORKSPACE_ID, body.id, request.id],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual(['task_created_from_request']);
    expect(audits.rows[0]?.detail).toMatchObject({
      task_id: body.id,
      source_task_request_id: request.id,
      primary_managed_system_id: request.msId,
    });
  });

  it.each(['pending_review', 'rejected'] as const)(
    'convert rejects %s task request with not_approved validation code',
    async (status) => {
      const request = await seedApprovedTaskRequest({ status });

      const res = await convert(adminCookie, request.id, {
        title: 'Should not convert',
        priority: 'medium',
      });

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({
        code: 'validation.failed',
        detail: { fields: [{ path: ['status'], code: 'not_approved' }] },
      });
    },
  );

  it('convert idempotent replay does not create a duplicate task', async () => {
    const request = await seedApprovedTaskRequest();
    const key = randomUUID();
    const payload = { title: 'Repeatable conversion', priority: 'urgent' };

    const first = await convert(adminCookie, request.id, payload, key);
    const second = await convert(adminCookie, request.id, payload, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from task.tasks
        where workspace_id = $1
          and source_task_request_id = $2`,
      [WORKSPACE_ID, request.id],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it('link-task links an existing in-scope task, marks converted, and audits the link decision', async () => {
    const request = await seedApprovedTaskRequest();
    const taskId = await seedTask(request.msId);

    const res = await linkTask(adminCookie, request.id, taskId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: taskId, source_task_request_id: null });

    const taskRequest = await dbHandle.pool.query<{ status: string }>(
      'select status from task_request.task_requests where id = $1',
      [request.id],
    );
    expect(taskRequest.rows[0]?.status).toBe('converted');

    const link = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from core.entity_links
        where workspace_id = $1
          and source_type = 'task_request'
          and source_id = $2
          and target_type = 'task'
          and target_id = $3
          and relation_type = 'converted_to'
          and status = 'active'`,
      [WORKSPACE_ID, request.id, taskId],
    );
    expect(link.rows[0]?.n).toBe(1);

    const audit = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = 'task_linked_to_request'
          and subject_id = $2`,
      [WORKSPACE_ID, taskId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      task_id: taskId,
      task_request_id: request.id,
    });
  });

  it('link-task denies an existing task from another Managed System', async () => {
    const request = await seedApprovedTaskRequest();
    const otherMs = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Other Task MS',
    );
    const taskId = await seedTask(otherMs, 'Out of scope task');

    const res = await linkTask(adminCookie, request.id, taskId);

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('authority: developer needs finding.manage, admin bypass is allowed, user is denied', async () => {
    const request = await seedApprovedTaskRequest();
    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-auth'),
    );
    const devCookie = await loginAs(app, externalId);

    const deniedDev = await convert(devCookie, request.id, {
      title: 'Developer denied',
      priority: 'medium',
    });
    expect(deniedDev.statusCode).toBe(403);

    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.manage',
      request.msId,
      adminActorId,
    );
    const allowedDev = await convert(devCookie, request.id, {
      title: 'Developer allowed',
      priority: 'medium',
    });
    expect(allowedDev.statusCode).toBe(201);

    const userRequest = await seedApprovedTaskRequest();
    const deniedUser = await convert(userCookie, userRequest.id, {
      title: 'User denied',
      priority: 'medium',
    });
    expect(deniedUser.statusCode).toBe(403);

    const adminRequest = await seedApprovedTaskRequest();
    const allowedAdmin = await convert(adminCookie, adminRequest.id, {
      title: 'Admin allowed',
      priority: 'medium',
    });
    expect(allowedAdmin.statusCode).toBe(201);
  });

  it('GET /tasks filters by role scope, status, and assignee', async () => {
    const visibleMs = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Visible Task MS',
    );
    const hiddenMs = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Hidden Task MS',
    );
    const visibleTask = await seedTask(visibleMs, 'Visible task');
    const assignedToOtherTask = await seedTask(visibleMs, 'Assigned to other task');
    const hiddenTask = await seedTask(hiddenMs, 'Hidden task');
    await migrateHandle.pool.query(
      `update task.tasks set assignee_actor_id = $1, status = 'todo' where id = $2`,
      [adminActorId, visibleTask],
    );
    await migrateHandle.pool.query(
      `update task.tasks set assignee_actor_id = $1, status = 'todo' where id = $2`,
      [userActorId, assignedToOtherTask],
    );

    const adminList = await listTasks(adminCookie, '?status=todo&assignee=me');
    expect(adminList.statusCode).toBe(200);
    const adminIds = adminList
      .json<{ items: Array<{ id: string }> }>()
      .items.map((item) => item.id);
    expect(adminIds).toContain(visibleTask);
    expect(adminIds).not.toContain(assignedToOtherTask);
    expect(adminIds).not.toContain(hiddenTask);

    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-list'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.manage', visibleMs, adminActorId);
    const devCookie = await loginAs(app, externalId);
    const devList = await listTasks(devCookie);
    expect(devList.statusCode).toBe(200);
    const devIds = devList.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id);
    expect(devIds).toContain(visibleTask);
    expect(devIds).not.toContain(hiddenTask);

    const denied = await listTasks(userCookie);
    expect(denied.statusCode).toBe(403);
  });
});
