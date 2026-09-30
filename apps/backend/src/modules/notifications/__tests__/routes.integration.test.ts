import { randomUUID } from 'node:crypto';

import type { NotificationDto, NotificationEventType } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import {
  denyCapability,
  grantCapability,
  insertPermissionRequestRow,
} from '../../../test-support/permissions-fixtures.js';
import { insertTaskRequestRow, insertTaskRow } from '../../../test-support/task-fixtures.js';
import {
  insertPublicUpdateReviewCandidateDirectly,
  insertVocDirectly,
} from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TEST_PREFIX = `notification-routes-${randomUUID()}`;

const SUBJECT_REFERENCE_CASES: Array<{
  subjectType: NotificationDto['subject_type'];
  eventType: NotificationEventType;
}> = [
  { subjectType: 'voc', eventType: 'voc.reporter_replied' },
  { subjectType: 'task', eventType: 'task.assigned_to_me' },
  { subjectType: 'task_request', eventType: 'task_request.approved' },
  { subjectType: 'public_update_review_candidate', eventType: 'task.released' },
];

const VOC_SUBJECT_REFERENCE_CASES = [
  { scenario: 'reporter without a grant', expected: 'allowed' },
  { scenario: 'effective-scope summary-only access', expected: 'unavailable' },
  { scenario: 'explicit deny', expected: 'unavailable' },
  { scenario: 'archived VOC', expected: 'unavailable' },
  { scenario: 'subject in another workspace', expected: 'unavailable' },
] as const;

interface ActorSession {
  id: string;
  cookie: string;
  workspaceId: string;
  roleLevel: 'admin' | 'developer' | 'user';
}

interface NotificationSeed {
  id: string;
}

