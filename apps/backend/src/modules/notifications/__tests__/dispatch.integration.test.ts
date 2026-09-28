import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { initBoss, shutdownBoss } from '../../../lib/jobs.js';
import type { NotificationChannel, NotificationEmailEnvelope } from '../channels.js';
import { createNotificationNotifier } from '../dispatcher.js';
import { notificationDispatchHandler } from '../jobs/index.js';
import { type NotificationJobPayload, createPgBossNotificationDispatcher } from '../port.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TEST_PREFIX = `notification-dispatch-${randomUUID()}`;

describe.skipIf(!runIntegration)('notification dispatch integration', () => {
  let appDb: DbHandle;
  let migrateDb: DbHandle;
  let boss: Awaited<ReturnType<typeof initBoss>>;
  const actorIds: string[] = [];
  const actorEmails = new Map<string, string>();
  const correlationIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    boss = await initBoss({ connectionString: APP_URL, log: { info() {}, warn() {}, error() {} } });
    for (let index = 0; index < 2; index += 1) {
      const suffix = randomUUID();
      const externalId = `${TEST_PREFIX}-${suffix}`;
      const email = `${suffix}@example.test`;
      const inserted = await migrateDb.pool.query<{ id: string }>(
        `insert into core.actors
           (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $2, 'developer', 'internal_member')
         returning id`,
        [WORKSPACE_ID, externalId, email],
      );
      const actorId = inserted.rows[0]?.id;
      if (!actorId) throw new Error('notification test actor insert returned no id');
      actorIds.push(actorId);
      actorEmails.set(actorId, email);
    }
  });

  async function cleanupRows(): Promise<void> {
    if (!migrateDb) return;
    if (actorIds.length > 0) {
      await migrateDb.pool.query(
        'delete from core.notifications where actor_id = any($1::uuid[])',
        [actorIds],
      );
    }
    if (correlationIds.length > 0) {
      await migrateDb.pool.query(
        `delete from pgboss.job_common
          where name = 'notifications.dispatch'
            and data ->> 'correlation_id' = any($1::text[])`,
        [correlationIds],
      );
    }
  }

  afterEach(cleanupRows);

  afterAll(async () => {
    await cleanupRows();
    await shutdownBoss(boss).catch(() => {});
    if (actorIds.length > 0) {
      await migrateDb.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    }
    await appDb?.close();
    await migrateDb?.close();
  });

  function notificationPayload(
    eventType: NotificationJobPayload['event_type'],
    actorId = actorIds[0] ?? '',
  ): NotificationJobPayload {
    const correlationId = randomUUID();
    correlationIds.push(correlationId);
    return {
      workspace_id: WORKSPACE_ID,
      actor_id: actorId,
      event_type: eventType,
      subject_type: eventType.startsWith('task_request.')
        ? 'task_request'
        : eventType.startsWith('task.')
          ? eventType === 'task.released'
            ? 'public_update_review_candidate'
            : 'task'
          : eventType.startsWith('permission_request.')
            ? 'permission_request'
            : 'voc',
      subject_id: randomUUID(),
      summary:
        eventType === 'task_request.rejected'
          ? '작업 요청이 반려되었습니다.'
          : eventType === 'task_request.needs_more_evidence'
            ? '작업 요청에 추가 근거가 필요합니다.'
            : eventType === 'permission_request.decided'
              ? '권한 요청이 승인되었습니다.'
              : '작업 담당자로 지정되었습니다.',
      detail: { source: 'integration-test' },
      correlation_id: correlationId,
    };
  }

  it('enqueues one transactional job per recipient and leaves no jobs on rollback', async () => {
    const notify = createNotificationNotifier(createPgBossNotificationDispatcher(boss));
    const rolledBack = notificationPayload('task_request.needs_more_evidence');
    await expect(
      appDb.db.transaction(async (tx) => {
        await notify(tx, 'task_request.needs_more_evidence', {
          workspace_id: WORKSPACE_ID,
          actor_ids: [actorIds[0] ?? '', actorIds[1] ?? ''],
          subject_id: rolledBack.subject_id,
          correlation_id: rolledBack.correlation_id,
          detail: rolledBack.detail,
          params: {},
        });
        throw new Error('rollback notification enqueue');
      }),
    ).rejects.toThrow('rollback notification enqueue');

    const afterRollback = await migrateDb.pool.query(
      `select data from pgboss.job_common
        where name = 'notifications.dispatch' and data ->> 'correlation_id' = $1`,
      [rolledBack.correlation_id],
    );
    expect(afterRollback.rowCount).toBe(0);

    const committed = notificationPayload('task_request.needs_more_evidence');
    await appDb.db.transaction(async (tx) => {
      await notify(tx, 'task_request.needs_more_evidence', {
        workspace_id: WORKSPACE_ID,
        actor_ids: [actorIds[0] ?? '', actorIds[1] ?? ''],
        subject_id: committed.subject_id,
        correlation_id: committed.correlation_id,
        detail: committed.detail,
        params: {},
      });
    });
    const jobs = await migrateDb.pool.query<{ data: NotificationJobPayload }>(
      `select data from pgboss.job_common
        where name = 'notifications.dispatch' and data ->> 'correlation_id' = $1
        order by created_on`,
      [committed.correlation_id],
    );
    expect(jobs.rows).toHaveLength(2);
    expect(jobs.rows.map((row) => row.data.actor_id).sort()).toEqual([...actorIds].sort());
    expect(jobs.rows[0]?.data).toMatchObject({
      workspace_id: WORKSPACE_ID,
      event_type: 'task_request.needs_more_evidence',
      subject_type: 'task_request',
      subject_id: committed.subject_id,
      summary: '작업 요청에 추가 근거가 필요합니다.',
      detail: committed.detail,
      correlation_id: committed.correlation_id,
    });

    const empty = notificationPayload('task_request.needs_more_evidence');
    await appDb.db.transaction(async (tx) => {
      await notify(tx, 'task_request.needs_more_evidence', {
        workspace_id: WORKSPACE_ID,
        actor_ids: [],
        subject_id: empty.subject_id,
        correlation_id: empty.correlation_id,
        params: {},
      });
    });
    const emptyJobs = await migrateDb.pool.query(
      `select 1 from pgboss.job_common
        where name = 'notifications.dispatch' and data ->> 'correlation_id' = $1`,
      [empty.correlation_id],
    );
    expect(emptyJobs.rowCount).toBe(0);
  });

  it('deduplicates in-app rows and claims an email channel only once', async () => {
    const payload = notificationPayload('task_request.rejected');
    const sent: NotificationEmailEnvelope[] = [];
    const channel: NotificationChannel = { send: async (envelope) => void sent.push(envelope) };
    const handler = notificationDispatchHandler({ db: appDb.db, channel });

    await handler([{ data: payload }]);
    await handler([{ data: payload }]);

    const rows = await migrateDb.pool.query<{ email_sent_at: Date | null }>(
      `select email_sent_at from core.notifications
        where workspace_id = $1 and actor_id = $2 and event_type = $3
          and subject_id = $4 and correlation_id = $5`,
      [
        WORKSPACE_ID,
        payload.actor_id,
        payload.event_type,
        payload.subject_id,
        payload.correlation_id,
      ],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.email_sent_at).toBeInstanceOf(Date);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      actor_id: payload.actor_id,
      recipient_email: actorEmails.get(payload.actor_id),
      event_type: 'task_request.rejected',
      in_app: true,
      email: true,
    });
  });

  it('rolls back inbox and email claim when send fails, then allows a successful retry', async () => {
    const payload = notificationPayload('permission_request.decided');
    const failingHandler = notificationDispatchHandler({
      db: appDb.db,
      channel: {
        send: async () => {
          throw new Error('channel unavailable');
        },
      },
    });
    await expect(failingHandler([{ data: payload }])).rejects.toThrow('channel unavailable');

    const afterFailure = await migrateDb.pool.query(
      `select 1 from core.notifications
        where workspace_id = $1 and actor_id = $2 and event_type = $3
          and subject_id = $4 and correlation_id = $5`,
      [
        WORKSPACE_ID,
        payload.actor_id,
        payload.event_type,
        payload.subject_id,
        payload.correlation_id,
      ],
    );
    expect(afterFailure.rowCount).toBe(0);

    const sent: NotificationEmailEnvelope[] = [];
    const successfulHandler = notificationDispatchHandler({
      db: appDb.db,
      channel: { send: async (envelope) => void sent.push(envelope) },
    });
    await successfulHandler([{ data: payload }]);
    const afterRetry = await migrateDb.pool.query<{ email_sent_at: Date | null }>(
      `select email_sent_at from core.notifications
        where workspace_id = $1 and actor_id = $2 and event_type = $3
          and subject_id = $4 and correlation_id = $5`,
      [
        WORKSPACE_ID,
        payload.actor_id,
        payload.event_type,
        payload.subject_id,
        payload.correlation_id,
      ],
    );
    expect(afterRetry.rows).toHaveLength(1);
    expect(afterRetry.rows[0]?.email_sent_at).toBeInstanceOf(Date);
    expect(sent).toHaveLength(1);
  });

  it('persists email-disabled events without calling the channel or setting a claim', async () => {
    const payload = notificationPayload('task.assigned_to_me');
    const sent: NotificationEmailEnvelope[] = [];
    const handler = notificationDispatchHandler({
      db: appDb.db,
      channel: { send: async (envelope) => void sent.push(envelope) },
    });

    await handler([{ data: payload }]);
    const rows = await migrateDb.pool.query<{ email_sent_at: Date | null }>(
      `select email_sent_at from core.notifications
        where workspace_id = $1 and actor_id = $2 and event_type = $3
          and subject_id = $4 and correlation_id = $5`,
      [
        WORKSPACE_ID,
        payload.actor_id,
        payload.event_type,
        payload.subject_id,
        payload.correlation_id,
      ],
    );
    expect(rows.rows).toEqual([{ email_sent_at: null }]);
    expect(sent).toEqual([]);
  });
});
