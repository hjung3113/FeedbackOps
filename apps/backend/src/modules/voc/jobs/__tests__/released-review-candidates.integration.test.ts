import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { initBoss, shutdownBoss } from '../../../../lib/jobs.js';
import { insertMsDirectly } from '../../../../test-support/core-fixtures.js';
import { createFailAfterEnqueueNotificationDispatcher } from '../../../../test-support/fail-after-enqueue-dispatcher.js';
import { uid } from '../../../../test-support/ids.js';
import { insertPublicUpdate, insertVocDirectly } from '../../../../test-support/voc-fixtures.js';
import { createAuditService } from '../../../core/audit/index.js';
import { createNotificationNotifier } from '../../../notifications/dispatcher.js';
import {
  NOTIFICATION_DISPATCH_QUEUE,
  createRecordingNotificationDispatcher,
} from '../../../notifications/port.js';
import { insertTaskRow } from '../../../../test-support/task-fixtures.js';
import { createPublicUpdateReviewCandidatesService } from '../../../voc/public-update-review-candidates/service.js';
import { releasedReviewCandidatesHandler } from '../released-review-candidates.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-release-candidate';

describe.skipIf(!runIntegration)('released Task review-candidate worker (#165)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;
  let ownerActorId: string;
  let assigneeActorId: string;
  let reporterActorId: string;
  let teamId: string;
  let boss: Awaited<ReturnType<typeof initBoss>>;
  let failAfterEnqueue: ReturnType<typeof createFailAfterEnqueueNotificationDispatcher>;
  const notifications = createRecordingNotificationDispatcher();
  const fixtureActorIds: string[] = [];

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    boss = await initBoss({
      connectionString: APP_URL,
      log: { info() {}, warn() {}, error() {} },
    });
    failAfterEnqueue = createFailAfterEnqueueNotificationDispatcher(boss);
    const actors = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    actorId = actors.rows[0]?.id ?? '';
    if (!actorId) throw new Error('seed admin actor not found');
    ownerActorId = await insertActor('user');
    assigneeActorId = await insertActor('user');
    reporterActorId = await insertActor('user');
    const team = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.teams (workspace_id, name) values ($1, $2) returning id',
      [WORKSPACE_ID, `${SLUG_PREFIX}-team-${randomUUID()}`],
    );
    teamId = team.rows[0]?.id ?? '';
    if (!teamId) throw new Error('release candidate test team seed failed');
  });
  beforeEach(async () => {
    await cleanup();
    notifications.jobs.splice(0);
  });
  afterAll(async () => {
    await cleanup();
    if (fixtureActorIds.length > 0) {
      await migrateHandle.pool.query(
        'delete from core.audit_log where actor_id = any($1::uuid[])',
        [fixtureActorIds],
      );
      await migrateHandle.pool.query('delete from core.actors where id = any($1::uuid[])', [
        fixtureActorIds,
      ]);
      fixtureActorIds.length = 0;
    }
    if (teamId) await migrateHandle.pool.query('delete from core.teams where id = $1', [teamId]);
    await shutdownBoss(boss).catch(() => {});
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup(): Promise<void> {
    if (!migrateHandle) return;
    const correlationIds = failAfterEnqueue?.attemptedPayloads.map(
      (payload) => payload.correlation_id,
    );
    if (correlationIds && correlationIds.length > 0) {
      await migrateHandle.pool.query(
        `delete from pgboss.job
          where name = $1 and data ->> 'correlation_id' = any($2::text[])`,
        [NOTIFICATION_DISPATCH_QUEUE, correlationIds],
      );
      failAfterEnqueue.attemptedPayloads.length = 0;
    }
    await migrateHandle.pool.query(
      `delete from core.audit_log where event_type = 'public_update_review_candidate_created' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from voc.public_update_review_candidates where workspace_id = $1`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links where workspace_id = $1 and managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks where workspace_id = $1 and primary_managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function insertActor(roleLevel: 'admin' | 'developer' | 'user'): Promise<string> {
    const externalId = `${SLUG_PREFIX}-${roleLevel}-${randomUUID()}`;
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, $4, 'internal_member') returning id`,
      [WORKSPACE_ID, externalId, `${randomUUID()}@example.test`, roleLevel],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`release candidate test ${roleLevel} actor seed failed`);
    fixtureActorIds.push(id);
    return id;
  }

  async function seedReleaseGraph(
    input: {
      ownerUserId?: string;
      ownerTeamId?: string;
      assigneeActorId?: string;
      reporterId?: string;
      triggeredByActorId?: string;
    } = {},
  ) {
    const msId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Release notification MS',
    );
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      assigneeActorId: input.assigneeActorId ?? null,
      createdBy: actorId,
    });
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      input.reporterId ?? reporterActorId,
      'Release notification VOC',
      input.ownerUserId ? { ownerUserId: input.ownerUserId } : {},
    );
    if (input.ownerTeamId) {
      await migrateHandle.pool.query('update voc.vocs set owner_team_id = $2 where id = $1', [
        voc.id,
        input.ownerTeamId,
      ]);
    }
    const link = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links
         (workspace_id, source_type, source_id, target_type, target_id, relation_type,
          visibility, status, managed_system_id, created_by)
       values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5)
       returning id`,
      [WORKSPACE_ID, voc.id, task.id, msId, actorId],
    );
    const entityLinkId = link.rows[0]?.id;
    if (!entityLinkId) throw new Error('release notification test entity link seed failed');
    return {
      taskId: task.id,
      vocId: voc.id,
      payload: {
        workspace_id: WORKSPACE_ID,
        task_id: task.id,
        release_event_id: randomUUID(),
        correlation_id: randomUUID(),
        triggered_by_actor_id: input.triggeredByActorId ?? actorId,
        linked_vocs: [{ voc_id: voc.id, entity_link_id: entityLinkId }],
      },
    };
  }

  it('boot migration pre-creates the release queue with ADR-0009 retry settings', async () => {
    const queue = await migrateHandle.pool.query<{
      retry_limit: number;
      retry_delay: number;
      retry_backoff: boolean;
    }>(
      `select retry_limit, retry_delay, retry_backoff
           from pgboss.queue
          where name = 'tasks.create_public_update_review_candidates'`,
    );
    expect(queue.rows).toEqual([{ retry_limit: 5, retry_delay: 30, retry_backoff: true }]);
  });

  it('inserts one candidate per VOC, is retry-safe after actioning, and never changes reporter conversation', async () => {
    const msId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Release candidate MS',
    );
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      assigneeActorId,
      createdBy: actorId,
    });
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      actorId,
      'Candidate VOC',
      { ownerUserId: ownerActorId },
    );
    const secondVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      actorId,
      'Second candidate VOC',
    );
    const link = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility, status, managed_system_id, created_by)
       values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5) returning id`,
      [WORKSPACE_ID, voc.id, task.id, msId, actorId],
    );
    const secondLink = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility, status, managed_system_id, created_by)
       values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5) returning id`,
      [WORKSPACE_ID, secondVoc.id, task.id, msId, actorId],
    );
    const before = await appHandle.pool.query<{
      reporter_facing_status: string;
      updates: string;
      reporter_replies: string;
    }>(
      `select reporter_facing_status,
                (select count(*)::text from voc.voc_public_updates where voc_id = $1) as updates,
                (select count(*)::text from voc.voc_reporter_replies where voc_id = $1) as reporter_replies
           from voc.vocs where id = $1`,
      [voc.id],
    );
    const handler = releasedReviewCandidatesHandler({
      publicUpdateReviewCandidatesService: createPublicUpdateReviewCandidatesService({
        db: appHandle.db,
        auditService: createAuditService(),
        notify: createNotificationNotifier(notifications),
      }),
    });
    const payload = {
      workspace_id: WORKSPACE_ID,
      task_id: task.id,
      release_event_id: randomUUID(),
      correlation_id: randomUUID(),
      triggered_by_actor_id: actorId,
      linked_vocs: [
        { voc_id: voc.id, entity_link_id: link.rows[0]!.id },
        { voc_id: secondVoc.id, entity_link_id: secondLink.rows[0]!.id },
      ],
    };
    await handler([{ data: payload }]);
    await handler([{ data: payload }]);
    const candidates = await migrateHandle.pool.query<{ id: string; voc_id: string }>(
      `select id, voc_id from voc.public_update_review_candidates where source_task_id = $1`,
      [task.id],
    );
    const audit = await appHandle.pool.query(
      `select * from core.audit_log where event_type = 'public_update_review_candidate_created' and subject_type = 'voc' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const after = await appHandle.pool.query<{
      reporter_facing_status: string;
      updates: string;
      reporter_replies: string;
    }>(
      `select reporter_facing_status,
                (select count(*)::text from voc.voc_public_updates where voc_id = $1) as updates,
                (select count(*)::text from voc.voc_reporter_replies where voc_id = $1) as reporter_replies
           from voc.vocs where id = $1`,
      [voc.id],
    );
    expect(candidates.rowCount).toBe(2);
    expect(notifications.jobs).toEqual([
      expect.objectContaining({
        actor_id: ownerActorId,
        event_type: 'task.released',
        subject_type: 'public_update_review_candidate',
        subject_id: candidates.rows.find((candidate) => candidate.voc_id === voc.id)?.id,
        summary: '연결된 VOC에 공개 업데이트 검토 요청이 등록되었습니다.',
        detail: { voc_id: voc.id, task_id: task.id },
        correlation_id: payload.correlation_id,
      }),
    ]);
    expect(audit.rowCount).toBe(2);
    expect(audit.rows[0]?.actor_id).toBe(actorId);
    expect(after.rows[0]).toEqual(before.rows[0]);

    // A new release cannot duplicate an unresolved obligation, but once a
    // reviewer terminalizes it, a later real release is a new obligation.
    const notificationsBeforeSkippedInsert = notifications.jobs.length;
    await handler([{ data: { ...payload, release_event_id: randomUUID() } }]);
    expect(notifications.jobs).toHaveLength(notificationsBeforeSkippedInsert);
    const stillPending = await appHandle.pool.query(
      `select 1 from voc.public_update_review_candidates where voc_id = $1`,
      [voc.id],
    );
    expect(stillPending.rowCount).toBe(1);
    await migrateHandle.pool.query(
      `update voc.public_update_review_candidates
            set status = 'dismissed', resolved_by_actor_id = $2, resolved_at = now(), dismissal_reason = 'Reviewed manually'
          where voc_id = $1`,
      [voc.id, actorId],
    );
    const dismissed = await migrateHandle.pool.query<{ id: string }>(
      `select id from voc.public_update_review_candidates
          where voc_id = $1 and status = 'dismissed'`,
      [voc.id],
    );
    const dismissedCandidateId = dismissed.rows[0]?.id;
    if (!dismissedCandidateId) throw new Error('dismissed candidate missing');
    const publicUpdateId = await insertPublicUpdate(migrateHandle, voc.id, actorId);
    // Exercise the immutable terminal row before creating a later pending
    // candidate, so the partial pending index cannot mask this guard.
    await expect(
      migrateHandle.pool.query(
        `update voc.public_update_review_candidates
              set status = 'pending', resolved_by_actor_id = null, resolved_at = null,
                  dismissal_reason = null, actioned_public_update_id = null
            where id = $1`,
        [dismissedCandidateId],
      ),
    ).rejects.toThrow(/terminal state is immutable/);
    await expect(
      migrateHandle.pool.query(
        `update voc.public_update_review_candidates
              set status = 'actioned', dismissal_reason = null,
                  actioned_public_update_id = $2
            where id = $1`,
        [dismissedCandidateId, publicUpdateId],
      ),
    ).rejects.toThrow(/terminal state is immutable/);
    await handler([{ data: { ...payload, release_event_id: randomUUID() } }]);
    const afterTerminal = await appHandle.pool.query(
      `select 1 from voc.public_update_review_candidates where voc_id = $1`,
      [voc.id],
    );
    expect(afterTerminal.rowCount).toBe(2);

    await migrateHandle.pool.query(
      `update voc.public_update_review_candidates
            set status = 'actioned', resolved_by_actor_id = $2, resolved_at = now(), actioned_public_update_id = $3
          where voc_id = $1 and status = 'pending'`,
      [secondVoc.id, actorId, publicUpdateId],
    );
    await handler([{ data: payload }]);
    const replayAfterActioned = await appHandle.pool.query(
      `select 1 from voc.public_update_review_candidates
          where source_task_id = $1 and release_event_id = $2`,
      [task.id, payload.release_event_id],
    );
    expect(replayAfterActioned.rowCount).toBe(2);

    await expect(
      migrateHandle.pool.query(
        `update voc.public_update_review_candidates
              set dismissal_reason = 'invalid while pending'
            where voc_id = $1 and status = 'pending'`,
        [voc.id],
      ),
    ).rejects.toThrow(/public_update_review_candidates_resolution_check/);
  });

  it.each([
    { label: 'releasing actor', releasingActor: true, taskAssignee: false, reporter: false },
    { label: 'Task assignee', releasingActor: false, taskAssignee: true, reporter: false },
    { label: 'Reporter', releasingActor: false, taskAssignee: false, reporter: true },
  ])('does not notify when the VOC owner is the $label', async (exclusion) => {
    const graph = await seedReleaseGraph({
      ownerUserId: ownerActorId,
      ...(exclusion.releasingActor ? { triggeredByActorId: ownerActorId } : {}),
      ...(exclusion.taskAssignee ? { assigneeActorId: ownerActorId } : {}),
      ...(exclusion.reporter ? { reporterId: ownerActorId } : {}),
    });
    const handler = releasedReviewCandidatesHandler({
      publicUpdateReviewCandidatesService: createPublicUpdateReviewCandidatesService({
        db: appHandle.db,
        auditService: createAuditService(),
        notify: createNotificationNotifier(notifications),
      }),
    });
    await handler([{ data: graph.payload }]);
    const candidates = await migrateHandle.pool.query(
      'select 1 from voc.public_update_review_candidates where source_task_id = $1 and voc_id = $2',
      [graph.taskId, graph.vocId],
    );
    expect(candidates.rowCount).toBe(1);
    expect(notifications.jobs).toHaveLength(0);
  });

  it('does not notify for a team-owned VOC', async () => {
    const graph = await seedReleaseGraph({ ownerTeamId: teamId });
    const handler = releasedReviewCandidatesHandler({
      publicUpdateReviewCandidatesService: createPublicUpdateReviewCandidatesService({
        db: appHandle.db,
        auditService: createAuditService(),
        notify: createNotificationNotifier(notifications),
      }),
    });
    await handler([{ data: graph.payload }]);
    const candidates = await migrateHandle.pool.query(
      'select 1 from voc.public_update_review_candidates where source_task_id = $1 and voc_id = $2',
      [graph.taskId, graph.vocId],
    );
    expect(candidates.rowCount).toBe(1);
    expect(notifications.jobs).toHaveLength(0);
  });

  it('rolls back the candidate and real pg-boss notification enqueue together', async () => {
    const graph = await seedReleaseGraph({ ownerUserId: ownerActorId });
    const service = createPublicUpdateReviewCandidatesService({
      db: appHandle.db,
      auditService: createAuditService(),
      notify: createNotificationNotifier(failAfterEnqueue.dispatcher),
    });

    await expect(service.createForReleasedTask(graph.payload)).rejects.toThrow(
      'notification enqueue failed after successful enqueue',
    );
    expect(failAfterEnqueue.attemptedPayloads).toHaveLength(1);
    const notification = failAfterEnqueue.attemptedPayloads[0];
    if (!notification) throw new Error('release rollback notification payload missing');
    expect(notification.event_type).toBe('task.released');

    const candidates = await migrateHandle.pool.query(
      'select 1 from voc.public_update_review_candidates where source_task_id = $1 and voc_id = $2',
      [graph.taskId, graph.vocId],
    );
    expect(candidates.rowCount).toBe(0);
    const audits = await migrateHandle.pool.query(
      `select 1 from core.audit_log
        where subject_id = $1 and event_type = 'public_update_review_candidate_created'`,
      [graph.vocId],
    );
    expect(audits.rowCount).toBe(0);
    const jobs = await migrateHandle.pool.query(
      `select 1 from pgboss.job
        where name = $1 and data ->> 'correlation_id' = $2`,
      [NOTIFICATION_DISPATCH_QUEUE, notification.correlation_id],
    );
    expect(jobs.rowCount).toBe(0);
  });
});