describe.skipIf(!runIntegration)('notification inbox routes', () => {
  let appDb: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let actorA: ActorSession;
  let actorB: ActorSession;
  let actorC: ActorSession;
  let actorD: ActorSession;
  let subjectManagedSystemId = '';
  let foreignSubjectManagedSystemId = '';
  const actorIds: string[] = [];
  const sessionIds: string[] = [];
  const rateLimitKeys: string[] = [];
  const workspaceIds: string[] = [];
  const notificationIds: string[] = [];
  const permissionRequestIds: string[] = [];
  const taskRequestIds: string[] = [];
  const taskIds: string[] = [];
  const vocIds: string[] = [];
  const reviewCandidateIds: string[] = [];
  const entityLinkIds: string[] = [];
  const permissionGrantIds: string[] = [];
  const permissionDenyIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    actorA = await createActorSession(WORKSPACE_ID, 'a');
    actorB = await createActorSession(WORKSPACE_ID, 'b');
    const otherWorkspaceId = await createWorkspace();
    actorC = await createActorSession(otherWorkspaceId, 'c');
  });

  async function cleanupNotifications(): Promise<void> {
    if (notificationIds.length > 0) {
      await migrateDb.pool.query('delete from core.notifications where id = any($1::uuid[])', [
        notificationIds,
      ]);
      notificationIds.length = 0;
    }
  }

  async function cleanupNotificationSubjects(): Promise<void> {
    if (reviewCandidateIds.length > 0) {
      await migrateDb.pool.query(
        'delete from voc.public_update_review_candidates where id = any($1::uuid[])',
        [reviewCandidateIds],
      );
      reviewCandidateIds.length = 0;
    }
    if (entityLinkIds.length > 0) {
      await migrateDb.pool.query('delete from core.entity_links where id = any($1::uuid[])', [
        entityLinkIds,
      ]);
      entityLinkIds.length = 0;
    }
    if (permissionRequestIds.length > 0) {
      await migrateDb.pool.query(
        'delete from permission.permission_requests where id = any($1::uuid[])',
        [permissionRequestIds],
      );
      permissionRequestIds.length = 0;
    }
    if (taskRequestIds.length > 0) {
      await migrateDb.pool.query(
        'delete from task_request.task_requests where id = any($1::uuid[])',
        [taskRequestIds],
      );
      taskRequestIds.length = 0;
    }
    if (taskIds.length > 0) {
      await migrateDb.pool.query('delete from task.tasks where id = any($1::uuid[])', [taskIds]);
      taskIds.length = 0;
    }
    if (vocIds.length > 0) {
      await migrateDb.pool.query('delete from voc.vocs where id = any($1::uuid[])', [vocIds]);
      vocIds.length = 0;
    }
    if (permissionGrantIds.length > 0) {
      await migrateDb.pool.query(
        'delete from permission.permission_grants where id = any($1::uuid[])',
        [permissionGrantIds],
      );
      permissionGrantIds.length = 0;
    }
    if (permissionDenyIds.length > 0) {
      await migrateDb.pool.query(
        'delete from permission.permission_denies where id = any($1::uuid[])',
        [permissionDenyIds],
      );
      permissionDenyIds.length = 0;
    }
  }

  afterEach(async () => {
    await cleanupNotifications();
    await cleanupNotificationSubjects();
    if (subjectManagedSystemId) {
      await migrateDb.pool.query('delete from core.managed_systems where id = $1', [
        subjectManagedSystemId,
      ]);
      subjectManagedSystemId = '';
    }
    if (foreignSubjectManagedSystemId) {
      await migrateDb.pool.query('delete from core.managed_systems where id = $1', [
        foreignSubjectManagedSystemId,
      ]);
      foreignSubjectManagedSystemId = '';
    }
  });

  afterAll(async () => {
    await cleanupNotifications();
    await cleanupNotificationSubjects();
    await app?.close();
    if (subjectManagedSystemId) {
      await migrateDb.pool.query('delete from core.managed_systems where id = $1', [
        subjectManagedSystemId,
      ]);
    }
    if (foreignSubjectManagedSystemId) {
      await migrateDb.pool.query('delete from core.managed_systems where id = $1', [
        foreignSubjectManagedSystemId,
      ]);
    }
    if (actorIds.length > 0) {
      await migrateDb.pool.query('delete from core.sessions where id = any($1::text[])', [
        sessionIds,
      ]);
      await migrateDb.pool.query(
        `delete from core.rate_limits
          where key = any($1::text[])`,
        [rateLimitKeys],
      );
      await migrateDb.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    }
    if (workspaceIds.length > 0) {
      await migrateDb?.pool.query('delete from core.workspaces where id = any($1::uuid[])', [
        workspaceIds,
      ]);
    }
    await appDb?.close();
    await migrateDb?.close();
  });

  async function createWorkspace(): Promise<string> {
    const result = await migrateDb.pool.query<{ id: string }>(
      'insert into core.workspaces (name) values ($1) returning id',
      [`${TEST_PREFIX}-${randomUUID()}`],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('notification test workspace insert returned no id');
    workspaceIds.push(id);
    return id;
  }

  async function createActorSession(
    workspaceId: string,
    suffix: string,
    roleLevel: ActorSession['roleLevel'] = 'user',
  ): Promise<ActorSession> {
    const idSuffix = randomUUID();
    const externalId = `${TEST_PREFIX}-${suffix}-${idSuffix}`;
    const email = `${idSuffix}@example.test`;
    const actor = await migrateDb.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, $4, 'internal_member')
       returning id`,
      [workspaceId, externalId, email, roleLevel],
    );
    const actorId = actor.rows[0]?.id;
    if (!actorId) throw new Error('notification test actor insert returned no id');
    actorIds.push(actorId);

    const sessionId = randomUUID();
    await migrateDb.pool.query(
      `insert into core.sessions
         (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [sessionId, actorId, workspaceId],
    );
    sessionIds.push(sessionId);
    rateLimitKeys.push(`${workspaceId}:${actorId}`);
    return { id: actorId, cookie: sessionId, workspaceId, roleLevel };
  }

  async function insertNotification(
    actor: ActorSession,
    input: {
      createdAt: string;
      readAt?: string | null;
      archivedAt?: string | null;
      eventType?: NotificationEventType;
      subjectType?: NotificationDto['subject_type'];
      subjectId?: string;
      summary?: string;
      detail?: Record<string, unknown>;
    },
  ): Promise<NotificationSeed> {
    const id = randomUUID();
    const eventType = input.eventType ?? 'voc.reporter_replied';
    const subjectType = input.subjectType ?? 'voc';
    const subjectId = input.subjectId ?? randomUUID();
    const result = await migrateDb.pool.query<NotificationSeed>(
      `insert into core.notifications
         (id, workspace_id, actor_id, event_type, subject_type, subject_id, summary,
          detail, correlation_id, created_at, read_at, archived_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
       returning id, actor_id, workspace_id, created_at::text, read_at, archived_at`,
      [
        id,
        actor.workspaceId,
        actor.id,
        eventType,
        subjectType,
        subjectId,
        input.summary ?? '알림 테스트 요약',
        JSON.stringify(input.detail ?? {}),
        randomUUID(),
        input.createdAt,
        input.readAt ?? null,
        input.archivedAt ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('notification fixture insert returned no row');
    notificationIds.push(id);
    return row;
  }

  async function seedNotificationSubject(
    subjectType: NotificationDto['subject_type'],
  ): Promise<{ id: string; displayId: string; title: string; grantId: string }> {
    if (subjectType === 'task' || subjectType === 'task_request') {
      const grantId = await grantCapability(
        migrateDb,
        WORKSPACE_ID,
        actorD.id,
        'finding.read',
        subjectManagedSystemId,
        actorD.id,
      );
      permissionGrantIds.push(grantId);
      if (subjectType === 'task') {
        const title = 'Task notification subject';
        const task = await insertTaskRow(migrateDb, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: subjectManagedSystemId,
          title,
          createdBy: actorD.id,
        });
        taskIds.push(task.id);
        return { id: task.id, displayId: task.display_id, title, grantId };
      }
      const title = 'Task Request notification subject';
      const taskRequest = await insertTaskRequestRow(migrateDb, {
        workspaceId: WORKSPACE_ID,
        sourceId: randomUUID(),
        primaryManagedSystemId: subjectManagedSystemId,
        requestedOutcome: title,
        requesterActorId: actorD.id,
      });
      taskRequestIds.push(taskRequest.id);
      return { id: taskRequest.id, displayId: taskRequest.display_id, title, grantId };
    }
    if (subjectType !== 'voc' && subjectType !== 'public_update_review_candidate') {
      throw new Error(`unsupported notification subject fixture: ${subjectType}`);
    }

    const grantId = await grantCapability(
      migrateDb,
      WORKSPACE_ID,
      actorD.id,
      'voc.read',
      subjectManagedSystemId,
      actorD.id,
    );
    permissionGrantIds.push(grantId);
    const title = 'VOC notification subject';
    // The recipient must not be the reporter: a reporter keeps reading their own VOC after a grant is revoked.
    const reporter = await createActorSession(WORKSPACE_ID, 'r', 'user');
    const voc = await insertVocDirectly(
      migrateDb,
      WORKSPACE_ID,
      subjectManagedSystemId,
      reporter.id,
      title,
    );
    vocIds.push(voc.id);
    const vocRows = await migrateDb.pool.query<{ display_id: string; title: string }>(
      'select display_id, title from voc.vocs where id = $1',
      [voc.id],
    );
    const vocRow = vocRows.rows[0];
    if (!vocRow) throw new Error('notification VOC fixture missing');
    if (subjectType === 'voc') {
      return { id: voc.id, displayId: vocRow.display_id, title: vocRow.title, grantId };
    }

    const task = await insertTaskRow(migrateDb, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: subjectManagedSystemId,
      status: 'released',
      createdBy: actorD.id,
    });
    taskIds.push(task.id);
    const candidate = await insertPublicUpdateReviewCandidateDirectly(migrateDb, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: subjectManagedSystemId,
      vocId: voc.id,
      taskId: task.id,
      triggeredByActorId: actorD.id,
    });
    reviewCandidateIds.push(candidate.id);
    entityLinkIds.push(candidate.sourceEntityLinkId);
    return {
      id: candidate.id,
      displayId: vocRow.display_id,
      title: vocRow.title,
      grantId,
    };
  }

  async function seedVocSubject(
    workspaceId: string,
    managedSystemId: string,
    reporterId: string,
    title: string,
  ): Promise<{ id: string; displayId: string; title: string }> {
    const voc = await insertVocDirectly(migrateDb, workspaceId, managedSystemId, reporterId, title);
    vocIds.push(voc.id);
    const result = await migrateDb.pool.query<{ display_id: string; title: string }>(
      'select display_id, title from voc.vocs where id = $1',
      [voc.id],
    );
    const row = result.rows[0];
    if (!row) throw new Error('notification VOC fixture missing');
    return { id: voc.id, displayId: row.display_id, title: row.title };
  }

  function expectUnavailableSubjectReference(
    item: { subject_ref?: unknown } | undefined,
    subject: { displayId: string; title: string },
  ): void {
    expect(item?.subject_ref).toEqual({ visibility_state: 'unavailable' });
    const subjectReferenceJson = JSON.stringify(item?.subject_ref ?? null);
    expect(subjectReferenceJson).not.toContain(subject.displayId);
    expect(subjectReferenceJson).not.toContain(subject.title);
  }

  it.each(SUBJECT_REFERENCE_CASES)(
    'resolves $subjectType notification subjects using current read access',
    async ({ subjectType, eventType }) => {
      actorD = await createActorSession(WORKSPACE_ID, 'd', 'developer');
      subjectManagedSystemId = await insertMsDirectly(
        migrateDb,
        WORKSPACE_ID,
        `${TEST_PREFIX}-subject`,
        'Notification subject test system',
      );
      const subject = await seedNotificationSubject(subjectType);
      const notification = await insertNotification(actorD, {
        createdAt: new Date().toISOString(),
        eventType,
        subjectType,
        subjectId: subject.id,
      });

      const allowedResponse = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: cookieHeader(actorD),
      });
      const allowedItem = allowedResponse
        .json<{ items: Array<{ id: string; subject_ref?: unknown }> }>()
        .items.find((item) => item.id === notification.id);
      expect(allowedItem?.subject_ref).toEqual({
        visibility_state: 'allowed',
        display_id: subject.displayId,
        title: subject.title,
      });

      await migrateDb.pool.query(
        `update permission.permission_grants
            set revoked_at = now(), revoked_by_actor_id = $2
          where id = $1`,
        [subject.grantId, actorD.id],
      );
      const unavailableResponse = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: cookieHeader(actorD),
      });
      const unavailableItem = unavailableResponse
        .json<{ items: Array<{ id: string; subject_ref?: unknown }> }>()
        .items.find((item) => item.id === notification.id);
      expect(unavailableItem?.subject_ref).toEqual({ visibility_state: 'unavailable' });
      expect(JSON.stringify(unavailableItem?.subject_ref)).not.toContain(subject.displayId);
      expect(JSON.stringify(unavailableItem?.subject_ref)).not.toContain(subject.title);
    },
  );

  it.each(VOC_SUBJECT_REFERENCE_CASES)(
    'returns $expected for a VOC subject with $scenario',
    async ({ scenario, expected }) => {
      const isReporter = scenario === 'reporter without a grant';
      const roleLevel = isReporter
        ? 'user'
        : scenario === 'subject in another workspace'
          ? 'admin'
          : 'developer';
      actorD = await createActorSession(WORKSPACE_ID, 'd', roleLevel);
      subjectManagedSystemId = await insertMsDirectly(
        migrateDb,
        WORKSPACE_ID,
        `${TEST_PREFIX}-subject`,
        'Notification subject test system',
      );

      let subjectWorkspaceId = WORKSPACE_ID;
      let subjectManagedSystemIdForCase = subjectManagedSystemId;
      let reporterId = actorD.id;
      if (scenario === 'subject in another workspace') {
        subjectWorkspaceId = await createWorkspace();
        foreignSubjectManagedSystemId = await insertMsDirectly(
          migrateDb,
          subjectWorkspaceId,
          `${TEST_PREFIX}-foreign-subject`,
          'Foreign notification subject test system',
        );
        subjectManagedSystemIdForCase = foreignSubjectManagedSystemId;
        reporterId = (await createActorSession(subjectWorkspaceId, 'foreign-reporter')).id;
      } else if (!isReporter) {
        reporterId = (await createActorSession(WORKSPACE_ID, 'subject-reporter')).id;
      }

      const subject = await seedVocSubject(
        subjectWorkspaceId,
        subjectManagedSystemIdForCase,
        reporterId,
        `${TEST_PREFIX} VOC subject ${scenario}`,
      );
      const sameWorkspaceAdminControl =
        scenario === 'subject in another workspace'
          ? await seedVocSubject(
              WORKSPACE_ID,
              subjectManagedSystemId,
              actorA.id,
              `${TEST_PREFIX} VOC subject same-workspace admin control`,
            )
          : null;

      if (scenario === 'effective-scope summary-only access') {
        permissionGrantIds.push(
          await grantCapability(
            migrateDb,
            WORKSPACE_ID,
            actorD.id,
            'voc.triage',
            subjectManagedSystemIdForCase,
            actorA.id,
          ),
        );
      } else if (scenario === 'explicit deny') {
        permissionGrantIds.push(
          await grantCapability(
            migrateDb,
            WORKSPACE_ID,
            actorD.id,
            'voc.read',
            subjectManagedSystemIdForCase,
            actorA.id,
          ),
        );
        permissionDenyIds.push(
          await denyCapability(
            migrateDb,
            WORKSPACE_ID,
            actorD.id,
            'voc.read',
            subjectManagedSystemIdForCase,
            actorA.id,
          ),
        );
      } else if (scenario === 'archived VOC') {
        permissionGrantIds.push(
          await grantCapability(
            migrateDb,
            WORKSPACE_ID,
            actorD.id,
            'voc.read',
            subjectManagedSystemIdForCase,
            actorA.id,
          ),
        );
        await migrateDb.pool.query('update voc.vocs set archived_at = now() where id = $1', [
          subject.id,
        ]);
      }

      if (isReporter || scenario === 'subject in another workspace') {
        const grantCount = await migrateDb.pool.query<{ count: string }>(
          'select count(*)::text as count from permission.permission_grants where actor_id = $1 and capability in ($2, $3)',
          [actorD.id, 'voc.read', 'voc.triage'],
        );
        expect(grantCount.rows[0]?.count).toBe('0');
      }

      const notification = await insertNotification(actorD, {
        createdAt: new Date().toISOString(),
        eventType: 'voc.reporter_replied',
        subjectType: 'voc',
        subjectId: subject.id,
      });
      const controlNotification =
        sameWorkspaceAdminControl === null
          ? null
          : await insertNotification(actorD, {
              createdAt: new Date().toISOString(),
              eventType: 'voc.reporter_replied',
              subjectType: 'voc',
              subjectId: sameWorkspaceAdminControl.id,
            });
      const response = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: cookieHeader(actorD),
      });
      expect(response.statusCode).toBe(200);
      const item = response
        .json<{ items: Array<{ id: string; subject_ref?: unknown }> }>()
        .items.find((row) => row.id === notification.id);

      if (controlNotification !== null && sameWorkspaceAdminControl !== null) {
        const controlItem = response
          .json<{ items: Array<{ id: string; subject_ref?: unknown }> }>()
          .items.find((row) => row.id === controlNotification.id);
        expect(controlItem?.subject_ref).toEqual({
          visibility_state: 'allowed',
          display_id: sameWorkspaceAdminControl.displayId,
          title: sameWorkspaceAdminControl.title,
        });
      }

      if (expected === 'allowed') {
        expect(item?.subject_ref).toEqual({
          visibility_state: 'allowed',
          display_id: subject.displayId,
          title: subject.title,
        });
      } else {
        expectUnavailableSubjectReference(item, subject);
      }
    },
  );

  it('resolves Permission Request subjects for requesters and admins only', async () => {
    const adminActor = await createActorSession(WORKSPACE_ID, 'e', 'admin');
    const request = await insertPermissionRequestRow(migrateDb, {
      workspaceId: WORKSPACE_ID,
      requesterActorId: actorA.id,
      requestedCapability: 'workspace.admin',
      reason: 'Notification subject fixture',
    });
    permissionRequestIds.push(request.id);
    const requesterNotification = await insertNotification(actorA, {
      createdAt: new Date().toISOString(),
      eventType: 'permission_request.decided',
      subjectType: 'permission_request',
      subjectId: request.id,
    });
    const adminNotification = await insertNotification(adminActor, {
      createdAt: new Date().toISOString(),
      eventType: 'permission_request.submitted',
      subjectType: 'permission_request',
      subjectId: request.id,
    });
    const unrelatedNotification = await insertNotification(actorB, {
      createdAt: new Date().toISOString(),
      eventType: 'permission_request.submitted',
      subjectType: 'permission_request',
      subjectId: request.id,
    });

    for (const [actor, notification] of [
      [actorA, requesterNotification],
      [adminActor, adminNotification],
    ] as const) {
      const response = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: cookieHeader(actor),
      });
      const item = response
        .json<{ items: Array<{ id: string; subject_ref?: unknown }> }>()
        .items.find((row) => row.id === notification.id);
      expect(item?.subject_ref).toEqual({
        visibility_state: 'allowed',
        display_id: request.id.slice(0, 8),
        title: 'workspace.admin',
      });
    }

    const unrelatedResponse = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: cookieHeader(actorB),
    });
    const unrelatedItem = unrelatedResponse
      .json<{ items: Array<{ id: string; subject_ref?: unknown }> }>()
      .items.find((row) => row.id === unrelatedNotification.id);
    expect(unrelatedItem?.subject_ref).toEqual({ visibility_state: 'unavailable' });
    expect(JSON.stringify(unrelatedItem?.subject_ref)).not.toContain(request.id);
    expect(JSON.stringify(unrelatedItem?.subject_ref)).not.toContain('workspace.admin');
  });

  function cookieHeader(actor: ActorSession): { cookie: string } {
    return { cookie: `${SESSION_COOKIE_NAME}=${actor.cookie}` };
  }

  it('keeps list, pagination, read, archive, and validation behavior actor scoped', async () => {
    const base = Date.now() - 60_000;
    const aNewest = await insertNotification(actorA, {
      createdAt: new Date(base + 5000).toISOString(),
    });
    const aMiddle = await insertNotification(actorA, {
      createdAt: new Date(base + 4000).toISOString(),
    });
    const aRead = await insertNotification(actorA, {
      createdAt: new Date(base + 3000).toISOString(),
      readAt: new Date(base + 3500).toISOString(),
    });
    const aArchived = await insertNotification(actorA, {
      createdAt: new Date(base + 2000).toISOString(),
      archivedAt: new Date(base + 2500).toISOString(),
    });
    const bRow = await insertNotification(actorB, {
      createdAt: new Date(base + 1000).toISOString(),
    });
    const cRow = await insertNotification(actorC, {
      createdAt: new Date(base).toISOString(),
    });

    const anonymous = await app.inject({ method: 'GET', url: '/notifications' });
    expect(anonymous.statusCode).toBe(401);
    const anonymousMutation = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/read`,
    });
    expect(anonymousMutation.statusCode).toBe(401);

    const first = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: cookieHeader(actorA),
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const firstBody = first.json<{
      items: Array<{ id: string }>;
      page: { cursor?: string; has_more: boolean };
      unread_count: number;
    }>();
    expect(firstBody.items.map((item) => item.id)).toEqual([aNewest.id, aMiddle.id, aRead.id]);
    expect(firstBody.items.map((item) => item.id)).not.toContain(bRow.id);
    expect(firstBody.items.map((item) => item.id)).not.toContain(cRow.id);
    expect(firstBody.unread_count).toBe(2);

    const unread = await app.inject({
      method: 'GET',
      url: '/notifications?unread=true',
      headers: cookieHeader(actorA),
    });
    expect(unread.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toEqual([
      aNewest.id,
      aMiddle.id,
    ]);
    const read = await app.inject({
      method: 'GET',
      url: '/notifications?unread=false',
      headers: cookieHeader(actorA),
    });
    expect(read.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toEqual([
      aRead.id,
    ]);

    const archived = await app.inject({
      method: 'GET',
      url: '/notifications?include_archived=true',
      headers: cookieHeader(actorA),
    });
    expect(
      archived
        .json<{ items: Array<{ id: string }>; unread_count: number }>()
        .items.map((item) => item.id),
    ).toEqual([aNewest.id, aMiddle.id, aRead.id, aArchived.id]);
    expect(archived.json<{ unread_count: number }>().unread_count).toBe(2);

    const pageOne = await app.inject({
      method: 'GET',
      url: '/notifications?limit=2',
      headers: cookieHeader(actorA),
    });
    const pageOneBody = pageOne.json<{
      items: Array<{ id: string }>;
      page: { cursor?: string; has_more: boolean };
    }>();
    expect(pageOneBody.items.map((item) => item.id)).toEqual([aNewest.id, aMiddle.id]);
    expect(pageOneBody.page.has_more).toBe(true);
    expect(pageOneBody.page.cursor).toBeTruthy();
    const pageTwo = await app.inject({
      method: 'GET',
      url: `/notifications?limit=2&cursor=${encodeURIComponent(pageOneBody.page.cursor ?? '')}`,
      headers: cookieHeader(actorA),
    });
    const pageTwoBody = pageTwo.json<{
      items: Array<{ id: string }>;
      page: { has_more: boolean };
      unread_count: number;
    }>();
    expect(pageTwoBody.items.map((item) => item.id)).toEqual([aRead.id]);
    expect(pageTwoBody.page.has_more).toBe(false);
    expect(pageTwoBody.unread_count).toBe(2);
    expect(pageOneBody.items.map((item) => item.id)).not.toContain(pageTwoBody.items[0]?.id);

    const foreignRead = await app.inject({
      method: 'POST',
      url: `/notifications/${bRow.id}/read`,
      headers: cookieHeader(actorA),
    });
    const foreignArchive = await app.inject({
      method: 'POST',
      url: `/notifications/${bRow.id}/archive`,
      headers: cookieHeader(actorA),
    });
    const crossWorkspace = await app.inject({
      method: 'POST',
      url: `/notifications/${cRow.id}/read`,
      headers: cookieHeader(actorA),
    });
    expect(foreignRead.statusCode).toBe(404);
    expect(foreignRead.json<{ code: string }>().code).toBe('not_found.record');
    expect(foreignArchive.statusCode).toBe(404);
    expect(crossWorkspace.statusCode).toBe(404);
    const unchangedB = await migrateDb.pool.query<{
      read_at: Date | null;
      archived_at: Date | null;
    }>('select read_at, archived_at from core.notifications where id = $1', [bRow.id]);
    expect(unchangedB.rows[0]).toEqual({ read_at: null, archived_at: null });

    const firstRead = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/read`,
      headers: cookieHeader(actorA),
    });
    const firstReadAt = firstRead.json<{ read_at: string | null }>().read_at;
    expect(firstRead.statusCode).toBe(200);
    expect(firstReadAt).toBeTruthy();
    const storedFirstRead = await migrateDb.pool.query<{ read_at: string }>(
      'select read_at::text from core.notifications where id = $1',
      [aNewest.id],
    );
    const secondRead = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/read`,
      headers: cookieHeader(actorA),
    });
    expect(secondRead.json<{ read_at: string | null }>().read_at).toBe(firstReadAt);
    const storedSecondRead = await migrateDb.pool.query<{ read_at: string }>(
      'select read_at::text from core.notifications where id = $1',
      [aNewest.id],
    );
    expect(storedSecondRead.rows[0]?.read_at).toBe(storedFirstRead.rows[0]?.read_at);

    const archiveRead = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/archive`,
      headers: cookieHeader(actorA),
    });
    expect(archiveRead.json<{ read_at: string | null }>().read_at).toBe(firstReadAt);

    const archiveUnread = await app.inject({
      method: 'POST',
      url: `/notifications/${aMiddle.id}/archive`,
      headers: cookieHeader(actorA),
    });
    expect(archiveUnread.statusCode).toBe(200);
    expect(
      archiveUnread.json<{ read_at: string | null; archived_at: string | null }>(),
    ).toMatchObject({ read_at: null });
    expect(archiveUnread.json<{ archived_at: string | null }>().archived_at).toBeTruthy();
    const afterArchive = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: cookieHeader(actorA),
    });
    expect(
      afterArchive.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id),
    ).not.toContain(aMiddle.id);
    const afterArchiveIncludingArchived = await app.inject({
      method: 'GET',
      url: '/notifications?include_archived=true',
      headers: cookieHeader(actorA),
    });
    expect(
      afterArchiveIncludingArchived
        .json<{ items: Array<{ id: string }> }>()
        .items.map((item) => item.id),
    ).toContain(aMiddle.id);

    const unknownId = await app.inject({
      method: 'POST',
      url: `/notifications/${randomUUID()}/read`,
      headers: cookieHeader(actorA),
    });
    expect(unknownId.statusCode).toBe(404);
    expect(unknownId.json<{ code: string }>().code).toBe('not_found.record');

    const invalidLimits = await Promise.all([
      app.inject({ method: 'GET', url: '/notifications?limit=0', headers: cookieHeader(actorA) }),
      app.inject({ method: 'GET', url: '/notifications?limit=101', headers: cookieHeader(actorA) }),
    ]);
    expect(invalidLimits.map((response) => response.statusCode)).toEqual([422, 422]);
    expect(invalidLimits.map((response) => response.json<{ code: string }>().code)).toEqual([
      'validation.failed',
      'validation.failed',
    ]);
    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/notifications?cursor=not-a-cursor',
      headers: cookieHeader(actorA),
    });
    expect(invalidCursor.statusCode).toBe(422);
    expect(invalidCursor.json<{ code: string }>().code).toBe('validation.failed');
    const invalidId = await app.inject({
      method: 'POST',
      url: '/notifications/not-a-uuid/read',
      headers: cookieHeader(actorA),
    });
    expect(invalidId.statusCode).toBe(422);
    expect(invalidId.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('applies the 60-per-minute notification_state tier per Actor', async () => {
    const row = await insertNotification(actorB, { createdAt: new Date().toISOString() });
    await migrateDb.pool.query('delete from core.rate_limits where key = $1 and route_group = $2', [
      `${actorB.workspaceId}:${actorB.id}`,
      'notification_state',
    ]);

    const responses = [];
    for (let attempt = 0; attempt < 61; attempt += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: `/notifications/${row.id}/read`,
          headers: cookieHeader(actorB),
        }),
      );
    }
    expect(responses.slice(0, 60).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[60]?.statusCode).toBe(429);
    expect(responses[60]?.json<{ code: string }>().code).toBe('rate_limited.actor');
  });

  it('allows notification reads when the Actor mutation bucket is exhausted', async () => {
    const row = await insertNotification(actorA, { createdAt: new Date().toISOString() });
    const key = `${actorA.workspaceId}:${actorA.id}`;
    await migrateDb.pool.query('delete from core.rate_limits where key = $1', [key]);
    await migrateDb.pool.query(
      `insert into core.rate_limits (key, route_group, counter, expires_at)
       values ($1, 'mutation', 10, now() + interval '1 minute')`,
      [key],
    );

    const response = await app.inject({
      method: 'POST',
      url: `/notifications/${row.id}/read`,
      headers: cookieHeader(actorA),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ id: string }>().id).toBe(row.id);
    const rateRows = await migrateDb.pool.query<{ route_group: string; counter: number }>(
      `select route_group, counter from core.rate_limits
       where key = $1 and route_group in ('mutation', 'notification_state')
       order by route_group`,
      [key],
    );
    expect(rateRows.rows).toEqual([
      { route_group: 'mutation', counter: 10 },
      { route_group: 'notification_state', counter: 1 },
    ]);
  });
});
