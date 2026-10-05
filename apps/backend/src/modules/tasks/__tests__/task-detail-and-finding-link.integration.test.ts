// Task detail source context and Finding Link Task flow (#135).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox after applying migrations.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { taskDetailDtoSchema } from '@fops/shared';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertTaskRequestRow } from '../../../test-support/task-fixtures.js';
import { cleanupReadTestTables } from '../../../test-support/voc-fixtures.js';
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-detail';

describe.skipIf(!runIntegration)('task-detail and finding link-task (#135)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminActorId: string;

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
          and external_id = 'mock-admin-1'`,
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
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and event_type in ('finding_task_linked', 'entity_link.created')`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys
        where actor_id in (
          select id from core.actors
           where workspace_id = $1
             and (external_id = 'mock-admin-1' or external_id like 'mock-dev-detail-%')
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
               and external_id like 'mock-dev-detail-%'
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

  async function seedFinding(
    msId: string,
    title = 'Source finding',
  ): Promise<{ id: string; display_id: string }> {
    const row = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title,
      summary: 'Finding source summary',
      sourceId: randomUUID(),
      evidenceCount: 2,
      confidence: 'medium',
      status: 'active',
      createdBy: adminActorId,
    });
    return row;
  }

  async function seedTask(msId: string, input: { sourceTaskRequestId?: string | null } = {}) {
    const row = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceTaskRequestId: input.sourceTaskRequestId ?? null,
      createdBy: adminActorId,
    });
    return row.id;
  }

  async function seedConvertedTask() {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Task Detail MS');
    const finding = await seedFinding(msId, 'Export failure finding');
    const findingId = finding.id;
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceId: findingId,
      primaryManagedSystemId: msId,
      evidenceSummary: 'Evidence summary',
      requestedOutcome: 'Stabilize export',
      requesterActorId: adminActorId,
      status: 'converted',
      reviewerActorId: adminActorId,
      decisionReason: 'Seed conversion',
      decided: true,
    });
    const requestId = request.id;
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, 'finding', $2, 'task_request', $3, 'requested_task',
               'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, findingId, requestId, msId, adminActorId],
    );
    const taskId = await seedTask(msId, { sourceTaskRequestId: requestId });
    return {
      msId,
      findingId,
      findingDisplayId: finding.display_id,
      requestId,
      requestDisplayId: request.display_id,
      taskId,
    };
  }

  function getTask(cookie: string, taskId: string) {
    return app.inject({
      method: 'GET',
      url: `/tasks/${taskId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  function approveTaskRequest(cookie: string, taskRequestId: string) {
    return app.inject({
      method: 'POST',
      url: `/task-requests/${taskRequestId}/approve`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: { reason: 'Approve source Finding request' },
    });
  }

  function convertTaskRequest(cookie: string, taskRequestId: string) {
    return app.inject({
      method: 'POST',
      url: `/task-requests/${taskRequestId}/convert`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: { title: 'Converted source Finding task' },
    });
  }

  function linkFindingTask(cookie: string, findingId: string, taskId: string, key = randomUUID()) {
    return app.inject({
      method: 'POST',
      url: `/findings/${findingId}/link-task`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: { task_id: taskId },
    });
  }

  it('GET /tasks/:id task-detail returns resolved source finding for a converted task', async () => {
    const seed = await seedConvertedTask();

    const res = await getTask(adminCookie, seed.taskId);

    expect(res.statusCode).toBe(200);
    const taskDetail = taskDetailDtoSchema.parse(res.json());
    expect(res.json()).toMatchObject({
      id: seed.taskId,
      source_task_request_id: seed.requestId,
      source: {
        task_request: {
          id: seed.requestId,
          display_id: seed.requestDisplayId,
          status: 'converted',
        },
        finding: {
          id: seed.findingId,
          display_id: seed.findingDisplayId,
          title: 'Export failure finding',
          summary: 'Finding source summary',
          evidence_count: 2,
        },
      },
    });
    expect(taskDetail.source?.finding?.display_id).toBe(seed.findingDisplayId);
  });

  it("GET /tasks/:id prefers a Finding-sourced request's own source Finding", async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Task Detail MS');
    const sourceFinding = await seedFinding(msId, 'Request source Finding S');
    const genericFinding = await seedFinding(msId, 'Later generic Finding F');
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'finding',
      sourceId: sourceFinding.id,
      primaryManagedSystemId: msId,
      requesterActorId: adminActorId,
    });
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, 'finding', $2, 'task_request', $3, 'requested_task',
               'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, sourceFinding.id, request.id, msId, adminActorId],
    );

    try {
      const approved = await approveTaskRequest(adminCookie, request.id);
      expect(approved.statusCode, JSON.stringify(approved.json())).toBe(200);
      const converted = await convertTaskRequest(adminCookie, request.id);
      expect(converted.statusCode, JSON.stringify(converted.json())).toBe(201);
      const taskId = converted.json<{ id: string }>().id;

      const genericLink = await migrateHandle.pool.query(
        `insert into core.entity_links (
            workspace_id, source_type, source_id, target_type, target_id,
            relation_type, visibility, status, managed_system_id, created_by, created_at
          )
         select $1, 'finding', $2, 'task_request', $3, 'requested_task',
                'internal_only', 'active', $4, $5, own_link.created_at + interval '1 second'
           from core.entity_links own_link
          where own_link.workspace_id = $1
            and own_link.source_type = 'finding'
            and own_link.source_id = $6
            and own_link.target_type = 'task_request'
            and own_link.target_id = $3
            and own_link.relation_type = 'requested_task'
            and own_link.status = 'active'
         returning id`,
        [WORKSPACE_ID, genericFinding.id, request.id, msId, adminActorId, sourceFinding.id],
      );
      expect(genericLink.rowCount).toBe(1);

      const res = await getTask(adminCookie, taskId);

      expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
      const taskDetail = taskDetailDtoSchema.parse(res.json());
      expect(taskDetail.source?.finding?.id).toBe(sourceFinding.id);
    } finally {
      await migrateHandle.pool.query(
        `delete from core.audit_log
          where workspace_id = $1
            and (
              (event_type = 'task_request_approved' and subject_id = $2)
              or (
                event_type = 'task_created_from_request'
                and subject_id in (
                  select id from task.tasks where source_task_request_id = $2
                )
              )
            )`,
        [WORKSPACE_ID, request.id],
      );
    }
  });

  it('GET /tasks/:id task-detail returns null source for a standalone task', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Standalone MS');
    const taskId = await seedTask(msId);

    const res = await getTask(adminCookie, taskId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: taskId, source_task_request_id: null, source: null });
  });

  it('GET /tasks/:id task-detail enforces role and Managed System scope', async () => {
    const seed = await seedConvertedTask();
    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('mock-dev-detail'),
    );
    const devCookie = await loginAs(app, externalId);

    const deniedDev = await getTask(devCookie, seed.taskId);
    expect(deniedDev.statusCode).toBe(403);

    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.manage', seed.msId, adminActorId);
    const allowedDev = await getTask(devCookie, seed.taskId);
    expect(allowedDev.statusCode).toBe(200);

    const deniedUser = await getTask(userCookie, seed.taskId);
    expect(deniedUser.statusCode).toBe(403);

    const unknown = await getTask(adminCookie, randomUUID());
    expect(unknown.statusCode).toBe(404);
  });

  it('POST /findings/:id/link-task links an in-scope task and audits finding_task_linked', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Link Task MS');
    const findingId = (await seedFinding(msId)).id;
    const taskId = await seedTask(msId);

    const res = await linkFindingTask(adminCookie, findingId, taskId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: findingId, linked_task_id: taskId });

    const linked = await dbHandle.pool.query<{ linked_task_id: string | null }>(
      'select linked_task_id from finding.findings where id = $1',
      [findingId],
    );
    expect(linked.rows[0]?.linked_task_id).toBe(taskId);

    const audit = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = 'finding_task_linked'
          and subject_id = $2`,
      [WORKSPACE_ID, findingId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      finding_id: findingId,
      task_id: taskId,
      primary_managed_system_id: msId,
    });

    const link = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from core.entity_links
        where workspace_id = $1
          and source_type = 'finding'
          and source_id = $2
          and target_type = 'task'
          and target_id = $3
          and relation_type = 'requested_task'
          and status = 'active'`,
      [WORKSPACE_ID, findingId, taskId],
    );
    expect(link.rows[0]?.n).toBe(1);
  });

  it('POST /findings/:id/link-task denies a task from another Managed System', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Finding MS');
    const otherMsId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Task MS');
    const findingId = (await seedFinding(msId)).id;
    const taskId = await seedTask(otherMsId);

    const res = await linkFindingTask(adminCookie, findingId, taskId);

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('POST /findings/:id/link-task rejects already-linked findings and replays idempotently', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Replay MS');
    const findingId = (await seedFinding(msId)).id;
    const taskId = await seedTask(msId);
    const otherTaskId = await seedTask(msId);
    const key = randomUUID();

    const first = await linkFindingTask(adminCookie, findingId, taskId, key);
    const second = await linkFindingTask(adminCookie, findingId, taskId, key);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    const rejected = await linkFindingTask(adminCookie, findingId, otherTaskId);
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['linked_task_id'], code: 'already_linked' }] },
    });

    const audits = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from core.audit_log
        where workspace_id = $1
          and event_type = 'finding_task_linked'
          and subject_id = $2`,
      [WORKSPACE_ID, findingId],
    );
    expect(audits.rows[0]?.n).toBe(1);
  });
});
