// Task Request review queue + decisions (#133).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox after applying migration 0024.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { cleanupReadTestTables } from '../../../test-support/voc-fixtures.js';
import {
  createRecordingNotificationDispatcher,
  type NotificationJobPayload,
  type RecordingNotificationDispatcher,
} from '../../notifications/port.js';
import { insertTaskRequestRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-request';

describe.skipIf(!runIntegration)('task-request review queue and decisions (#133)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminActorId: string;
  let userActorId: string;
  let notifications: RecordingNotificationDispatcher;
  let failNotificationEnqueue = false;
  const notificationAttempts: NotificationJobPayload[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    notifications = createRecordingNotificationDispatcher();
    const recordNotification = notifications.enqueue.bind(notifications);
    notifications.enqueue = async (tx, payload) => {
      notificationAttempts.push(payload);
      if (failNotificationEnqueue) throw new Error('notification enqueue unavailable');
      await recordNotification(tx, payload);
    };
    app = await buildServer({
      config: loadConfig(),
      dbHandle,
      notificationDispatcher: notifications,
    });
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
    notifications.jobs.splice(0);
    notificationAttempts.length = 0;
    failNotificationEnqueue = false;
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
            'task_request_approved',
            'task_request_rejected',
            'task_request_needs_more_evidence',
            'task_request_self_approval_denied'
          )`,
      [WORKSPACE_ID],
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
      `delete from permission.permission_grants
        where workspace_id = $1
          and (
            actor_id in (
              select id from core.actors
               where workspace_id = $1
                 and (external_id like 'mock-dev-read-%' or external_id = 'mock-user-1')
            )
            or capability = 'task_request.self_approve'
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

  async function seedTaskRequest(
    input: {
      msId?: string;
      requesterActorId?: string;
      status?: 'pending_review' | 'approved' | 'rejected' | 'needs_more_evidence' | 'converted';
      title?: string;
    } = {},
  ): Promise<{ id: string; msId: string }> {
    const msId =
      input.msId ??
      (await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Task Request MS'));
    const row = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceId: randomUUID(),
      primaryManagedSystemId: msId,
      evidenceSummary: `${input.title ?? 'Seeded'} evidence summary`,
      requestedOutcome: `${input.title ?? 'Seeded'} requested outcome`,
      requesterActorId: input.requesterActorId ?? userActorId,
      status: input.status ?? 'pending_review',
    });
    return { id: row.id, msId };
  }

  function listTaskRequests(cookie: string, status?: string) {
    const query = status === undefined ? '' : `?status=${status}`;
    return app.inject({
      method: 'GET',
      url: `/task-requests${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  function decide(
    cookie: string,
    taskRequestId: string,
    action: 'approve' | 'reject' | 'request-more-evidence',
    payload: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/task-requests/${taskRequestId}/${action}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
  }

  it('list: admin sees all, developer sees manageable Managed Systems, user is denied', async () => {
    const visible = await seedTaskRequest({ title: 'Visible' });
    const hidden = await seedTaskRequest({ title: 'Hidden' });

    const adminList = await listTaskRequests(adminCookie);
    expect(adminList.statusCode).toBe(200);
    const adminIds = adminList
      .json<{ items: Array<{ id: string }> }>()
      .items.map((item) => item.id);
    expect(adminIds).toEqual(expect.arrayContaining([visible.id, hidden.id]));

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('trq'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.manage',
      visible.msId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);

    const devList = await listTaskRequests(devCookie, 'pending_review');
    expect(devList.statusCode).toBe(200);
    const devIds = devList.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id);
    expect(devIds).toContain(visible.id);
    expect(devIds).not.toContain(hidden.id);

    const denied = await listTaskRequests(userCookie);
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.denied');
  });

  it.each([
    [
      'approve',
      { reason: 'Ready for execution.' },
      'approved',
      'task_request.approved',
      'task_request_approved',
      '작업 요청이 승인되었습니다.',
    ],
    [
      'reject',
      { reason: 'Not actionable yet.' },
      'rejected',
      'task_request.rejected',
      'task_request_rejected',
      '작업 요청이 반려되었습니다.',
    ],
    [
      'request-more-evidence',
      { note: 'Please attach the source evidence.' },
      'needs_more_evidence',
      'task_request.needs_more_evidence',
      'task_request_needs_more_evidence',
      '작업 요청에 추가 근거가 필요합니다.',
    ],
  ] as const)(
    'notifies the creator after Task Request %s',
    async (action, payload, status, eventType, auditEventType, summary) => {
      const request = await seedTaskRequest();
      const response = await decide(adminCookie, request.id, action, payload);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: request.id, status });
      expect(notifications.jobs).toEqual([
        expect.objectContaining({
          workspace_id: WORKSPACE_ID,
          actor_id: userActorId,
          event_type: eventType,
          subject_type: 'task_request',
          subject_id: request.id,
          summary,
          detail: {
            task_request_id: request.id,
            primary_managed_system_id: request.msId,
          },
          correlation_id: expect.any(String),
        }),
      ]);

      const audit = await dbHandle.pool.query(
        `select 1 from core.audit_log
          where workspace_id = $1 and event_type = $2 and subject_id = $3`,
        [WORKSPACE_ID, auditEventType, request.id],
      );
      expect(audit.rowCount).toBe(1);

      if (action === 'approve') {
        const alreadyApproved = await decide(adminCookie, request.id, 'approve', {
          reason: 'Already approved.',
        });
        expect(alreadyApproved.statusCode).toBe(200);
        expect(notifications.jobs).toHaveLength(1);

        const taskTable = await dbHandle.pool.query<{ exists: boolean }>(
          `select to_regclass('task.tasks') is not null as exists`,
        );
        if (taskTable.rows[0]?.exists) {
          const tasks = await dbHandle.pool.query<{ n: number }>(
            `select count(*)::int as n from task.tasks where workspace_id = $1`,
            [WORKSPACE_ID],
          );
          expect(tasks.rows[0]?.n).toBe(0);
        }
      }
    },
  );

  it('reject requires a reason and emits no notification when validation fails', async () => {
    const request = await seedTaskRequest();
    const missingReason = await decide(adminCookie, request.id, 'reject', {});
    expect(missingReason.statusCode).toBe(422);
    expect(missingReason.json<{ code: string }>().code).toBe('validation.failed');
    expect(notifications.jobs).toEqual([]);
  });

  it('invalid transition: approve rejected request -> validation.failed invalid_transition', async () => {
    const request = await seedTaskRequest({ status: 'rejected' });

    const res = await decide(adminCookie, request.id, 'approve', { reason: 'Changed my mind.' });
    expect(res.statusCode).toBe(422);
    const body = res.json<{ code: string; detail: { fields: Array<{ code: string }> } }>();
    expect(body.code).toBe('validation.failed');
    expect(body.detail.fields).toContainEqual({ path: ['status'], code: 'invalid_transition' });
  });

  it('self-approval by requester without capability is denied and audited', async () => {
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('self'));
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Self Review MS');
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.manage', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);
    const request = await seedTaskRequest({ msId, requesterActorId: devId });

    const res = await decide(devCookie, request.id, 'approve', { reason: 'I own the follow-up.' });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');

    const audit = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = 'task_request_self_approval_denied'
          and subject_id = $2`,
      [WORKSPACE_ID, request.id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      requester_actor_id: devId,
      reason_present: true,
      capability_present: false,
    });
    expect(notifications.jobs).toEqual([]);
  });

  it('self-approval by requester with admin role and reason is approved with sensitive audit detail', async () => {
    const request = await seedTaskRequest({ requesterActorId: adminActorId });

    const res = await decide(adminCookie, request.id, 'approve', {
      reason: 'Emergency owner approval.',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: request.id, status: 'approved' });

    const audit = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = 'task_request_approved'
          and subject_id = $2`,
      [WORKSPACE_ID, request.id],
    );
    expect(audit.rows[0]?.detail).toMatchObject({
      self_approval: true,
      sensitive: true,
      reason: 'Emergency owner approval.',
    });
    expect(notifications.jobs).toMatchObject([
      expect.objectContaining({
        actor_id: adminActorId,
        event_type: 'task_request.approved',
        subject_id: request.id,
        detail: {
          task_request_id: request.id,
          primary_managed_system_id: request.msId,
        },
      }),
    ]);
  });

  it('idempotency: same Idempotency-Key replays the same decision result', async () => {
    const request = await seedTaskRequest();
    const key = randomUUID();
    const payload = { reason: 'Repeatable approval.' };

    const first = await decide(adminCookie, request.id, 'approve', payload, key);
    const second = await decide(adminCookie, request.id, 'approve', payload, key);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(notifications.jobs).toHaveLength(1);

    const auditCount = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from core.audit_log
        where workspace_id = $1
          and event_type = 'task_request_approved'
          and subject_id = $2`,
      [WORKSPACE_ID, request.id],
    );
    expect(auditCount.rows[0]?.n).toBe(1);
  });

  it('rolls back the Task Request decision and audit when notification enqueue fails', async () => {
    const request = await seedTaskRequest();
    failNotificationEnqueue = true;

    const response = await decide(adminCookie, request.id, 'approve', {
      reason: 'Transactional notification check.',
    });

    expect(response.statusCode).toBe(500);
    expect(notificationAttempts).toHaveLength(1);
    expect(notifications.jobs).toEqual([]);
    const row = await dbHandle.pool.query<{ status: string }>(
      'select status from task_request.task_requests where id = $1',
      [request.id],
    );
    expect(row.rows[0]?.status).toBe('pending_review');
    const audit = await dbHandle.pool.query(
      `select 1 from core.audit_log
        where workspace_id = $1 and event_type = 'task_request_approved' and subject_id = $2`,
      [WORKSPACE_ID, request.id],
    );
    expect(audit.rowCount).toBe(0);
  });
});
