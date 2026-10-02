import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { initBoss, shutdownBoss } from '../../../lib/jobs.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { createFailAfterEnqueueNotificationDispatcher } from '../../../test-support/fail-after-enqueue-dispatcher.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import {
  NOTIFICATION_DISPATCH_QUEUE,
  createRecordingNotificationDispatcher,
} from '../../notifications/port.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);
const TEST_PREFIX = `notification-voc-${randomUUID()}`;

type TestActor = {
  id: string;
  externalId: string;
  sessionId: string;
  roleLevel: 'admin' | 'developer' | 'user';
};

describe.skipIf(!runIntegration)('VOC notification producers (#509 part 2a)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let rollbackApp: FastifyInstance;
  let boss: Awaited<ReturnType<typeof initBoss>>;
  let failAfterEnqueue: ReturnType<typeof createFailAfterEnqueueNotificationDispatcher>;
  let workspaceId: string;
  let managedSystemId: string;
  let teamId: string;
  let admin: TestActor;
  let secondAdmin: TestActor;
  let owner: TestActor;
  let replacementOwner: TestActor;
  let developer: TestActor;
  let user: TestActor;
  let reporter: TestActor;
  const actors: TestActor[] = [];
  const fixtureVocIds: string[] = [];
  const notifications = createRecordingNotificationDispatcher();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    workspaceId = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      `${TEST_PREFIX}-workspace`,
    ]);
    managedSystemId = await createManagedSystem();
    teamId = await createTeam();
    admin = await createActor('admin');
    secondAdmin = await createActor('admin');
    owner = await createActor('user');
    replacementOwner = await createActor('user');
    developer = await createActor('developer');
    user = await createActor('user');
    reporter = await createActor('user');

    boss = await initBoss({
      connectionString: APP_URL,
      log: { info() {}, warn() {}, error() {} },
    });
    failAfterEnqueue = createFailAfterEnqueueNotificationDispatcher(boss);
    const config = { ...loadConfig(), WORKSPACE_ID: workspaceId };
    app = await buildServer({
      config,
      dbHandle,
      notificationDispatcher: notifications,
    });
    rollbackApp = await buildServer({
      config,
      dbHandle,
      notificationDispatcher: failAfterEnqueue.dispatcher,
    });
    await app.ready();
    await rollbackApp.ready();
  });

  beforeEach(async () => {
    notifications.jobs.splice(0);
    await cleanupFailedNotificationJobs();
    await clearActorRequestState();
  });

  afterEach(async () => {
    await cleanupFailedNotificationJobs();
    if (fixtureVocIds.length > 0) {
      await migrateHandle.pool.query(
        'delete from core.audit_log where subject_id = any($1::uuid[])',
        [fixtureVocIds],
      );
      await migrateHandle.pool.query('delete from voc.vocs where id = any($1::uuid[])', [
        fixtureVocIds,
      ]);
      fixtureVocIds.length = 0;
    }
    await clearActorRequestState();
  });

  afterAll(async () => {
    if (!migrateHandle) return;
    await cleanupFailedNotificationJobs();
    if (fixtureVocIds.length > 0) {
      await migrateHandle.pool.query(
        'delete from core.audit_log where subject_id = any($1::uuid[])',
        [fixtureVocIds],
      );
      await migrateHandle.pool.query('delete from voc.vocs where id = any($1::uuid[])', [
        fixtureVocIds,
      ]);
      fixtureVocIds.length = 0;
    }
    const actorIds = actors.map((actor) => actor.id);
    await migrateHandle.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [
      actorIds,
    ]);
    await clearActorRequestState();
    await migrateHandle.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
      actorIds,
    ]);
    await migrateHandle.pool.query('delete from core.teams where id = $1', [teamId]);
    await migrateHandle.pool.query('delete from core.managed_systems where id = $1', [
      managedSystemId,
    ]);
    await migrateHandle.pool.query('delete from core.actors where id = any($1::uuid[])', [
      actorIds,
    ]);
    await migrateHandle.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    await shutdownBoss(boss).catch(() => {});
    await rollbackApp?.close();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function createActor(roleLevel: TestActor['roleLevel']): Promise<TestActor> {
    const externalId = `${TEST_PREFIX}-${roleLevel}-${randomUUID()}`;
    const actorResult = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, $4, 'internal_member') returning id`,
      [workspaceId, externalId, `${randomUUID()}@example.test`, roleLevel],
    );
    const id = actorResult.rows[0]?.id;
    if (!id) throw new Error(`notification test ${roleLevel} actor seed returned no id`);
    const sessionId = randomUUID();
    await migrateHandle.pool.query(
      `insert into core.sessions
         (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [sessionId, id, workspaceId],
    );
    const actor = { id, externalId, sessionId, roleLevel };
    actors.push(actor);
    return actor;
  }

  async function createManagedSystem(): Promise<string> {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, 'VOC notification test') returning id`,
      [workspaceId, `${TEST_PREFIX}-ms`],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('notification test managed system seed returned no id');
    return id;
  }

  async function createTeam(): Promise<string> {
    const result = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.teams (workspace_id, name) values ($1, $2) returning id',
      [workspaceId, `${TEST_PREFIX}-team`],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('notification test team seed returned no id');
    return id;
  }

  async function seedVoc(
    input: {
      reporter?: TestActor;
      ownerUserId?: string;
      ownerTeamId?: string;
      severity?: 'low' | 'medium' | 'high' | 'critical';
    } = {},
  ): Promise<{ id: string; updatedAt: string }> {
    const inserted = await insertVocDirectly(
      migrateHandle,
      workspaceId,
      managedSystemId,
      input.reporter?.id ?? reporter.id,
      `${TEST_PREFIX}-voc-${randomUUID()}`,
      {
        ...(input.severity === undefined ? {} : { severity: input.severity }),
        ...(input.ownerUserId === undefined ? {} : { ownerUserId: input.ownerUserId }),
      },
    );
    fixtureVocIds.push(inserted.id);
    if (input.ownerTeamId) {
      await migrateHandle.pool.query(
        `update voc.vocs set owner_user_id = null, owner_team_id = $2, updated_at = now()
          where id = $1`,
        [inserted.id, input.ownerTeamId],
      );
    }
    const state = await getVocState(inserted.id);
    expect(state.triage_state).toBe('untriaged');
    return { id: inserted.id, updatedAt: state.updated_at.toISOString() };
  }

  async function getVocState(vocId: string): Promise<{
    owner_user_id: string | null;
    owner_team_id: string | null;
    severity: string | null;
    triage_state: string;
    triage_state_review_postponed_at: Date | null;
    updated_at: Date;
  }> {
    const result = await migrateHandle.pool.query<{
      owner_user_id: string | null;
      owner_team_id: string | null;
      severity: string | null;
      triage_state: string;
      triage_state_review_postponed_at: Date | null;
      updated_at: Date;
    }>(
      `select owner_user_id, owner_team_id, severity, triage_state,
              triage_state_review_postponed_at, updated_at
         from voc.vocs where id = $1`,
      [vocId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`notification test VOC ${vocId} missing`);
    return row;
  }

  function actorCookie(actor: TestActor): string {
    return `${SESSION_COOKIE_NAME}=${actor.sessionId}`;
  }

  function patchVoc(
    targetApp: FastifyInstance,
    actor: TestActor,
    vocId: string,
    updatedAt: string,
    payload: Record<string, unknown>,
  ) {
    return targetApp.inject({
      method: 'PATCH',
      url: `/vocs/${vocId}`,
      headers: {
        cookie: actorCookie(actor),
        'content-type': 'application/json',
        'if-match': updatedAt,
        'idempotency-key': randomUUID(),
      },
      payload,
    });
  }

  function postReporterReply(
    targetApp: FastifyInstance,
    actor: TestActor,
    vocId: string,
    idempotencyKey = randomUUID(),
  ) {
    return targetApp.inject({
      method: 'POST',
      url: `/vocs/${vocId}/reporter-replies`,
      headers: {
        cookie: actorCookie(actor),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: {
        body_rich_content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'reply text' }] }],
        },
      },
    });
  }

  async function clearActorRequestState(): Promise<void> {
    if (actors.length === 0) return;
    const actorIds = actors.map((actor) => actor.id);
    await migrateHandle.pool.query(
      'delete from core.idempotency_keys where actor_id = any($1::uuid[])',
      [actorIds],
    );
    await migrateHandle.pool.query('delete from core.rate_limits where key like $1', [
      `${workspaceId}:%`,
    ]);
  }

  async function cleanupFailedNotificationJobs(): Promise<void> {
    const correlationIds = failAfterEnqueue?.attemptedPayloads.map(
      (payload) => payload.correlation_id,
    );
    if (migrateHandle && correlationIds && correlationIds.length > 0) {
      await migrateHandle.pool.query(
        `delete from pgboss.job
          where name = $1 and data ->> 'correlation_id' = any($2::text[])`,
        [NOTIFICATION_DISPATCH_QUEUE, correlationIds],
      );
      failAfterEnqueue.attemptedPayloads.length = 0;
    }
  }

  function assertVocJob(
    eventType: 'voc.assigned_to_me' | 'voc.reporter_replied' | 'voc.severity_set_high_or_critical',
    vocId: string,
    detail: Record<string, string>,
    expectedSummary: string,
  ): void {
    const jobs = notifications.jobs.filter(
      (job) => job.event_type === eventType && job.subject_id === vocId,
    );
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs).toMatchObject(
      jobs.map(() =>
        expect.objectContaining({
          workspace_id: workspaceId,
          event_type: eventType,
          subject_type: 'voc',
          subject_id: vocId,
          summary: expectedSummary,
          detail,
          correlation_id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        }),
      ),
    );
    expect(
      jobs.every((job) => Object.keys(job.detail).every((key) => Object.hasOwn(detail, key))),
    ).toBe(true);
  }

  it('notifies only each newly assigned user owner', async () => {
    const voc = await seedVoc();
    const first = await patchVoc(app, admin, voc.id, voc.updatedAt, {
      owner_user_id: owner.id,
    });
    expect(first.statusCode).toBe(200);
    expect(notifications.jobs.map((job) => job.actor_id)).toEqual([owner.id]);
    assertVocJob(
      'voc.assigned_to_me',
      voc.id,
      {
        voc_id: voc.id,
        primary_managed_system_id: managedSystemId,
      },
      'VOC 담당자로 지정되었습니다.',
    );

    notifications.jobs.splice(0);
    const changed = await patchVoc(
      app,
      admin,
      voc.id,
      first.json<{ updated_at: string }>().updated_at,
      { owner_user_id: replacementOwner.id },
    );
    expect(changed.statusCode).toBe(200);
    expect(notifications.jobs.map((job) => job.actor_id)).toEqual([replacementOwner.id]);
  });

  it('does not notify for team-only ownership or an unchanged owner', async () => {
    const teamOwnedVoc = await seedVoc();
    const teamUpdate = await patchVoc(app, admin, teamOwnedVoc.id, teamOwnedVoc.updatedAt, {
      owner_user_id: null,
      owner_team_id: teamId,
    });
    expect(teamUpdate.statusCode).toBe(200);
    expect(notifications.jobs).toHaveLength(0);

    const userOwnedVoc = await seedVoc({ ownerUserId: owner.id });
    const unchanged = await patchVoc(app, admin, userOwnedVoc.id, userOwnedVoc.updatedAt, {
      owner_user_id: owner.id,
    });
    expect(unchanged.statusCode).toBe(200);
    expect(notifications.jobs).toHaveLength(0);
  });

  it('notifies the user owner and workspace admins on a reporter reply', async () => {
    const voc = await seedVoc({ ownerUserId: owner.id });
    const response = await postReporterReply(app, reporter, voc.id);
    expect(response.statusCode).toBe(201);
    expect(notifications.jobs.map((job) => job.actor_id).sort()).toEqual(
      [admin.id, secondAdmin.id, owner.id].sort(),
    );
    assertVocJob(
      'voc.reporter_replied',
      voc.id,
      {
        voc_id: voc.id,
        primary_managed_system_id: managedSystemId,
      },
      'VOC에 작성자 답변이 등록되었습니다.',
    );
    expect(notifications.jobs.map((job) => job.actor_id)).not.toContain(developer.id);
    expect(notifications.jobs.map((job) => job.actor_id)).not.toContain(user.id);
    expect(
      notifications.jobs.some((job) => JSON.stringify(job.detail).includes('reply text')),
    ).toBe(false);
  });

  it('deduplicates an admin owner and notifies admins only for a team-owned VOC', async () => {
    const adminOwnedVoc = await seedVoc({ ownerUserId: admin.id });
    const adminOwnerReply = await postReporterReply(app, reporter, adminOwnedVoc.id);
    expect(adminOwnerReply.statusCode).toBe(201);
    expect(notifications.jobs.map((job) => job.actor_id).sort()).toEqual(
      [admin.id, secondAdmin.id].sort(),
    );

    notifications.jobs.splice(0);
    const teamOwnedVoc = await seedVoc({ ownerTeamId: teamId });
    const teamReply = await postReporterReply(app, reporter, teamOwnedVoc.id);
    expect(teamReply.statusCode).toBe(201);
    expect(notifications.jobs.map((job) => job.actor_id).sort()).toEqual(
      [admin.id, secondAdmin.id].sort(),
    );
  });

  it.each([
    ['high', 'VOC 심각도가 높음으로 설정되었습니다.'],
    ['critical', 'VOC 심각도가 매우 높음으로 설정되었습니다.'],
  ] as const)(
    'notifies owner and admins when severity changes to %s',
    async (severity, summary) => {
      const voc = await seedVoc({ ownerUserId: owner.id });
      const response = await patchVoc(app, secondAdmin, voc.id, voc.updatedAt, { severity });
      expect(response.statusCode).toBe(200);
      expect(notifications.jobs.map((job) => job.actor_id).sort()).toEqual(
        [admin.id, secondAdmin.id, owner.id].sort(),
      );
      assertVocJob(
        'voc.severity_set_high_or_critical',
        voc.id,
        { voc_id: voc.id, primary_managed_system_id: managedSystemId },
        summary,
      );
    },
  );

  it('notifies the new owner and both admins when severity and ownership change together', async () => {
    const voc = await seedVoc({ ownerUserId: owner.id });
    const response = await patchVoc(app, secondAdmin, voc.id, voc.updatedAt, {
      owner_user_id: replacementOwner.id,
      severity: 'high',
    });
    expect(response.statusCode).toBe(200);
    const severityJobs = notifications.jobs.filter(
      (job) => job.event_type === 'voc.severity_set_high_or_critical',
    );
    expect(severityJobs.map((job) => job.actor_id).sort()).toEqual(
      [admin.id, secondAdmin.id, replacementOwner.id].sort(),
    );
    expect(severityJobs.map((job) => job.actor_id)).not.toContain(owner.id);
    const assignmentJobs = notifications.jobs.filter(
      (job) => job.event_type === 'voc.assigned_to_me',
    );
    expect(assignmentJobs.map((job) => job.actor_id)).toEqual([replacementOwner.id]);
    expect(notifications.jobs).toHaveLength(4);
    assertVocJob(
      'voc.severity_set_high_or_critical',
      voc.id,
      { voc_id: voc.id, primary_managed_system_id: managedSystemId },
      'VOC 심각도가 높음으로 설정되었습니다.',
    );
    assertVocJob(
      'voc.assigned_to_me',
      voc.id,
      { voc_id: voc.id, primary_managed_system_id: managedSystemId },
      'VOC 담당자로 지정되었습니다.',
    );
  });

  it.each([
    ['high', 'VOC 심각도가 높음으로 설정되었습니다.'],
    ['critical', 'VOC 심각도가 매우 높음으로 설정되었습니다.'],
  ] as const)(
    'notifies owner and admins when postponing with %s severity',
    async (severity, summary) => {
      const voc = await seedVoc({ ownerUserId: owner.id });
      const response = await patchVoc(app, secondAdmin, voc.id, voc.updatedAt, {
        postpone_review: true,
        severity,
      });
      expect(response.statusCode).toBe(200);
      expect(notifications.jobs.map((job) => job.actor_id).sort()).toEqual(
        [admin.id, secondAdmin.id, owner.id].sort(),
      );
      assertVocJob(
        'voc.severity_set_high_or_critical',
        voc.id,
        { voc_id: voc.id, primary_managed_system_id: managedSystemId },
        summary,
      );
    },
  );

  it('notifies the new owner and both admins when postponing with severity and ownership changes', async () => {
    const voc = await seedVoc({ ownerUserId: owner.id });
    const response = await patchVoc(app, secondAdmin, voc.id, voc.updatedAt, {
      postpone_review: true,
      owner_user_id: replacementOwner.id,
      severity: 'high',
    });
    expect(response.statusCode).toBe(200);
    const severityJobs = notifications.jobs.filter(
      (job) => job.event_type === 'voc.severity_set_high_or_critical',
    );
    expect(severityJobs.map((job) => job.actor_id).sort()).toEqual(
      [admin.id, secondAdmin.id, replacementOwner.id].sort(),
    );
    expect(severityJobs.map((job) => job.actor_id)).not.toContain(owner.id);
    const assignmentJobs = notifications.jobs.filter(
      (job) => job.event_type === 'voc.assigned_to_me',
    );
    expect(assignmentJobs.map((job) => job.actor_id)).toEqual([replacementOwner.id]);
    expect(notifications.jobs).toHaveLength(4);
    assertVocJob(
      'voc.severity_set_high_or_critical',
      voc.id,
      { voc_id: voc.id, primary_managed_system_id: managedSystemId },
      'VOC 심각도가 높음으로 설정되었습니다.',
    );
    assertVocJob(
      'voc.assigned_to_me',
      voc.id,
      { voc_id: voc.id, primary_managed_system_id: managedSystemId },
      'VOC 담당자로 지정되었습니다.',
    );
  });

  it('notifies the newly assigned owner when postponing an unowned VOC', async () => {
    const voc = await seedVoc();
    const response = await patchVoc(app, admin, voc.id, voc.updatedAt, {
      postpone_review: true,
      owner_user_id: owner.id,
    });
    expect(response.statusCode).toBe(200);
    expect(notifications.jobs.map((job) => job.actor_id)).toEqual([owner.id]);
    assertVocJob(
      'voc.assigned_to_me',
      voc.id,
      { voc_id: voc.id, primary_managed_system_id: managedSystemId },
      'VOC 담당자로 지정되었습니다.',
    );
  });

  it.each([
    {
      label: 'a low severity change',
      initialSeverity: undefined,
      patch: { postpone_review: true, severity: 'low' },
    },
    {
      label: 'unchanged high severity and owner',
      initialSeverity: 'high',
      patch: { postpone_review: true },
    },
  ] as const)('does not notify for $label when review is postponed', async (scenario) => {
    const voc = await seedVoc(
      scenario.initialSeverity === 'high' ? { ownerUserId: owner.id, severity: 'high' } : {},
    );
    const response = await patchVoc(app, admin, voc.id, voc.updatedAt, scenario.patch);
    expect(response.statusCode).toBe(200);
    expect(notifications.jobs).toHaveLength(0);
  });

  it.each([
    [null, 'low'],
    ['low', 'medium'],
    ['medium', null],
  ] as const)('does not notify when severity changes from %s to %s', async (from, to) => {
    const voc = await seedVoc({ ownerUserId: owner.id, ...(from ? { severity: from } : {}) });
    const response = await patchVoc(app, admin, voc.id, voc.updatedAt, { severity: to });
    expect(response.statusCode).toBe(200);
    expect(notifications.jobs).toHaveLength(0);
  });

  it('does not notify when severity is unchanged', async () => {
    const voc = await seedVoc({ ownerUserId: owner.id, severity: 'high' });
    const response = await patchVoc(app, admin, voc.id, voc.updatedAt, { severity: 'high' });
    expect(response.statusCode).toBe(200);
    expect(notifications.jobs).toHaveLength(0);
  });

  it('does not notify on an idempotent reporter-reply replay', async () => {
    const voc = await seedVoc({ ownerUserId: owner.id });
    const idempotencyKey = randomUUID();
    const first = await postReporterReply(app, reporter, voc.id, idempotencyKey);
    const replay = await postReporterReply(app, reporter, voc.id, idempotencyKey);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(notifications.jobs.map((job) => job.actor_id).sort()).toEqual(
      [admin.id, secondAdmin.id, owner.id].sort(),
    );
  });

  it('rolls back the owner change, audit row, and enqueued job when assignment enqueue fails', async () => {
    const voc = await seedVoc();
    const response = await patchVoc(rollbackApp, admin, voc.id, voc.updatedAt, {
      owner_user_id: owner.id,
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(response.statusCode).toBeLessThan(600);
    expect(failAfterEnqueue.attemptedPayloads).toHaveLength(1);
    const payload = failAfterEnqueue.attemptedPayloads[0];
    if (!payload) throw new Error('assignment rollback notification payload missing');
    expect((await getVocState(voc.id)).owner_user_id).toBeNull();
    const audits = await migrateHandle.pool.query(
      `select 1 from core.audit_log where subject_id = $1 and event_type = 'voc_owner_assigned'`,
      [voc.id],
    );
    expect(audits.rowCount).toBe(0);
    const jobs = await notificationJobCount(payload.correlation_id);
    expect(jobs).toBe(0);
  });

  it('rolls back the reporter reply, audit row, and enqueued job when reply enqueue fails', async () => {
    const voc = await seedVoc({ ownerUserId: owner.id });
    const response = await postReporterReply(rollbackApp, reporter, voc.id);
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(response.statusCode).toBeLessThan(600);
    expect(failAfterEnqueue.attemptedPayloads).toHaveLength(1);
    const payload = failAfterEnqueue.attemptedPayloads[0];
    if (!payload) throw new Error('reply rollback notification payload missing');
    const replies = await migrateHandle.pool.query(
      'select 1 from voc.voc_reporter_replies where voc_id = $1',
      [voc.id],
    );
    expect(replies.rowCount).toBe(0);
    const audits = await migrateHandle.pool.query(
      `select 1 from core.audit_log where subject_id = $1 and event_type = 'reporter_reply_created'`,
      [voc.id],
    );
    expect(audits.rowCount).toBe(0);
    expect(await notificationJobCount(payload.correlation_id)).toBe(0);
  });

  it('rolls back postponed severity, its audits, and its enqueued job when enqueue fails', async () => {
    const voc = await seedVoc({ ownerUserId: owner.id, severity: 'low' });
    const before = await getVocState(voc.id);
    const response = await patchVoc(rollbackApp, admin, voc.id, voc.updatedAt, {
      postpone_review: true,
      severity: 'high',
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(response.statusCode).toBeLessThan(600);
    expect(failAfterEnqueue.attemptedPayloads).toHaveLength(1);
    const payload = failAfterEnqueue.attemptedPayloads[0];
    if (!payload) throw new Error('severity rollback notification payload missing');
    expect(await getVocState(voc.id)).toMatchObject({
      severity: before.severity,
      owner_user_id: before.owner_user_id,
      triage_state: 'untriaged',
      triage_state_review_postponed_at: null,
    });
    const audits = await migrateHandle.pool.query(
      `select 1 from core.audit_log
        where subject_id = $1
          and event_type in ('voc_severity_set', 'voc_owner_assigned', 'voc_triage_postponed')`,
      [voc.id],
    );
    expect(audits.rowCount).toBe(0);
    expect(await notificationJobCount(payload.correlation_id)).toBe(0);
  });

  it('rolls back postponed ownership, its audits, and its enqueued job when enqueue fails', async () => {
    const voc = await seedVoc();
    const before = await getVocState(voc.id);
    const response = await patchVoc(rollbackApp, admin, voc.id, voc.updatedAt, {
      postpone_review: true,
      owner_user_id: owner.id,
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(response.statusCode).toBeLessThan(600);
    expect(failAfterEnqueue.attemptedPayloads).toHaveLength(1);
    const payload = failAfterEnqueue.attemptedPayloads[0];
    if (!payload) throw new Error('postponed assignment rollback notification payload missing');
    expect(await getVocState(voc.id)).toMatchObject({
      severity: before.severity,
      owner_user_id: before.owner_user_id,
      triage_state: 'untriaged',
      triage_state_review_postponed_at: null,
    });
    const audits = await migrateHandle.pool.query(
      `select 1 from core.audit_log
        where subject_id = $1
          and event_type in ('voc_severity_set', 'voc_owner_assigned', 'voc_triage_postponed')`,
      [voc.id],
    );
    expect(audits.rowCount).toBe(0);
    expect(await notificationJobCount(payload.correlation_id)).toBe(0);
  });

  async function notificationJobCount(correlationId: string): Promise<number> {
    const result = await migrateHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from pgboss.job
        where name = $1 and data ->> 'correlation_id' = $2`,
      [NOTIFICATION_DISPATCH_QUEUE, correlationId],
    );
    return result.rows[0]?.count ?? 0;
  }
});
