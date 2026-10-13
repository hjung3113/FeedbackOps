import { type DashboardSummary, recoveryDetailSchema, recoveryHistorySchema, recoveryListSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitForRecoveryCommandWaiters } from '../../../test-support/recovery-command-barrier.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { recoveryIdentity } from '../identity.js';
import { reconcileRecoveryPage } from '../jobs/index.js';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { randomUUID, uid } from '../../../test-support/ids.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertTaskRequestRow } from '../../../test-support/task-fixtures.js';
import { insertTaskRow } from '../../../test-support/task-fixtures.js';
import {
  insertVocClusterMemberRow,
  insertVocClusterRow,
} from '../../../test-support/voc-cluster-fixtures.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { createDashboardService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-dashboard-217';

type Summary = DashboardSummary;
type Seed = { msA: string; msB: string; devCookie: string; devActorId: string };
type QueueId = Summary['action_queues'][number]['id'];
type CoverageId = Summary['coverage'][number]['id'];
type SystemCoverageId =
  | 'voc-task'
  | 'finding-execution'
  | 'high-followup'
  | 'released-update'
  | 'analytics-area';
type CoverageCell = {
  value: number;
  total: number;
  percent: number;
  status: 'good' | 'warn' | 'bad' | 'no_data';
};
type SystemKpis = NonNullable<Summary['by_managed_system'][number]['kpis']>;
type SystemRow = {
  managed_system_id: string;
  kpis?: SystemKpis;
  coverage?: Partial<Record<SystemCoverageId, CoverageCell>>;
  action_queues?: Partial<Record<QueueId, number>>;
  analytics_areas?: Array<{
    analytics_area_id: string;
    coverage?: Partial<Record<'voc-task' | 'high-followup', CoverageCell>>;
    action_queues?: Partial<Record<'unassigned-voc' | 'high-severity-unlinked', number>>;
  }>;
};

const queue = (body: Summary, id: QueueId) => body.action_queues.find((entry) => entry.id === id);
const coverage = (body: Summary, id: CoverageId) => body.coverage.find((entry) => entry.id === id);
const systemRows = (body: Summary): SystemRow[] => body.by_managed_system as SystemRow[];
const systemRow = (body: Summary, managedSystemId: string) =>
  systemRows(body).find((row) => row.managed_system_id === managedSystemId);

function expectDelta(
  after: number | undefined,
  before: number | undefined,
  seeded: number,
  label: string,
) {
  expect(after, `${label} after`).toBeTypeOf('number');
  expect(before, `${label} before`).toBeTypeOf('number');
  expect(after! - before!).toBe(seeded);
}

function expectQueueDelta(after: Summary, before: Summary, id: QueueId, seeded: number) {
  expectDelta(queue(after, id)?.count, queue(before, id)?.count, seeded, id);
}

function expectCoverageDelta(
  after: Summary,
  before: Summary,
  id: CoverageId,
  value: number,
  total: number,
) {
  const afterEntry = coverage(after, id);
  const beforeEntry = coverage(before, id);
  expectDelta(afterEntry?.value, beforeEntry?.value, value, `${id}.value`);
  expectDelta(afterEntry?.total, beforeEntry?.total, total, `${id}.total`);
  expect(afterEntry?.percent).toBe(
    afterEntry ? Math.round((afterEntry.value / afterEntry.total) * 100) : undefined,
  );
}

describe.skipIf(!runIntegration)('GET /dashboard/summary (#217)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterActorId: string;
  let initialRecoveryTokens: string[] = [];

  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const get = (cookie: string, selector = 'all') =>
    app.inject({
      method: 'GET',
      url: `/dashboard/summary?managed_system_id=${selector}`,
      headers: headers(cookie),
    });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    initialRecoveryTokens=(await migrateHandle.pool.query<{recovery_item_id:string}>('SELECT recovery_item_id FROM dashboard.recovery_identities WHERE workspace_id=$1::uuid',[WORKSPACE_ID])).rows.map(r=>r.recovery_item_id);
    app = await buildServer({ config: loadConfig(), dbHandle, recoveryClock: () => new Date('2026-10-13T12:00:00.000Z') });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id from core.actors
        where workspace_id = $1 and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((actor) => actor.external_id === 'mock-admin-1')?.id ?? '';
    reporterActorId = actors.rows.find((actor) => actor.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !reporterActorId) throw new Error('seed actors not found');
  });

  beforeEach(async () => cleanupFixtures());

  beforeEach(async () => {
    await migrateHandle.pool.query('delete from core.rate_limits');
  });

  afterAll(async () => {
    await cleanupFixtures();
    for(const table of ['recovery_history','recovery_presentations','recovery_identities']) {
      await migrateHandle.pool.query(`DELETE FROM dashboard.${table} WHERE workspace_id=$1::uuid AND NOT (recovery_item_id=ANY($2::text[]))`,[WORKSPACE_ID,initialRecoveryTokens]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(`delete from core.responsibility_default_failures
      where workspace_id=$1 and managed_system_id in
        (select id from core.managed_systems where workspace_id=$1 and slug like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    const systems = 'select id from core.managed_systems where workspace_id = $1 and slug like $2';
    for (const table of ['recovery_history','recovery_presentations','recovery_identities']) {
      await migrateHandle.pool.query(`DELETE FROM dashboard.${table} p WHERE p.workspace_id=$1::uuid
        AND p.recovery_item_id IN (SELECT i.recovery_item_id FROM dashboard.recovery_identities i
          WHERE i.workspace_id=$1::uuid AND (i.managed_system_id IN (${systems}) OR
          (i.category='permission-requests-pending' AND i.source_id IN (SELECT id FROM permission.permission_requests WHERE workspace_id=$1::uuid AND reason LIKE $2))))`,
        [WORKSPACE_ID,`${SLUG_PREFIX}%`]);
    }
    for (const table of ['outcome_recovery_history','outcome_recovery_presentations','outcome_recovery_identities']) {
      await migrateHandle.pool.query(`DELETE FROM survey.${table} WHERE workspace_id=$1::uuid AND outcome_recovery_item_id::uuid IN (
        SELECT r.id FROM survey.survey_responses r JOIN survey.surveys s ON s.id=r.survey_id AND s.workspace_id=r.workspace_id
        WHERE s.workspace_id=$1::uuid AND s.primary_managed_system_id IN (${systems}))`,[WORKSPACE_ID,`${SLUG_PREFIX}%`]);
    }

    await migrateHandle.pool.query(
      `delete from core.entity_links where managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers where survey_id in (select id from survey.surveys where primary_managed_system_id in (${systems}))`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_responses where survey_id in (select id from survey.surveys where primary_managed_system_id in (${systems}))`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_questions where survey_id in (select id from survey.surveys where primary_managed_system_id in (${systems}))`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.surveys where primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks where primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task_request.task_requests where primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from finding.findings where primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_requests where workspace_id = $1 and reason like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_cluster_members where cluster_id in (select id from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id in (${systems}))`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc.vocs where primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_grants where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)',
      [WORKSPACE_ID, 'mock-dev-read-dashboard-217%'],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants where actor_id = $1 and managed_system_id in (
        select id from core.managed_systems where workspace_id = $2 and slug like $3
      )`,
      [reporterActorId, WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.rate_limits where key in (select id::text from core.actors where workspace_id = $1 and external_id like $2)',
      [WORKSPACE_ID, 'mock-dev-read-dashboard-217%'],
    );
    await migrateHandle.pool.query(
      'delete from core.sessions where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)',
      [WORKSPACE_ID, 'mock-dev-read-dashboard-217%'],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_denies where actor_id = $1 and managed_system_id in (
        select id from core.managed_systems where workspace_id = $2 and slug like $3
      )`,
      [adminActorId, WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.audit_log where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)',
      [WORKSPACE_ID, 'mock-dev-read-dashboard-217%'],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_denies where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)',
      [WORKSPACE_ID, 'mock-dev-read-dashboard-217%'],
    );
    await migrateHandle.pool.query(
      'delete from core.idempotency_keys where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)',
      [WORKSPACE_ID, 'mock-dev-read-dashboard-217%'],
    );
    await migrateHandle.pool.query(
      'delete from core.actors where workspace_id = $1 and external_id like $2',
      [WORKSPACE_ID, 'mock-dev-read-dashboard-217%'],
    );
    await migrateHandle.pool.query(
      `delete from core.analytics_areas where managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function createDashboardScope(): Promise<Seed> {
    const msA = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${SLUG_PREFIX}-${uid('a')}`,
      'Dashboard A',
    );
    const msB = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${SLUG_PREFIX}-${uid('b')}`,
      'Dashboard B',
    );
    const dev = await insertDevActor(migrateHandle, WORKSPACE_ID, `dashboard-217-${uid('scope')}`);
    for (const capability of ['voc.read', 'finding.read', 'finding.manage', 'survey.read']) {
      await grantCapability(migrateHandle, WORKSPACE_ID, dev.id, capability, msA, adminActorId);
    }
    return { msA, msB, devCookie: await loginAs(app, dev.externalId), devActorId: dev.id };
  }

  async function seedDashboard(seed: Seed): Promise<void> {
    const { msA, msB } = seed;
    const vocsA = await seedVocs(msA, 10, 6, 4, 3);
    const vocsB = await seedVocs(msB, 7, 5, 3, 3);
    // Two high VOCs have a backing link: one Task link and one Finding link.
    const linkedTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msA,
      status: 'done',
      createdBy: adminActorId,
      title: 'linked VOC task',
    });
    await link('voc', vocsA.high[0]!, 'task', linkedTask.id, 'evidence_of', msA);
    await link(
      'voc',
      vocsB.high[0]!,
      'finding',
      (
        await insertFindingRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: msB,
          sourceId: vocsB.all[0]!,
          status: 'draft',
          createdBy: adminActorId,
        })
      ).id,
      'created_finding',
      msB,
    );

    await seedFindings(msA, vocsA.all[0]!, 7, 2);
    await seedFindings(msB, vocsB.all[0]!, 5, 2);
    const releasedA = await seedTasks(msA, vocsA.all, 9, 4, 2);
    const releasedB = await seedTasks(msB, vocsB.all, 5, 3, 2);
    // One linked VOC has a reporter-visible update. A skip row proves that a
    // status transition without public content does not count as coverage.
    await seedPublicUpdate(releasedA[0]!, false);
    await seedPublicUpdate(releasedB[0]!, true);
    await seedRequests(msA, vocsA.all[0]!, 6);
    await seedRequests(msB, vocsB.all[0]!, 4);
    await seedSurveyGaps(msA, 4);
    await seedSurveyGaps(msB, 2);
    for (let index = 0; index < 9; index += 1) {
      await migrateHandle.pool.query(
        `insert into permission.permission_requests (workspace_id, requester_actor_id, requested_capability, reason, status)
         values ($1, $2, $3, $4, 'pending')`,
        [
          WORKSPACE_ID,
          adminActorId,
          `dashboard.review.${index}`,
          `${SLUG_PREFIX} pending ${index}`,
        ],
      );
    }
  }

  async function seedVocs(
    msId: string,
    total: number,
    unassigned: number,
    high: number,
    analytics: number,
  ) {
    const all: string[] = [];
    const highIds: string[] = [];
    for (let index = 0; index < total; index += 1) {
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        msId,
        reporterActorId,
        `dashboard voc ${msId} ${index}`,
        {
          severity: index < high ? 'high' : 'low',
          ...(index < unassigned ? {} : { ownerUserId: adminActorId }),
        },
      );
      all.push(voc.id);
      if (index < high) highIds.push(voc.id);
      if (index < analytics)
        await migrateHandle.pool.query('update voc.vocs set analytics_area_id = $1 where id = $2', [
          await analyticsArea(msId),
          voc.id,
        ]);
    }
    return { all, high: highIds };
  }

  const analyticsAreas = new Map<string, string>();
  async function analyticsArea(msId: string) {
    const saved = analyticsAreas.get(msId);
    if (saved) return saved;
    const result = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.analytics_areas (workspace_id, managed_system_id, slug, name) values ($1, $2, $3, $4) returning id',
      [WORKSPACE_ID, msId, uid('dashboard-aa'), 'Dashboard area'],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('analytics area seed failed');
    analyticsAreas.set(msId, id);
    return id;
  }

  async function link(
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string,
    relationType: string,
    msId: string,
  ) {
    await migrateHandle.pool.query(
      `insert into core.entity_links (workspace_id, source_type, source_id, target_type, target_id, relation_type, managed_system_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [WORKSPACE_ID, sourceType, sourceId, targetType, targetId, relationType, msId, adminActorId],
    );
  }

  async function seedFindings(msId: string, sourceId: string, total: number, executed: number) {
    for (let index = 0; index < total; index += 1) {
      const finding = await insertFindingRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        sourceId,
        status: 'active',
        createdBy: adminActorId,
        title: `dashboard finding ${msId} ${index}`,
      });
      if (index < executed)
        await migrateHandle.pool.query(
          'update finding.findings set linked_task_id = $1 where id = $2',
          [
            (
              await insertTaskRow(migrateHandle, {
                workspaceId: WORKSPACE_ID,
                primaryManagedSystemId: msId,
                status: 'done',
                createdBy: adminActorId,
              })
            ).id,
            finding.id,
          ],
        );
    }
  }

  async function seedTasks(
    msId: string,
    vocIds: string[],
    inFlight: number,
    released: number,
    unresolved: number,
  ) {
    const linkedVocIds: string[] = [];
    for (let index = 0; index < inFlight; index += 1)
      await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        status: 'todo',
        createdBy: adminActorId,
      });
    for (let index = 0; index < released; index += 1) {
      const task = await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        status: 'released',
        createdBy: adminActorId,
      });
      if (index < unresolved) {
        const vocId = vocIds[vocIds.length - 1 - index]!;
        await link('voc', vocId, 'task', task.id, 'evidence_of', msId);
        linkedVocIds.push(vocId);
      }
    }
    return linkedVocIds;
  }

  async function seedPublicUpdate(vocId: string, skipped: boolean) {
    await migrateHandle.pool.query(
      `insert into voc.voc_public_updates (
        voc_id, actor_id, body_rich_content, reporter_facing_status_before,
        reporter_facing_status_after, skip_public_update, skip_reason
      ) values ($1, $2, $3::jsonb, 'received', $4, $5, $6)`,
      [
        vocId,
        adminActorId,
        skipped ? null : JSON.stringify({ type: 'doc', content: [] }),
        skipped ? 'reviewing' : 'received',
        skipped,
        skipped ? 'No reporter-visible update is needed for this fixture.' : null,
      ],
    );
  }

  async function seedRequests(msId: string, sourceId: string, total: number) {
    for (let index = 0; index < total; index += 1)
      await insertTaskRequestRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        sourceId,
        requesterActorId: adminActorId,
      });
  }

  async function seedSurveyGaps(msId: string, total: number) {
    // 0052 predicate (ADR-0055): only CLOSED outcome surveys whose cohort
    // meets the workspace anonymity threshold count, with low-band ratings.
    // One survey per call; `total` poor responses plus high-band filler up to
    // the threshold, so the queue delta still equals `total`.
    const settings = await migrateHandle.pool.query<{ threshold: number }>(
      'select coalesce(max(survey_anonymity_threshold), 5)::int as threshold from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    const threshold = settings.rows[0]?.threshold ?? 5;
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id, display_id, type, status, title, primary_managed_system_id, operator_actor_id, responses_identity_protected, created_by, opened_at, closed_at) values ($1, $2, 'outcome', 'closed', $3, $4, $5, true, $5, now(), now()) returning id`,
      [
        WORKSPACE_ID,
        `SRV-${uid('dashboard')}`,
        `dashboard outcome ${total}-${uid('dashboard')}`,
        msId,
        adminActorId,
      ],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('survey seed failed');
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, is_required, rating_min, rating_max, sort_order, branch_depth) values ($1, $2, 'rating', 'Outcome', false, 1, 5, 0, 0) returning id`,
      [WORKSPACE_ID, surveyId],
    );
    const questionId = question.rows[0]?.id;
    if (!questionId) throw new Error('question seed failed');
    const respondents = total + Math.max(0, threshold - total);
    for (let index = 0; index < respondents; index += 1) {
      // Distinct respondent per response (unique per survey); the external_id
      // prefix keeps cleanupFixtures' existing actor delete in scope.
      const respondent = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $2, 'user', 'internal_member') returning id`,
        [
          WORKSPACE_ID,
          `mock-dev-read-dashboard-217-respondent-${uid('dashboard')}`,
          `respondent-${uid('dashboard')}@example.test`,
        ],
      );
      const response = await migrateHandle.pool.query<{ id: string }>(
        'insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at) values ($1, $2, $3, true, now()) returning id',
        [WORKSPACE_ID, surveyId, respondent.rows[0]?.id],
      );
      // 1-5 low band is 1-2: poor responses rate 1, filler rates 5.
      await migrateHandle.pool.query(
        `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value) values ($1, $2, $3, $4, 'rating', $5::jsonb)`,
        [
          WORKSPACE_ID,
          surveyId,
          response.rows[0]?.id,
          questionId,
          JSON.stringify(index < total ? 1 : 5),
        ],
      );
    }
  }

  it('returns distinct, non-zero admin counts with all rendered queue and coverage metadata', async () => {
    const before = (await get(adminCookie)).json<Summary>();
    const seed = await createDashboardScope();
    await seedDashboard(seed);
    const beforeAudit = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.audit_log where actor_id = $1',
      [adminActorId],
    );
    const response = await get(adminCookie);
    const body = response.json<Summary>();
    const afterAudit = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.audit_log where actor_id = $1',
      [adminActorId],
    );

    expect(response.statusCode).toBe(200);
    expect(afterAudit.rows[0]?.count).toBe(beforeAudit.rows[0]?.count);
    expectDelta(body.kpis.open_voc, before.kpis.open_voc, 17, 'open_voc');
    expectDelta(body.kpis.active_finding, before.kpis.active_finding, 12, 'active_finding');
    expectDelta(body.kpis.pending_request, before.kpis.pending_request, 19, 'pending_request');
    expectDelta(body.kpis.tasks_in_flight, before.kpis.tasks_in_flight, 14, 'tasks_in_flight');
    expect(body.kpis.coverage_percent).toBe(coverage(body, 'voc-task')?.percent);
    expect(systemRow(body, seed.msA)?.kpis).toEqual({
      open_voc: 10,
      active_finding: 7,
      tasks_in_flight: 9,
      coverage_percent: 30,
    });
    expect(systemRow(body, seed.msB)?.kpis).toEqual({
      open_voc: 7,
      active_finding: 5,
      tasks_in_flight: 5,
      coverage_percent: 29,
    });
    expect(queue(body, 'unassigned-voc')).toMatchObject({
      severity: 'urgent',
      next_action: { route: '/vocs?view=inbox&tab=unassigned' },
    });
    expect(queue(body, 'high-severity-unlinked')).toMatchObject({
      severity: 'urgent',
      next_action: { route: '/vocs?view=inbox&tab=high-no-link' },
    });
    expect(queue(body, 'actionable-finding-no-execution')).toMatchObject({
      severity: 'warn',
      next_action: { route: '/findings' },
    });
    expect(queue(body, 'released-task-unresolved-voc')).toMatchObject({
      severity: 'warn',
      next_action: { route: '/tasks?view=board' },
    });
    expect(queue(body, 'bad-outcome-no-followup')).toMatchObject({
      severity: 'urgent',
      next_action: { route: '/surveys' },
    });
    expect(queue(body, 'permission-requests-pending')).toMatchObject({
      severity: 'info',
      next_action: { route: '/admin/permissions/requests' },
    });
    expectQueueDelta(body, before, 'unassigned-voc', 11);
    expectQueueDelta(body, before, 'high-severity-unlinked', 5);
    expectQueueDelta(body, before, 'actionable-finding-no-execution', 8);
    expectQueueDelta(body, before, 'released-task-unresolved-voc', 4);
    expectQueueDelta(body, before, 'bad-outcome-no-followup', 6);
    expectQueueDelta(body, before, 'permission-requests-pending', 9);
    expectCoverageDelta(body, before, 'voc-task', 5, 17);
    expectCoverageDelta(body, before, 'finding-execution', 4, 12);
    expectCoverageDelta(body, before, 'high-followup', 2, 7);
    expectCoverageDelta(body, before, 'released-update', 1, 4);
    expectCoverageDelta(body, before, 'analytics-area', 6, 17);
    expect(body.coverage.map((entry) => entry.id)).not.toContain('milestone-outcome');
    expect(coverage(body, 'milestone-outcome')).toBeUndefined();
    expect(systemRow(body, seed.msA)?.coverage?.['voc-task']?.total).toBe(10);
    expect(systemRow(body, seed.msB)?.coverage?.['voc-task']?.total).toBe(7);
    expect(
      systemRows(body).reduce((sum, row) => sum + (row.coverage?.['voc-task']?.total ?? 0), 0),
    ).toBe(body.kpis.open_voc);
    expect(
      systemRows(body).reduce(
        (sum, row) => sum + (row.action_queues?.['high-severity-unlinked'] ?? 0),
        0,
      ),
    ).toBe(queue(body, 'high-severity-unlinked')?.count);
    // The workspace-level queue stays on the rollup only; the schema admits
    // the row key, the service must never emit it (#513 N6 risk).
    expect(
      systemRows(body).every(
        (row) => row.action_queues?.['permission-requests-pending'] === undefined,
      ),
    ).toBe(true);
    expect(seed.msA).not.toBe(seed.msB);
  });

  it('pins grouped VOC counts for every Managed System and Analytics Area', async () => {
    const before = (await get(adminCookie)).json<Summary>();
    const seed = await createDashboardScope();
    const createArea = async (managedSystemId: string, name: string) => {
      const result = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
         values ($1, $2, $3, $4) returning id`,
        [WORKSPACE_ID, managedSystemId, uid('dashboard-grouped-area'), name],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error('analytics area seed failed');
      return id;
    };
    const [areaA1, areaA2, areaB1, areaB2] = await Promise.all([
      createArea(seed.msA, 'Dashboard A one'),
      createArea(seed.msA, 'Dashboard A two'),
      createArea(seed.msB, 'Dashboard B one'),
      createArea(seed.msB, 'Dashboard B two'),
    ]);
    const createVoc = async (
      managedSystemId: string,
      analyticsAreaId: string | null,
      title: string,
      severity: 'low' | 'high' | 'critical',
      assigned: boolean,
    ) => {
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        managedSystemId,
        reporterActorId,
        title,
        { severity, ...(assigned ? { ownerUserId: adminActorId } : {}) },
      );
      if (analyticsAreaId !== null) {
        await migrateHandle.pool.query('update voc.vocs set analytics_area_id = $1 where id = $2', [
          analyticsAreaId,
          voc.id,
        ]);
      }
      return voc.id;
    };

    await createVoc(seed.msA, areaA1, 'A1 high unassigned', 'high', false);
    const vocA1Task = await createVoc(seed.msA, areaA1, 'A1 task assigned', 'low', true);
    const vocA2High = await createVoc(seed.msA, areaA2, 'A2 high task', 'high', true);
    await createVoc(seed.msA, areaA2, 'A2 unassigned', 'low', false);
    await createVoc(seed.msA, null, 'A without area', 'low', false);
    await createVoc(seed.msB, areaB1, 'B1 high unlinked', 'high', true);
    const vocB1Task = await createVoc(seed.msB, areaB1, 'B1 task assigned', 'low', true);
    await createVoc(seed.msB, areaB2, 'B2 critical unassigned', 'critical', false);
    const vocB2Task = await createVoc(seed.msB, areaB2, 'B2 task unassigned', 'low', false);
    await createVoc(seed.msB, null, 'B without area', 'low', true);
    const taskA = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      createdBy: adminActorId,
      title: 'Dashboard A grouped task',
    });
    const taskB = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msB,
      createdBy: adminActorId,
      title: 'Dashboard B grouped task',
    });
    await link('voc', vocA1Task, 'task', taskA.id, 'evidence_of', seed.msA);
    await link('voc', vocA2High, 'task', taskA.id, 'evidence_of', seed.msA);
    await link('voc', vocB1Task, 'task', taskB.id, 'evidence_of', seed.msB);
    await link('voc', vocB2Task, 'task', taskB.id, 'evidence_of', seed.msB);

    const body = (await get(adminCookie)).json<Summary>();
    expectDelta(body.kpis.open_voc, before.kpis.open_voc, 10, 'grouped open_voc');
    expectQueueDelta(body, before, 'unassigned-voc', 5);
    expectQueueDelta(body, before, 'high-severity-unlinked', 3);
    expectCoverageDelta(body, before, 'voc-task', 4, 10);
    expectCoverageDelta(body, before, 'analytics-area', 8, 10);
    expectCoverageDelta(body, before, 'high-followup', 1, 4);

    const rowA = systemRow(body, seed.msA);
    const rowB = systemRow(body, seed.msB);
    expect(rowA).toMatchObject({
      kpis: { open_voc: 5, coverage_percent: 40 },
      coverage: {
        'voc-task': { value: 2, total: 5, percent: 40 },
        'analytics-area': { value: 4, total: 5, percent: 80 },
        'high-followup': { value: 1, total: 2, percent: 50 },
      },
      action_queues: { 'unassigned-voc': 3, 'high-severity-unlinked': 1 },
    });
    expect(rowB).toMatchObject({
      kpis: { open_voc: 5, coverage_percent: 40 },
      coverage: {
        'voc-task': { value: 2, total: 5, percent: 40 },
        'analytics-area': { value: 4, total: 5, percent: 80 },
        'high-followup': { value: 0, total: 2, percent: 0 },
      },
      action_queues: { 'unassigned-voc': 2, 'high-severity-unlinked': 2 },
    });
    expect(rowA?.analytics_areas?.map((area) => area.analytics_area_id)).toEqual(
      [areaA1, areaA2].sort(),
    );
    expect(rowB?.analytics_areas?.map((area) => area.analytics_area_id)).toEqual(
      [areaB1, areaB2].sort(),
    );

    const expectArea = (
      row: SystemRow | undefined,
      analyticsAreaId: string,
      counts: {
        task: number;
        highFollowup: number;
        highTotal: number;
        unassigned: number;
        highUnlinked: number;
      },
    ) => {
      expect(row?.analytics_areas).toHaveLength(2);
      expect(
        row?.analytics_areas?.find((area) => area.analytics_area_id === analyticsAreaId),
      ).toMatchObject({
        coverage: {
          'voc-task': { value: counts.task, total: 2, percent: counts.task * 50 },
          'high-followup': {
            value: counts.highFollowup,
            total: counts.highTotal,
            percent:
              counts.highTotal === 0
                ? 0
                : Math.round((counts.highFollowup / counts.highTotal) * 100),
          },
        },
        action_queues: {
          'unassigned-voc': counts.unassigned,
          'high-severity-unlinked': counts.highUnlinked,
        },
      });
    };
    expectArea(rowA, areaA1, {
      task: 1,
      highFollowup: 0,
      highTotal: 1,
      unassigned: 1,
      highUnlinked: 1,
    });
    expectArea(rowA, areaA2, {
      task: 1,
      highFollowup: 1,
      highTotal: 1,
      unassigned: 1,
      highUnlinked: 0,
    });
    expectArea(rowB, areaB1, {
      task: 1,
      highFollowup: 0,
      highTotal: 1,
      unassigned: 0,
      highUnlinked: 1,
    });
    expectArea(rowB, areaB2, {
      task: 1,
      highFollowup: 0,
      highTotal: 1,
      unassigned: 2,
      highUnlinked: 1,
    });
  });

  it('keeps bad-outcome-no-followup present at zero for an admin with no outcome surveys', async () => {
    const surveys = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from survey.surveys where workspace_id = $1',
      [WORKSPACE_ID],
    );
    const seed = await createDashboardScope();
    await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'admin empty survey row',
    );
    const response = await get(adminCookie);
    const body = response.json<Summary>();

    expect(surveys.rows[0]?.count).toBe('0');
    expect(response.statusCode).toBe(200);
    expect(queue(body, 'bad-outcome-no-followup')).toMatchObject({ count: 0 });
    expect(systemRow(body, seed.msA)?.action_queues?.['bad-outcome-no-followup']).toBe(0);
    expect(systemRows(body).length).toBeGreaterThan(0);
    expect(
      systemRows(body).every((row) => row.action_queues?.['bad-outcome-no-followup'] === 0),
    ).toBe(true);
  });

  it('keeps an admin-denied survey system row but omits its bad-outcome-no-followup', async () => {
    const seed = await createDashboardScope();
    await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msB,
      reporterActorId,
      'admin denied survey row VOC',
    );
    await seedSurveyGaps(seed.msB, 2);
    await denyCapability(
      migrateHandle,
      WORKSPACE_ID,
      adminActorId,
      'survey.read',
      seed.msB,
      adminActorId,
    );

    const body = (await get(adminCookie)).json<Summary>();
    const rowB = systemRow(body, seed.msB);

    expect(rowB).toBeDefined();
    expect(rowB?.coverage).toHaveProperty('voc-task');
    expect(rowB?.action_queues).not.toHaveProperty('bad-outcome-no-followup');
    expect(systemRow(body, seed.msA)?.action_queues?.['bad-outcome-no-followup']).toBe(0);
  });
  function required<T>(value: T | undefined | null): T {
    if (value == null) throw new Error('expected recovery fixture');
    return value;
  }
  const recoveryList = async (cookie: string, query = '') => {
    const response = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items?${query}`,
      headers: headers(cookie),
    });
    expect(response.statusCode).toBe(200);
    return recoveryListSchema.parse(response.json());
  };
  const recoveryDetail = (cookie: string, id: string) =>
    app.inject({ method: 'GET', url: `/dashboard/recovery-items/${id}`, headers: headers(cookie) });

  it('hides only for the session Actor before discovery without reducing operational totals', async () => {
    const seed = await createDashboardScope();
    const { id: vocId } = await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, 'personal hiding');
    const query = `category=unassigned-voc&managed_system_id=${seed.msA}`;
    const before = await recoveryList(seed.devCookie, query);
    const item = required(before.items.find((row) => row.source?.id === vocId));
    expect(item.occurrence).toBeNull();
    const sourceAudits=async()=>(await migrateHandle.pool.query('SELECT id FROM core.audit_log WHERE workspace_id=$1::uuid AND subject_id=$2::uuid ORDER BY id',[WORKSPACE_ID,vocId])).rows;
    const auditsBefore=await sourceAudits();
    const summary = (await get(adminCookie, seed.msA)).json<Summary>();
    const otherBefore = await recoveryList(adminCookie, query);
    for (const extra of [
      { actor_id: adminActorId }, { owner_actor_id: adminActorId }, { resolution: 'resolved' },
    ]) {
      const rejected = await app.inject({ method: 'PATCH',
        url: `/dashboard/recovery-items/${item.recovery_item_id}/presentation`,
        headers: headers(seed.devCookie), payload: { action: 'mute', ...extra } });
      expect(rejected.statusCode).toBe(422);
      expect(rejected.json().code).toBe('validation.failed');
    }
    const querySpoof = await app.inject({method:'PATCH',url:`/dashboard/recovery-items/${item.recovery_item_id}/presentation?actor_id=${adminActorId}`,headers:headers(seed.devCookie),payload:{action:'mute'}});
    expect(querySpoof.statusCode).toBe(422);
    expect(querySpoof.json().code).toBe('validation.failed');
    expect((await dbHandle.pool.query('SELECT occurrence FROM dashboard.recovery_identities WHERE workspace_id=$1::uuid AND recovery_item_id=$2',[WORKSPACE_ID,item.recovery_item_id])).rows).toEqual([]);
    expect((await recoveryList(seed.devCookie, query)).total).toBe(before.total);
    const muted = await app.inject({ method: 'PATCH',
      url: `/dashboard/recovery-items/${item.recovery_item_id}/presentation`,
      headers: headers(seed.devCookie), payload: { action: 'mute' } });
    expect(muted.statusCode).toBe(200);
    const visible = await recoveryList(seed.devCookie, query);
    const hidden = await recoveryList(seed.devCookie, `${query}&presentation=hidden`);
    expect(visible.items.some((row) => row.source?.id === vocId)).toBe(false);
    expect(hidden.items.map((row) => row.source?.id)).toContain(vocId);
    expect(visible.visible_total + visible.hidden_total).toBe(before.total);
    expect(visible.hidden_total).toBe(1);
    expect((await recoveryList(adminCookie, query)).items).toEqual(otherBefore.items.map((row) =>
      row.source?.id === vocId ? { ...row, occurrence: 1 } : row));
    expectQueueDelta((await get(adminCookie, seed.msA)).json<Summary>(), summary, 'unassigned-voc', 0);
    const restored = await app.inject({ method: 'PATCH',
      url: `/dashboard/recovery-items/${item.recovery_item_id}/presentation`,
      headers: headers(seed.devCookie), payload: { action: 'restore' } });
    expect(restored.statusCode).toBe(200);
    expect(await sourceAudits()).toEqual(auditsBefore);
    expect((await recoveryList(seed.devCookie, query)).total).toBe(before.total);
  });

  it('fills visible pages after hidden leading rows and binds presentation into cursors', async () => {
    const seed = await createDashboardScope();
    for (const title of ['Page one', 'Page two', 'Page three'])
      await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, title);
    const query = `category=unassigned-voc&managed_system_id=${seed.msA}&limit=1`;
    const first = await recoveryList(seed.devCookie, query);
    const leading = required(first.items[0]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/dashboard/recovery-items/${leading.recovery_item_id}/presentation`,
          headers: headers(seed.devCookie),
          payload: { action: 'mute' },
        })
      ).statusCode,
    ).toBe(200);
    const visible = await recoveryList(seed.devCookie, query);
    expect(visible.items).toHaveLength(1);
    expect(visible.items[0]?.recovery_item_id).not.toBe(leading.recovery_item_id);
    expect(visible).toMatchObject({
      total: 2,
      visible_total: 2,
      hidden_total: 1,
      page: { has_more: true },
    });
    const second = await recoveryList(seed.devCookie, `${query}&cursor=${visible.page.cursor}`);
    expect(second.items).toHaveLength(1);
    expect(second.page.has_more).toBe(false);
    expect(new Set([...visible.items, ...second.items].map((r) => r.recovery_item_id)).size).toBe(2);
    const incompatible = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items?${query}&presentation=hidden&cursor=${visible.page.cursor}`,
      headers: headers(seed.devCookie),
    });
    expect(incompatible.statusCode).toBe(422);
    expect(incompatible.json().detail.fields).toContainEqual({
      path: ['cursor'],
      code: 'invalid_cursor',
    });
    const hidden = await recoveryList(seed.devCookie, `${query}&presentation=hidden`);
    expect(hidden.total).toBe(1);
    expect(hidden.items[0]?.recovery_item_id).toBe(leading.recovery_item_id);
  });

  it('records a first repair before discovery, replay/no-op and reopen without a scan', async () => {
    const seed = await createDashboardScope();
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'voc.triage',
      seed.msA,
      adminActorId,
    );
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'transactional recovery',
    );
    const token = recoveryIdentity('unassigned-voc', voc.id);
    const stamp = async () =>
      new Date(
        (
          await migrateHandle.pool.query<{ updated_at: Date }>(
            'SELECT updated_at FROM voc.vocs WHERE id=$1::uuid',
            [voc.id],
          )
        ).rows[0]!.updated_at,
      ).toISOString();
    const patch = async (payload: Record<string, unknown>, key = randomUUID(), match?: string) =>
      app.inject({
        method: 'PATCH',
        url: `/vocs/${voc.id}`,
        headers: {
          ...headers(seed.devCookie),
          'idempotency-key': key,
          'if-match': match ?? (await stamp()),
        },
        payload,
      });
    const history = async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/dashboard/recovery-history?category=unassigned-voc&managed_system_id=${seed.msA}`,
        headers: headers(seed.devCookie),
      });
      expect(response.statusCode).toBe(200);
      return recoveryHistorySchema.parse(response.json());
    };
    const key = randomUUID();
    const match = await stamp();
    const repaired = await patch({ owner_user_id: adminActorId }, key, match);
    expect(repaired.statusCode).toBe(200);
    expect((await history()).items.map((h) => h.occurrence)).toEqual([1]);
    expect((await patch({ owner_user_id: adminActorId }, key, match)).json()).toEqual(repaired.json());
    expect((await patch({ owner_user_id: adminActorId })).statusCode).toBe(200);
    expect((await history()).total).toBe(1);
    expect((await patch({ owner_user_id: null })).statusCode).toBe(200);
    for (const cookie of [seed.devCookie, adminCookie]) {
      const hidden = await app.inject({
        method: 'PATCH',
        url: `/dashboard/recovery-items/${token}/presentation`,
        headers: headers(cookie),
        payload: { action: 'mute' },
      });
      expect(hidden.statusCode).toBe(200);
      expect(hidden.json().occurrence).toBe(2);
    }
    expect((await patch({ owner_user_id: adminActorId })).statusCode).toBe(200);
    expect((await patch({ owner_user_id: null })).statusCode).toBe(200);
    for (const cookie of [seed.devCookie, adminCookie]) {
      const detail = await recoveryDetail(cookie, token);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        state: 'active',
        occurrence: 3,
        presentation: { state: 'visible', snoozed_until: null },
      });
    }
    expect((await history()).items.map((h) => h.occurrence)).toEqual([2, 1]);
    const invalid = await patch({ owner_user_id: adminActorId, owner_team_id: randomUUID() });
    expect(invalid.statusCode).toBe(422);
    expect((await history()).total).toBe(2);
    const stale = await app.inject({
      method: 'PATCH',
      url: `/dashboard/recovery-items/${token}/presentation`,
      headers: headers(seed.devCookie),
      payload: { action: 'snooze', days: 7 },
    });
    expect(stale.statusCode).toBe(200);
    const denied = await denyCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'voc.read',
      seed.msA,
      adminActorId,
    );
    try {
      expect((await recoveryDetail(seed.devCookie, token)).statusCode).toBe(404);
      const deniedHistory = await history();
      expect(deniedHistory.items).toEqual([]);
      expect(deniedHistory.total).toBe(0);
      expect(JSON.stringify(deniedHistory)).not.toContain(voc.id);
      expect(JSON.stringify(deniedHistory)).not.toContain('transactional recovery');
    } finally {
      await migrateHandle.pool.query('DELETE FROM permission.permission_denies WHERE id=$1::uuid', [
        denied,
      ]);
    }
  });

  it('serializes two first personal PATCHes with a real repair and reconciliation',async()=>{
    const seed=await createDashboardScope();
    await grantCapability(migrateHandle,WORKSPACE_ID,seed.devActorId,'voc.triage',seed.msA,adminActorId);
    const voc=await insertVocDirectly(migrateHandle,WORKSPACE_ID,seed.msA,reporterActorId,'Concurrent recovery');
    const token=recoveryIdentity('unassigned-voc',voc.id);
    const changes=await Promise.all([seed.devCookie,adminCookie].map(cookie=>app.inject({method:'PATCH',url:`/dashboard/recovery-items/${token}/presentation`,headers:headers(cookie),payload:{action:'mute'}})));
    expect(changes.map(r=>r.statusCode)).toEqual([200,200]);expect(changes.map(r=>r.json().occurrence)).toEqual([1,1]);
    const stamp=(await migrateHandle.pool.query<{updated_at:Date}>('SELECT updated_at FROM voc.vocs WHERE id=$1::uuid',[voc.id])).rows[0]!.updated_at.toISOString();
    const [repair]=await Promise.all([
      app.inject({method:'PATCH',url:`/vocs/${voc.id}`,headers:{...headers(seed.devCookie),'idempotency-key':randomUUID(),'if-match':stamp},payload:{owner_user_id:adminActorId}}),
      reconcileRecoveryPage({db:dbHandle.db},{workspace_id:WORKSPACE_ID,correlation_id:randomUUID()}),
    ]);
    expect(repair.statusCode).toBe(200);
    const history = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-history?category=unassigned-voc&managed_system_id=${seed.msA}`,
      headers: headers(seed.devCookie),
    });
    expect(recoveryHistorySchema.parse(history.json()).items.map(h=>h.occurrence)).toEqual([1]);
    expect((await app.inject({method:'PATCH',url:`/dashboard/recovery-items/${token}/presentation`,headers:headers(seed.devCookie),payload:{action:'mute'}})).statusCode).toBe(409);
    const absent=await insertVocDirectly(migrateHandle,WORKSPACE_ID,seed.msA,reporterActorId,'Absent restore');
    const address=recoveryIdentity('unassigned-voc',absent.id);
    expect((await app.inject({method:'PATCH',url:`/dashboard/recovery-items/${address}/presentation`,headers:headers(seed.devCookie),payload:{action:'restore'}})).json().occurrence).toBeNull();
    const stored=await dbHandle.pool.query('SELECT occurrence FROM dashboard.recovery_identities WHERE workspace_id=$1::uuid AND recovery_item_id=$2',[WORKSPACE_ID,address]);
    expect(stored.rows).toEqual([]);
  });

  it('records Task Request repair immediately through createFromFinding HTTP and not on replay', async () => {
    const seed = await createDashboardScope();
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      sourceId: randomUUID(),
      createdBy: adminActorId,
      status: 'active',
    });
    const key = randomUUID();
    const command = () =>
      app.inject({
        method: 'POST',
        url: `/findings/${finding.id}/request-task`,
        headers: { ...headers(seed.devCookie), 'idempotency-key': key },
        payload: {
          evidence_summary: 'Evidence',
          requested_outcome: 'Repair',
          assigned_reviewer_actor_id: adminActorId,
        },
      });
    const history = async () =>
      (
        await app.inject({
          method: 'GET',
          url: `/dashboard/recovery-history?category=actionable-finding-no-execution&managed_system_id=${seed.msA}`,
          headers: headers(seed.devCookie),
        })
      ).json();
    const first = await command();
    expect(first.statusCode).toBe(201);
    const repaired = await history();
    expect(repaired.total).toBe(1);
    expect(repaired.items[0]).toMatchObject({
      occurrence: 1,
      resolution: { outcome: 'resolved', evidence: 'command', action: 'createFromFinding' },
    });
    expect(repaired.items[0].item.source.id).toBe(finding.id);
    const replay = await command();
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect((await history()).items).toEqual(repaired.items);
  });

  it.each(['patch', 'evidence-link'] as const)(
    'serializes two Findings sharing a VOC: PATCH vs %s without a lock cycle',
    async (secondCommand) => {
      const seed = await createDashboardScope();
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        seed.msA,
        reporterActorId,
        'Shared Finding evidence',
      );
      const findings = [];
      for (const title of ['First shared Finding', 'Second shared Finding']) {
        const finding = await insertFindingRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: seed.msA,
          sourceId: voc.id,
          createdBy: adminActorId,
          title,
        });
        const link = await app.inject({
          method: 'POST',
          url: `/findings/${finding.id}/link-evidence`,
          headers: headers(seed.devCookie),
          payload: { source_type: 'voc', source_id: voc.id },
        });
        expect(link.statusCode).toBe(201);
        const read = await app.inject({
          method: 'GET',
          url: `/findings/${finding.id}`,
          headers: headers(seed.devCookie),
        });
        expect(read.statusCode).toBe(200);
        findings.push(read.json<{ id: string; updated_at: string }>());
      }
      const [firstFinding, secondFinding] = findings;
      if (!firstFinding || !secondFinding) throw new Error('missing shared Finding fixtures');
      const patch = (finding: { id: string; updated_at: string }) =>
        app
          .inject({
            method: 'PATCH',
            url: `/findings/${finding.id}`,
            headers: {
              ...headers(seed.devCookie),
              'idempotency-key': randomUUID(),
              'if-match': finding.updated_at,
            },
            payload: { status: 'active' },
          })
          .then((r) => r);
      const blocker = await dbHandle.pool.connect();
      let first: ReturnType<typeof patch> | undefined;
      let second: ReturnType<typeof patch> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('recovery-command:' || $1,0))",
          [WORKSPACE_ID],
        );
        first = patch(firstFinding);
        await waitForRecoveryCommandWaiters(migrateHandle, WORKSPACE_ID, 1, first);
        second =
          secondCommand === 'patch'
            ? patch(secondFinding)
            : app
                .inject({
                  method: 'POST',
                  url: `/findings/${secondFinding.id}/link-evidence`,
                  headers: headers(seed.devCookie),
                  payload: { source_type: 'voc', source_id: voc.id },
                })
                .then((r) => r);
        // Both are live and queued. Moving serialization after own-Finding locks
        // makes each hold a different row here and deadlock when released.
        await waitForRecoveryCommandWaiters(migrateHandle, WORKSPACE_ID, 2, second);
        await blocker.query('COMMIT');
        const [a, b] = await Promise.all([first, second]);
        expect(a.body).not.toContain('40P01');
        expect(b.body).not.toContain('40P01');
        expect(a.statusCode).toBe(200);
        // The evidence-link variant re-links an existing tuple, so the owner returns 200 (no-op).
        expect(b.statusCode).toBe(200);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled([first, second].filter((p) => p !== undefined));
      }
    },
  );

  it('records shipped evidence repair then detach reopens and clears prior hiding without a scan', async () => {
    const seed = await createDashboardScope();
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'Evidence repair',
    );
    await migrateHandle.pool.query("UPDATE voc.vocs SET severity='high' WHERE id=$1::uuid", [voc.id]);
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      sourceId: randomUUID(),
      createdBy: adminActorId,
    });
    const token = recoveryIdentity('high-severity-unlinked', voc.id);
    const mute = await app.inject({
      method: 'PATCH',
      url: `/dashboard/recovery-items/${token}/presentation`,
      headers: headers(seed.devCookie),
      payload: { action: 'mute' },
    });
    expect(mute.statusCode).toBe(200);
    const linked = await app.inject({
      method: 'POST',
      url: `/findings/${finding.id}/link-evidence`,
      headers: headers(seed.devCookie),
      payload: { source_type: 'voc', source_id: voc.id },
    });
    expect(linked.statusCode).toBe(201);
    const history = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-history?category=high-severity-unlinked&managed_system_id=${seed.msA}`,
      headers: headers(seed.devCookie),
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().total).toBe(1);
    expect(history.json().items[0]).toMatchObject({
      occurrence: 1,
      resolution: { outcome: 'resolved', evidence: 'command', action: 'linkEvidence' },
    });
    const detached = await app.inject({
      method: 'PATCH',
      url: `/entity-links/${linked.json().id}`,
      headers: headers(seed.devCookie),
      payload: { reason: 'Reopen evidence gap' },
    });
    expect(detached.statusCode).toBe(200);
    const reopened = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items/${token}`,
      headers: headers(seed.devCookie),
    });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({
      occurrence: 2,
      presentation: { state: 'visible', snoozed_until: null },
    });
  });

  it('uses an inclusive UTC calendar boundary before count/LIMIT and preserves append-only role grants', async () => {
    const seed = await createDashboardScope();
    for (const [time, title] of [
      ['2026-08-01T00:00:00Z', 'included boundary'],
      ['2026-08-01T00:00:00Z', 'included tie'],
      ['2026-07-31T23:59:59.999999Z', 'excluded boundary'],
    ] as const) {
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        seed.msA,
        reporterActorId,
        title,
      );
      const token = recoveryIdentity('unassigned-voc', voc.id);
      await dbHandle.pool.query(
        `INSERT INTO dashboard.recovery_identities(workspace_id,recovery_item_id,category,source_id,managed_system_id,occurrence,state)
                VALUES($1::uuid,$2,'unassigned-voc',$3::uuid,$4::uuid,1,'resolved')`,
        [WORKSPACE_ID, token, voc.id, seed.msA],
      );
      await dbHandle.pool.query(
        `INSERT INTO dashboard.recovery_history(workspace_id,recovery_item_id,occurrence,resolved_at,outcome,evidence,action,actor_id)
                VALUES($1::uuid,$2,1,$3::timestamptz,'resolved','command','fixture',$4::uuid)`,
        [WORKSPACE_ID, token, time, adminActorId],
      );
    }
    const response = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-history?category=unassigned-voc&managed_system_id=${seed.msA}&limit=1`,
      headers: headers(seed.devCookie),
    });
    expect(response.statusCode).toBe(200);
    const body = recoveryHistorySchema.parse(response.json());
    expect(body.window_start).toBe('2026-08-01T00:00:00.000Z');
    expect(body.total).toBe(2);
    expect(body.page.has_more).toBe(true);
    const second = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-history?category=unassigned-voc&managed_system_id=${seed.msA}&limit=1&cursor=${body.page.cursor}`,
      headers: headers(seed.devCookie),
    });
    expect(second.statusCode).toBe(200);
    const page2 = recoveryHistorySchema.parse(second.json());
    expect(page2.total).toBe(2);
    expect(page2.page.has_more).toBe(false);
    expect(new Set([body.items[0]?.id, page2.items[0]?.id]).size).toBe(2);
    expect([body.items[0]?.item.source?.title, page2.items[0]?.item.source?.title].sort()).toEqual([
      'included boundary',
      'included tie',
    ]);
    await expect(
      dbHandle.pool.query(
        'UPDATE dashboard.recovery_history SET action=action WHERE workspace_id=$1::uuid',
        [WORKSPACE_ID],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      dbHandle.pool.query('DELETE FROM dashboard.recovery_history WHERE workspace_id=$1::uuid', [
        WORKSPACE_ID,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('reconciles idempotently across restart without inventing past repairs',async()=>{
    const seed=await createDashboardScope();
    const voc=await insertVocDirectly(migrateHandle,WORKSPACE_ID,seed.msA,reporterActorId,'discovery restart');
    const token=recoveryIdentity('unassigned-voc',voc.id);
    const run=async()=>{let after: {category:string;sourceId:string}|undefined;
      do {after=(await reconcileRecoveryPage({db:dbHandle.db},{workspace_id:WORKSPACE_ID,correlation_id:randomUUID(),...(after?{after}:{})})).next;}while(after);
    };
    await run();expect((await recoveryDetail(seed.devCookie,token)).json().occurrence).toBe(1);
    await migrateHandle.pool.query('UPDATE voc.vocs SET archived_at=now() WHERE id=$1::uuid',[voc.id]);
    await run();await run();
    const response=await app.inject({method:'GET',url:`/dashboard/recovery-history?category=unassigned-voc&managed_system_id=${seed.msA}`,headers:headers(seed.devCookie)});
    expect(response.statusCode).toBe(200);const body=recoveryHistorySchema.parse(response.json());expect(body.total).toBe(1);
    expect(body.items[0]?.resolution).toMatchObject({outcome:'withdrawn',evidence:'observation',action:null});
    expect((await recoveryDetail(seed.devCookie,token)).json().state).toBe('withdrawn');
  });

  it('uses owner grains for every operational category and the safe Survey exception', async () => {
    const seed = await createDashboardScope();
    await seedDashboard(seed);
    const summary = (await get(adminCookie, seed.msA)).json<Summary>();
    for (const category of [
      'unassigned-voc',
      'high-severity-unlinked',
      'actionable-finding-no-execution',
      'released-task-unresolved-voc',
      'permission-requests-pending',
    ] as const) {
      const page = await recoveryList(
        adminCookie,
        `category=${category}&managed_system_id=${seed.msA}`,
      );
      expect(page.total, category).toBe(queue(summary, category)?.count);
      expect(page.items).toHaveLength(page.total);
      expect(new Set(page.items.map((item) => item.recovery_item_id)).size).toBe(page.total);
    }
    const surveys = await recoveryList(
      adminCookie,
      `category=bad-outcome-no-followup&managed_system_id=${seed.msA}`,
    );
    expect(queue(summary, 'bad-outcome-no-followup')?.count).toBe(4);
    expect(surveys.total).toBe(1);
    expect(surveys.items[0]?.source?.type).toBe('survey');
    expect(surveys.items[0]?.next_actions).toEqual([]); // Admin has no personal grant.
    expect(JSON.stringify(surveys)).not.toMatch(
      /response_id|answer_value|respondent|response_count/,
    );
    const detail = await recoveryDetail(adminCookie, required(surveys.items[0]).recovery_item_id);
    expect(detail.statusCode).toBe(200);
    expect(recoveryDetailSchema.parse(detail.json()).next_actions).toEqual([]);
  });

  it('returns live resolved/withdrawn selections and rechecks revocation without GET writes', async () => {
    const seed = await createDashboardScope();
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'recoverable VOC',
    );
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'voc.triage',
      seed.msA,
      adminActorId,
    );
    const list = await recoveryList(
      seed.devCookie,
      `category=unassigned-voc&managed_system_id=${seed.msA}&view=actionable`,
    );
    const item = required(list.items.find((row) => row.source?.id === voc.id));
    expect(item.next_actions).toContainEqual(
      expect.objectContaining({ availability: 'available', id: 'triage' }),
    );
    const snapshot = async () =>
      (
        await migrateHandle.pool.query(
          `SELECT jsonb_build_object(
      'voc', (SELECT jsonb_agg(v ORDER BY id) FROM voc.vocs v WHERE workspace_id = $1::uuid),
      'finding', (SELECT jsonb_agg(f ORDER BY id) FROM finding.findings f WHERE workspace_id = $1::uuid),
      'task', (SELECT jsonb_agg(t ORDER BY id) FROM task.tasks t WHERE workspace_id = $1::uuid),
      'survey', (SELECT jsonb_agg(s ORDER BY id) FROM survey.surveys s WHERE workspace_id = $1::uuid),
      'permission', (SELECT jsonb_agg(p ORDER BY id) FROM permission.permission_requests p WHERE workspace_id = $1::uuid),
      'idempotency', (SELECT jsonb_agg(i ORDER BY actor_id, key) FROM core.idempotency_keys i WHERE actor_id IN (SELECT id FROM core.actors WHERE workspace_id = $1::uuid)),
      'public_updates', (SELECT jsonb_agg(u ORDER BY id) FROM voc.voc_public_updates u WHERE voc_id IN (SELECT id FROM voc.vocs WHERE workspace_id = $1::uuid)),
      'links', (SELECT jsonb_agg(l ORDER BY id) FROM core.entity_links l WHERE workspace_id = $1::uuid),
      'recovery_identities', (SELECT jsonb_agg(i ORDER BY recovery_item_id) FROM dashboard.recovery_identities i WHERE workspace_id=$1::uuid),
      'recovery_history', (SELECT jsonb_agg(h ORDER BY id) FROM dashboard.recovery_history h WHERE workspace_id=$1::uuid),
      'recovery_presentations', (SELECT jsonb_agg(p ORDER BY recovery_item_id,actor_id,occurrence) FROM dashboard.recovery_presentations p WHERE workspace_id=$1::uuid),
      'outcome_identities', (SELECT jsonb_agg(i ORDER BY outcome_recovery_item_id) FROM survey.outcome_recovery_identities i WHERE workspace_id=$1::uuid),
      'outcome_history', (SELECT jsonb_agg(h ORDER BY id) FROM survey.outcome_recovery_history h WHERE workspace_id=$1::uuid),
      'outcome_presentations', (SELECT jsonb_agg(p ORDER BY outcome_recovery_item_id,actor_id,occurrence) FROM survey.outcome_recovery_presentations p WHERE workspace_id=$1::uuid),
      'audit', (SELECT jsonb_agg(a ORDER BY id) FROM core.audit_log a WHERE workspace_id = $1::uuid)
    ) AS state`,
          [WORKSPACE_ID],
        )
      ).rows[0]?.state;
    const before = await snapshot();
    await recoveryList(seed.devCookie);
    expect((await recoveryDetail(seed.devCookie, item.recovery_item_id)).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/dashboard/recovery-history',headers:headers(seed.devCookie)})).statusCode).toBe(200);
    expect(await snapshot()).toEqual(before); // infrastructure rate-limit writes excluded.
    const repaired = await app.inject({
      method: 'PATCH',
      url: `/vocs/${voc.id}`,
      headers: {
        ...headers(seed.devCookie),
        'if-match': new Date(voc.updated_at).toISOString(),
        'idempotency-key': randomUUID(),
      },
      payload: { owner_user_id: seed.devActorId },
    });
    expect(repaired.statusCode).toBe(200);
    const resolved = recoveryDetailSchema.parse(
      (await recoveryDetail(seed.devCookie, item.recovery_item_id)).json(),
    );
    const afterRepair=await snapshot();
    expect((await app.inject({method:'GET',url:'/dashboard/recovery-history',headers:headers(seed.devCookie)})).statusCode).toBe(200);
    expect(await snapshot()).toEqual(afterRepair);
    expect(resolved.state).toBe('resolved');
    expect(resolved.next_actions).toEqual([]);
    expect((await recoveryList(seed.devCookie, 'category=unassigned-voc')).items).toEqual([]);
    await migrateHandle.pool.query('UPDATE voc.vocs SET archived_at = now() WHERE id = $1::uuid', [
      voc.id,
    ]);
    expect((await recoveryDetail(seed.devCookie, item.recovery_item_id)).json().state).toBe(
      'withdrawn',
    );
    await migrateHandle.pool.query(
      'UPDATE permission.permission_grants SET revoked_at = now() WHERE actor_id = $1::uuid AND capability = $2',
      [seed.devActorId, 'voc.read'],
    );
    expect((await recoveryDetail(seed.devCookie, item.recovery_item_id)).statusCode).toBe(404);
  });

  it('keeps readable Task gaps while redacting restricted linked VOCs and their responsibility', async () => {
    const seed = await createDashboardScope();
    const hidden = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msB,
      reporterActorId,
      'restricted secret title',
      { ownerUserId: adminActorId },
    );
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      status: 'released',
      createdBy: adminActorId,
    });
    await link('voc', hidden.id, 'task', task.id, 'evidence_of', seed.msA);
    const list = await recoveryList(seed.devCookie, 'category=released-task-unresolved-voc');
    expect(list.total).toBe(1);
    const item = required(list.items[0]);
    expect(item.affected).toEqual([]);
    expect(item.next_actions).toEqual([]);
    expect(item.responsible_actor_hint).toEqual({ kind: 'unassigned', label: '미지정' });
    const detail = (await recoveryDetail(seed.devCookie, item.recovery_item_id)).json();
    expect(JSON.stringify(detail)).not.toContain(hidden.id);
    expect(JSON.stringify(detail)).not.toContain('restricted secret title');
    expect(JSON.stringify(detail)).not.toContain(adminActorId);
    expect(
      (await recoveryList(seed.devCookie, 'category=released-task-unresolved-voc&view=actionable'))
        .total,
    ).toBe(0);
    const visible = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'visible affected',
      { ownerUserId: seed.devActorId },
    );
    await link('voc', visible.id, 'task', task.id, 'evidence_of', seed.msA);
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'voc.triage',
      seed.msA,
      adminActorId,
    );
    const actionable = await recoveryList(
      seed.devCookie,
      'category=released-task-unresolved-voc&view=actionable&limit=1',
    );
    expect(actionable.total).toBe(1);
    expect(actionable.items[0]?.next_actions[0]?.target.source_id).toBe(visible.id);
    expect(actionable.items[0]?.responsible_actor_hint.actor_id).toBe(seed.devActorId);
    const visibleOther = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'other responsible',
      { ownerUserId: adminActorId },
    );
    await link('voc', visibleOther.id, 'task', task.id, 'evidence_of', seed.msA);
    const multiple = await recoveryDetail(seed.devCookie, item.recovery_item_id);
    expect(multiple.json().responsible_actor_hint).toEqual({
      kind: 'multiple',
      label: '여러 담당자',
    });
  });

  it('does not enumerate gaps for no-scope Users or a workspace-admin denied Admin', async () => {
    const seed = await createDashboardScope();
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      adminActorId,
      'not the User own source',
    );
    const adminPage = await recoveryList(adminCookie, 'category=unassigned-voc');
    const id = required(
      adminPage.items.find((item) => item.source?.id === voc.id),
    ).recovery_item_id;
    const userCookie = await loginAs(app, 'mock-user-1');
    expect((await recoveryList(userCookie)).items).toEqual([]);
    expect((await recoveryDetail(userCookie, id)).statusCode).toBe(404);
    expect((await app.inject({method:'PATCH',url:`/dashboard/recovery-items/${id}/presentation`,headers:headers(userCookie),payload:{action:'mute'}})).statusCode).toBe(404);
    await migrateHandle.pool.query(
      `INSERT INTO permission.permission_requests
      (workspace_id, requester_actor_id, requested_capability, reason, status)
      VALUES ($1::uuid, $2::uuid, 'voc.read', $3::text, 'pending')`,
      [WORKSPACE_ID, seed.devActorId, `${SLUG_PREFIX} recovery denied request`],
    );
    const permissionPage = await recoveryList(adminCookie, 'category=permission-requests-pending');
    expect(permissionPage.total).toBeGreaterThan(0);
    const permissionItem = required(permissionPage.items[0]);
    expect(permissionItem.next_actions).toContainEqual(
      expect.objectContaining({
        id: 'review_permission',
        target: expect.objectContaining({
          endpoint: `/permissions/requests/${required(permissionItem.source).id}/reject`,
        }),
        confirmation: expect.objectContaining({
          required: true,
          reason_required: true,
          audit_event_intent: 'permission_rejected',
        }),
      }),
    );
    // A new sensitive actor owns this burst; existing seed Admin is untouched.
    await migrateHandle.pool.query(
      "UPDATE core.actors SET role_level = 'admin' WHERE id = $1::uuid",
      [seed.devActorId],
    );
    await denyCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'workspace.admin',
      null,
      adminActorId,
    );
    const deniedCookie = await loginAs(
      app,
      (
        await migrateHandle.pool.query<{ external_id: string }>(
          'SELECT external_id FROM core.actors WHERE id = $1::uuid',
          [seed.devActorId],
        )
      ).rows[0]?.external_id ?? '',
    );
    expect((await recoveryList(deniedCookie, 'category=permission-requests-pending')).total).toBe(
      0,
    );
    expect((await recoveryDetail(deniedCookie, permissionItem.recovery_item_id)).statusCode).toBe(
      404,
    );
    await migrateHandle.pool.query(
      "UPDATE permission.permission_requests SET status = 'cancelled' WHERE id = $1::uuid",
      [required(permissionItem.source).id],
    );
    const withdrawn = recoveryDetailSchema.parse(
      (await recoveryDetail(adminCookie, permissionItem.recovery_item_id)).json(),
    );
    expect(withdrawn.state).toBe('withdrawn');
    expect(withdrawn.next_actions).toEqual([]);
  });

  it('keeps Task queue membership separate from a User source-role denial', async () => {
    const seed = await createDashboardScope();
    const hidden = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msB,
      adminActorId,
      'role-protected VOC',
    );
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      status: 'released',
      createdBy: adminActorId,
    });
    await link('voc', hidden.id, 'task', task.id, 'evidence_of', seed.msA);
    await migrateHandle.pool.query(
      "UPDATE core.actors SET role_level = 'user' WHERE id = $1::uuid",
      [seed.devActorId],
    );
    const external = required(
      (
        await migrateHandle.pool.query<{ external_id: string }>(
          'SELECT external_id FROM core.actors WHERE id = $1::uuid',
          [seed.devActorId],
        )
      ).rows[0],
    );
    const cookie = await loginAs(app, external.external_id);
    const page = await recoveryList(cookie, 'category=released-task-unresolved-voc');
    expect(page.total).toBe(1);
    const item = required(page.items[0]);
    expect(item.source).toBeNull();
    expect(item.affected).toEqual([]);
    expect(item.next_actions).toEqual([]);
    expect(JSON.stringify(page)).not.toContain('Seed task');
    expect((await recoveryDetail(cookie, item.recovery_item_id)).statusCode).toBe(404);
  });

  it('collapses malformed, unknown, category-incompatible and foreign addresses into one 404', async () => {
    const seed = await createDashboardScope();
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'compatible source',
    );
    const address = (code: number, id: string) =>
      `r1_${Buffer.concat([Buffer.from([code]), Buffer.from(id.replaceAll('-', ''), 'hex')]).toString('base64url')}`;
    const foreignWorkspace = randomUUID();
    let foreignMs: string | undefined;
    let foreignActor: string | undefined;
    try {
      await migrateHandle.pool.query(
        'INSERT INTO core.workspaces (id, name) VALUES ($1::uuid, $2)',
        [foreignWorkspace, 'recovery foreign workspace'],
      );
      foreignActor = (
        await insertActorRow(migrateHandle, {
          workspaceId: foreignWorkspace,
          externalId: uid('recovery-foreign'),
          roleLevel: 'admin',
        })
      ).id;
      foreignMs = await insertMsDirectly(
        migrateHandle,
        foreignWorkspace,
        uid('recovery-foreign-ms'),
        'Foreign',
      );
      const foreignVoc = await insertVocDirectly(
        migrateHandle,
        foreignWorkspace,
        foreignMs,
        foreignActor,
        'foreign secret',
      );
      const canonical = address(1, voc.id);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const noncanonical =
        canonical.slice(0, -1) + alphabet[alphabet.indexOf(required(canonical.at(-1))) + 1];
      for (const token of [
        'malformed',
        address(1, randomUUID()),
        address(3, voc.id),
        address(1, foreignVoc.id),
        noncanonical,
        address(7, voc.id),
      ]) {
        const response = await recoveryDetail(seed.devCookie, token);
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
          code: 'not_found.record',
          message: 'recovery item not found',
        });
        const patch = await app.inject({method:'PATCH',url:`/dashboard/recovery-items/${token}/presentation`,headers:headers(seed.devCookie),payload:{action:'mute'}});
        expect(patch.statusCode).toBe(404);
        expect(patch.json().code).toBe('not_found.record');
      }
      // A compatible address can be resolved without proving a historical occurrence.
      expect((await recoveryDetail(seed.devCookie, address(2, voc.id))).json().state).toBe(
        'resolved',
      );
      const forgedQuery = await app.inject({
        method: 'GET',
        url: `/dashboard/recovery-items?actor_id=${adminActorId}`,
        headers: headers(seed.devCookie),
      });
      expect(forgedQuery.statusCode).toBe(422);
      expect(
        (await app.inject({ method: 'GET', url: '/dashboard/recovery-items' })).statusCode,
      ).toBe(401);
    } finally {
      await migrateHandle.pool.query('DELETE FROM voc.vocs WHERE workspace_id = $1::uuid', [
        foreignWorkspace,
      ]);
      await migrateHandle.pool.query(
        'DELETE FROM core.display_counters WHERE workspace_id = $1::uuid',
        [foreignWorkspace],
      );
      if (foreignMs)
        await deleteRecoveryFixtureParents(
          migrateHandle,
          'DELETE FROM core.managed_systems WHERE id = $1::uuid',
          [foreignMs],
        );
      if (foreignActor)
        await migrateHandle.pool.query('DELETE FROM core.actors WHERE id = $1::uuid', [
          foreignActor,
        ]);
      await deleteRecoveryFixtureParents(
        migrateHandle,
        'DELETE FROM core.workspaces WHERE id = $1::uuid',
        [foreignWorkspace],
      );
    }
  });

  it('filters executable owner repairs before count and cursor LIMIT', async () => {
    const seed = await createDashboardScope();
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'voc.read',
      seed.msB,
      adminActorId,
    );
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'voc.triage',
      seed.msB,
      adminActorId,
    );
    const blocked = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'read only',
    );
    const eligible = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msB,
      reporterActorId,
      'executable',
    );
    await migrateHandle.pool.query('UPDATE voc.vocs SET id = $1::uuid WHERE id = $2::uuid', [
      '00000000-0000-4000-8000-000000000001',
      blocked.id,
    ]);
    const home = await recoveryList(
      seed.devCookie,
      'category=unassigned-voc&view=actionable&limit=1',
    );
    expect(home.total).toBe(1);
    expect(home.items[0]?.source?.id).toBe(eligible.id);
    expect(home.page.has_more).toBe(false);
    const operational = await recoveryList(seed.devCookie, 'category=unassigned-voc&limit=1');
    expect(operational.total).toBe(2);
    expect(operational.items[0]?.next_actions).toEqual([]);
    await migrateHandle.pool.query(
      'UPDATE core.managed_systems SET archived_at = now() WHERE id = $1::uuid',
      [seed.msB],
    );
    expect(
      (await recoveryList(seed.devCookie, 'category=unassigned-voc&view=actionable')).total,
    ).toBe(0);
    expect((await recoveryList(seed.devCookie, 'category=unassigned-voc')).total).toBe(2);
  });

  it('keeps generic holder reads safe and preserves the personal Survey route audits', async () => {
    const seed = await createDashboardScope();
    await seedSurveyGaps(seed.msA, 2);
    expect(
      (await recoveryList(seed.devCookie, 'category=bad-outcome-no-followup&view=actionable'))
        .total,
    ).toBe(0);
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'survey.read_personal_responses',
      seed.msA,
      adminActorId,
    );
    const auditCount = async () =>
      Number(
        (
          await migrateHandle.pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM core.audit_log WHERE actor_id = $1::uuid AND event_type = 'survey_response_personal_read'",
            [seed.devActorId],
          )
        ).rows[0]?.count,
      );
    const before = await auditCount();
    const list = await recoveryList(
      seed.devCookie,
      'category=bad-outcome-no-followup&view=actionable',
    );
    expect(list.total).toBe(1);
    expect(list.items[0]?.next_actions[0]?.id).toBe('create_finding');
    await recoveryDetail(seed.devCookie, required(list.items[0]).recovery_item_id);
    expect(await auditCount()).toBe(before);
    expect(JSON.stringify(list)).not.toMatch(/response_id|answer_value|respondent|response_count/);
    const personal = await app.inject({
      method: 'GET',
      url: `/surveys/${required(list.items[0]).source?.id}/outcome-follow-up`,
      headers: headers(seed.devCookie),
    });
    expect(personal.statusCode).toBe(200);
    expect(personal.json().personal_access).toBe(true);
    expect(await auditCount()).toBe(before + 2);
    const outside = await recoveryList(
      seed.devCookie,
      `category=bad-outcome-no-followup&managed_system_id=${seed.msB}`,
    );
    expect(outside.total).toBe(0);
  });

  it('pages current recovery gaps with stable distinct identities and count parity', async () => {
    const seed = await createDashboardScope();
    await seedVocs(seed.msA, 4, 4, 3, 0);
    const summary = (await get(seed.devCookie, seed.msA)).json<Summary>();
    const read = (query: string) =>
      app.inject({
        method: 'GET',
        url: `/dashboard/recovery-items?managed_system_id=${seed.msA}&${query}`,
        headers: headers(seed.devCookie),
      });
    const first = await read('category=unassigned-voc&limit=2');
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.total).toBe(queue(summary, 'unassigned-voc')?.count);
    expect(body.items).toHaveLength(2);
    expect(body.page.has_more).toBe(true);
    const second = (await read(`category=unassigned-voc&limit=2&cursor=${body.page.cursor}`)).json();
    expect(new Set([...body.items, ...second.items].map((item) => item.recovery_item_id)).size).toBe(
      4,
    );
    expect(second.page.has_more).toBe(false);
    const refresh = (await read('category=unassigned-voc&limit=2')).json();
    expect(refresh.items).toEqual(body.items);
    const high = (await read('category=high-severity-unlinked')).json();
    for (const item of high.items) {
      const unassigned = [...body.items, ...second.items].find(
        (row) => row.source?.id === item.source?.id,
      );
      expect(item.recovery_item_id).not.toBe(unassigned.recovery_item_id);
    }
    const home = (await read('view=actionable')).json();
    // Read grants/assignment never confer voc.triage.
    expect(home.items).toEqual([]);
    expect(home.total).toBe(0);
    expect(new Date(summary.computed_at).toISOString()).toBe(summary.computed_at);
    const mixed = await read('limit=2');
    let mixedBody = recoveryListSchema.parse(mixed.json());
    const mixedItems = [...mixedBody.items];
    while (mixedBody.page.has_more) {
      mixedBody = recoveryListSchema.parse(
        (await read(`limit=2&cursor=${required(mixedBody.page.cursor)}`)).json(),
      );
      mixedItems.push(...mixedBody.items);
    }
    expect(mixedItems).toHaveLength(7);
    expect(new Set(mixedItems.map((item) => item.recovery_item_id)).size).toBe(7);
    expect(mixedItems.map((item) => item.category)).toEqual([
      ...Array(3).fill('high-severity-unlinked'),
      ...Array(4).fill('unassigned-voc'),
    ]);
    expect(
      (await read(`category=unassigned-voc&view=actionable&cursor=${body.page.cursor}`)).statusCode,
    ).toBe(422);
    const incompatible = await read(
      `category=high-severity-unlinked&limit=2&cursor=${body.page.cursor}`,
    );
    expect(incompatible.statusCode).toBe(422);
  });

  it('fails closed when every Survey system is denied to an Admin', async () => {
    const seed = await createDashboardScope();
    await seedSurveyGaps(seed.msA, 2);
    await seedSurveyGaps(seed.msB, 3);
    // Prove the fixtures qualify for the aggregate before removing all Survey read scope.
    const unrestricted = await get(adminCookie);
    expect(unrestricted.statusCode).toBe(200);
    expect(
      queue(unrestricted.json<Summary>(), 'bad-outcome-no-followup')?.count,
    ).toBeGreaterThanOrEqual(5);
    for (const [systemId, count] of [
      [seed.msA, 2],
      [seed.msB, 3],
    ] as const) {
      const selected = await get(adminCookie, systemId);
      expect(selected.statusCode).toBe(200);
      expect(queue(selected.json<Summary>(), 'bad-outcome-no-followup')?.count).toBe(count);
    }
    const systems = await migrateHandle.pool.query<{ id: string }>(
      'SELECT id FROM core.managed_systems WHERE workspace_id = $1::uuid',
      [WORKSPACE_ID],
    );
    const denyIds: string[] = [];
    try {
      for (const { id: systemId } of systems.rows) {
        denyIds.push(
          await denyCapability(
            migrateHandle,
            WORKSPACE_ID,
            adminActorId,
            'survey.read',
            systemId,
            adminActorId,
          ),
        );
      }
      // An empty effective scope must never reach 0052's unrestricted [] branch.
      // Check summary first so the regression fails independently of recovery routes.
      for (const selector of ['all', seed.msA, seed.msB]) {
        const response = await get(adminCookie, selector);
        expect(response.statusCode).toBe(200);
        const body = response.json<Summary>();
        expect(queue(body, 'bad-outcome-no-followup')?.count ?? 0).toBe(0);
        for (const row of systemRows(body)) {
          expect(row.action_queues?.['bad-outcome-no-followup'] ?? 0).toBe(0);
        }
      }
      const deniedList = await recoveryList(adminCookie, 'category=bad-outcome-no-followup');
      expect(deniedList.total).toBe(0);
      expect(
        (
          await recoveryList(
            adminCookie,
            `category=bad-outcome-no-followup&managed_system_id=${seed.msA}`,
          )
        ).total,
      ).toBe(0);
      const survey = required(
        (
          await migrateHandle.pool.query<{ id: string }>(
            'SELECT id FROM survey.surveys WHERE primary_managed_system_id = $1::uuid',
            [seed.msA],
          )
        ).rows[0],
      );
      const token = `r1_${Buffer.concat([Buffer.from([5]), Buffer.from(survey.id.replaceAll('-', ''), 'hex')]).toString('base64url')}`;
      expect((await recoveryDetail(adminCookie, token)).statusCode).toBe(404);
    } finally {
      // Remove only this test's denies before fixture cleanup deletes systems/actors.
      await migrateHandle.pool.query(
        'DELETE FROM permission.permission_denies WHERE id = ANY($1::uuid[])',
        [denyIds],
      );
    }
  });
  it('limits a developer to their one Managed System and omits unavailable entries', async () => {
    const seed = await createDashboardScope();
    const before = (await get(seed.devCookie)).json<Summary>();
    await seedDashboard(seed);
    const beforeAudit = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.audit_log where actor_id = $1',
      [seed.devActorId],
    );
    const visible = (await get(seed.devCookie)).json<Summary>();
    const afterAudit = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.audit_log where actor_id = $1',
      [seed.devActorId],
    );
    expectDelta(visible.kpis.open_voc, before.kpis.open_voc, 10, 'developer open_voc');
    expectDelta(
      visible.kpis.active_finding,
      before.kpis.active_finding,
      7,
      'developer active_finding',
    );
    expectDelta(
      visible.kpis.pending_request,
      before.kpis.pending_request,
      6,
      'developer pending_request',
    );
    expectDelta(
      visible.kpis.tasks_in_flight,
      before.kpis.tasks_in_flight,
      9,
      'developer tasks_in_flight',
    );
    expect(visible.kpis.coverage_percent).toBe(coverage(visible, 'voc-task')?.percent);
    expectQueueDelta(visible, before, 'unassigned-voc', 6);
    expectQueueDelta(visible, before, 'high-severity-unlinked', 3);
    expectQueueDelta(visible, before, 'actionable-finding-no-execution', 5);
    expectQueueDelta(visible, before, 'released-task-unresolved-voc', 2);
    expectQueueDelta(visible, before, 'bad-outcome-no-followup', 4);
    expectCoverageDelta(visible, before, 'voc-task', 3, 10);
    expectCoverageDelta(visible, before, 'finding-execution', 2, 7);
    expectCoverageDelta(visible, before, 'high-followup', 1, 4);
    expectCoverageDelta(visible, before, 'released-update', 1, 2);
    expectCoverageDelta(visible, before, 'analytics-area', 3, 10);
    expect(queue(visible, 'permission-requests-pending')).toBeUndefined();
    expect(visible.action_queues.map((entry) => entry.id)).not.toContain(
      'permission-requests-pending',
    );
    expect(
      (await get(seed.devCookie, seed.msB)).json<Summary>().action_queues.map((entry) => entry.id),
    ).not.toContain('unassigned-voc');
    expect(
      queue((await get(seed.devCookie, seed.msB)).json<Summary>(), 'unassigned-voc'),
    ).toBeUndefined();
    expect(afterAudit.rows[0]?.count).toBe(beforeAudit.rows[0]?.count);
  });

  it('keeps finding-only rows while omitting VOC, task, and survey metrics outside their scopes', async () => {
    const seed = await createDashboardScope();
    await migrateHandle.pool.query(
      "delete from permission.permission_grants where actor_id = $1 and capability in ('finding.manage', 'survey.read')",
      [seed.devActorId],
    );
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'finding.read',
      seed.msB,
      adminActorId,
    );
    const vocA = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'scoped VOC A',
    );
    const vocB = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msB,
      reporterActorId,
      'hidden VOC B',
    );
    await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      sourceId: vocA.id,
      status: 'active',
      createdBy: adminActorId,
    });
    await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msB,
      sourceId: vocB.id,
      status: 'active',
      createdBy: adminActorId,
    });

    const body = (await get(seed.devCookie)).json<Summary>();
    const rowA = systemRow(body, seed.msA);
    const rowB = systemRow(body, seed.msB);

    expect(rowA?.coverage).toHaveProperty('voc-task');
    expect(rowA?.coverage).toHaveProperty('finding-execution');
    expect(rowA?.coverage).not.toHaveProperty('released-update');
    expect(rowA?.action_queues).toHaveProperty('unassigned-voc');
    expect(rowA?.action_queues).toHaveProperty('actionable-finding-no-execution');
    expect(rowA?.action_queues).not.toHaveProperty('released-task-unresolved-voc');
    expect(rowA?.action_queues).not.toHaveProperty('bad-outcome-no-followup');
    expect(rowB?.coverage).toEqual({ 'finding-execution': expect.any(Object) });
    expect(rowB?.action_queues).toEqual({ 'actionable-finding-no-execution': expect.any(Number) });
    expect(rowB?.kpis).toEqual({ active_finding: 1 });
  });

  it.each([
    { good: 50, warn: 25, status: 'good' },
    { good: 90, warn: 50, status: 'warn' },
    { good: 90, warn: 51, status: 'bad' },
  ] as const)(
    'uses configured inclusive cutoffs at roll-up/system/Area: %j',
    async ({ good, warn, status }) => {
      const seed = await createDashboardScope();
      const vocs = await seedVocs(seed.msA, 4, 0, 4, 4);
      const task = await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: seed.msA,
        status: 'done',
        createdBy: adminActorId,
      });
      for (const id of vocs.all.slice(0, 2))
        await link('voc', id, 'task', task.id, 'evidence_of', seed.msA);
      const before = (await get(seed.devCookie, seed.msA)).json<Summary>();
      expect(coverage(before, 'voc-task')).toMatchObject({
        value: 2,
        total: 4,
        percent: 50,
        status: 'warn',
      });
      const linksBefore = await migrateHandle.pool.query(
        'select * from core.entity_links where managed_system_id = $1 order by id',
        [seed.msA],
      );
      const auditsBefore = await migrateHandle.pool.query(
        "select * from core.audit_log where workspace_id = $1 and event_type <> 'workspace_settings_updated' order by id",
        [WORKSPACE_ID],
      );
      try {
        const edit = await app.inject({
          method: 'PATCH',
          url: '/workspace/settings',
          headers: headers(adminCookie),
          payload: {
            coverage_thresholds: { 'voc-task': { good_min_percent: good, warn_min_percent: warn } },
          },
        });
        expect(edit.statusCode).toBe(200);
        const after = (await get(seed.devCookie, seed.msA)).json<Summary>();
        const expected = { value: 2, total: 4, percent: 50, status };
        expect(coverage(after, 'voc-task')).toMatchObject(expected);
        expect(systemRow(after, seed.msA)?.coverage?.['voc-task']).toEqual(expected);
        expect(systemRow(after, seed.msA)?.analytics_areas?.[0]?.coverage?.['voc-task']).toEqual(
          expected,
        );
        expect(coverage(after, 'high-followup')).toEqual(coverage(before, 'high-followup'));
        expect(after.kpis).toEqual(before.kpis);
        expect(after.action_queues).toEqual(before.action_queues);
        expect(after.coverage.map(({ status: _status, ...counts }) => counts)).toEqual(
          before.coverage.map(({ status: _status, ...counts }) => counts),
        );
        expect(
          (
            await migrateHandle.pool.query(
              'select * from core.entity_links where managed_system_id = $1 order by id',
              [seed.msA],
            )
          ).rows,
        ).toEqual(linksBefore.rows);
        expect(
          (
            await migrateHandle.pool.query(
              "select * from core.audit_log where workspace_id = $1 and event_type <> 'workspace_settings_updated' order by id",
              [WORKSPACE_ID],
            )
          ).rows,
        ).toEqual(auditsBefore.rows);
      } finally {
        await migrateHandle.pool.query(
          "delete from core.audit_log where workspace_id = $1 and event_type = 'workspace_settings_updated'",
          [WORKSPACE_ID],
        );
        await migrateHandle.pool.query(
          'delete from core.workspace_settings where workspace_id = $1',
          [WORKSPACE_ID],
        );
      }
    },
  );

  it('uses each configured band on all five nonempty system and roll-up metrics', async () => {
    const seed = await createDashboardScope();
    const vocs = await seedVocs(seed.msA, 4, 0, 4, 2);
    await seedFindings(seed.msA, vocs.all[0]!, 4, 2);
    const linked = await seedTasks(seed.msA, vocs.all, 0, 2, 2);
    await seedPublicUpdate(linked[0]!, false);
    const before = (await get(seed.devCookie, seed.msA)).json<Summary>();
    const ids = [
      'voc-task',
      'finding-execution',
      'high-followup',
      'released-update',
      'analytics-area',
    ] as const;
    for (const id of ids)
      expect(coverage(before, id)).toMatchObject({ percent: 50, status: 'warn' });
    try {
      const edit = await app.inject({
        method: 'PATCH',
        url: '/workspace/settings',
        headers: headers(adminCookie),
        payload: {
          coverage_thresholds: Object.fromEntries(
            ids.map((id) => [id, { good_min_percent: 50, warn_min_percent: 25 }]),
          ),
        },
      });
      expect(edit.statusCode).toBe(200);
      const after = (await get(seed.devCookie, seed.msA)).json<Summary>();
      for (const id of ids) {
        expect(coverage(after, id)).toMatchObject({ percent: 50, status: 'good' });
        expect(systemRow(after, seed.msA)?.coverage?.[id]).toMatchObject({
          percent: 50,
          status: 'good',
        });
      }
      expect(
        systemRow(after, seed.msA)?.analytics_areas?.[0]?.coverage?.['high-followup'],
      ).toMatchObject({ percent: 0, status: 'bad' });
    } finally {
      await migrateHandle.pool.query(
        "delete from core.audit_log where workspace_id = $1 and event_type = 'workspace_settings_updated'",
        [WORKSPACE_ID],
      );
      await migrateHandle.pool.query(
        'delete from core.workspace_settings where workspace_id = $1',
        [WORKSPACE_ID],
      );
    }
  });

  it('keeps nonempty zero bad and authorized empty no_data independently of unavailable keys', async () => {
    const seed = await createDashboardScope();
    await seedVocs(seed.msA, 1, 0, 0, 0);
    const body = (await get(seed.devCookie, seed.msA)).json<Summary>();
    expect(coverage(body, 'voc-task')).toMatchObject({
      value: 0,
      total: 1,
      percent: 0,
      status: 'bad',
    });
    expect(coverage(body, 'high-followup')).toMatchObject({
      value: 0,
      total: 0,
      percent: 0,
      status: 'no_data',
    });
    // finding.manage makes released-update authorized; with no released Tasks it is no_data.
    expect(coverage(body, 'released-update')).toMatchObject({
      value: 0,
      total: 0,
      percent: 0,
      status: 'no_data',
    });
    expect(coverage(body, 'milestone-outcome')).toBeUndefined();
  });

  it('keeps VOC metrics present at zero for a system in voc.read with no VOCs', async () => {
    const seed = await createDashboardScope();
    const body = (await get(seed.devCookie)).json<Summary>();
    const row = systemRow(body, seed.msA);

    expect(row?.coverage).toMatchObject({
      'voc-task': { value: 0, total: 0, percent: 0, status: 'no_data' },
      'analytics-area': { value: 0, total: 0, percent: 0, status: 'no_data' },
      'high-followup': { value: 0, total: 0, percent: 0, status: 'no_data' },
    });
    expect(row?.kpis).toEqual({
      open_voc: 0,
      active_finding: 0,
      tasks_in_flight: 0,
      coverage_percent: 0,
    });
    expect(row?.action_queues).toMatchObject({ 'unassigned-voc': 0, 'high-severity-unlinked': 0 });
  });

  it('includes Analytics Areas only for VOC area data and keeps assignment coverage on the system row', async () => {
    const seed = await createDashboardScope();
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      seed.devActorId,
      'voc.read',
      seed.msB,
      adminActorId,
    );
    await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'VOC with no Analytics Area',
    );
    const areaId = await analyticsArea(seed.msB);
    const areaVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msB,
      reporterActorId,
      'VOC in one Analytics Area',
    );
    await migrateHandle.pool.query('update voc.vocs set analytics_area_id = $1 where id = $2', [
      areaId,
      areaVoc.id,
    ]);

    const body = (await get(seed.devCookie)).json<Summary>();
    const rowA = systemRow(body, seed.msA);
    const rowB = systemRow(body, seed.msB);
    const areaRow = rowB?.analytics_areas?.[0];

    expect(rowA?.analytics_areas).toBeUndefined();
    expect(rowB?.coverage).toHaveProperty('analytics-area');
    expect(rowB?.analytics_areas).toHaveLength(1);
    expect(areaRow?.analytics_area_id).toBe(areaId);
    expect(areaRow?.coverage).toHaveProperty('voc-task');
    expect(areaRow?.coverage).toHaveProperty('high-followup');
    expect(areaRow?.coverage).not.toHaveProperty('analytics-area');
  });

  it('returns a survey-only system row with only its permitted zero survey queue', async () => {
    const managedSystemId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${SLUG_PREFIX}-${uid('survey-only')}`,
      'Survey-only Dashboard System',
    );
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      reporterActorId,
      'survey.read',
      managedSystemId,
      adminActorId,
    );
    const areaId = await analyticsArea(managedSystemId);
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      managedSystemId,
      reporterActorId,
      'hidden survey-only VOC',
    );
    await migrateHandle.pool.query('update voc.vocs set analytics_area_id = $1 where id = $2', [
      areaId,
      voc.id,
    ]);

    const reporterCookie = await loginAs(app, 'mock-user-1');
    const response = await get(reporterCookie);
    const body = response.json<Summary>();
    const row = systemRow(body, managedSystemId);

    expect(response.statusCode).toBe(200);
    expect(row).toBeDefined();
    expect(row?.action_queues).toEqual({ 'bad-outcome-no-followup': 0 });
    expect(row).not.toHaveProperty('coverage');
    expect(row).not.toHaveProperty('analytics_areas');
  });

  it('omits Finding metrics from every row for a plain User', async () => {
    const seed = await createDashboardScope();
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      reporterActorId,
      'voc.read',
      seed.msA,
      adminActorId,
    );
    await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'plain User VOC',
    );

    const reporterCookie = await loginAs(app, 'mock-user-1');
    const body = (await get(reporterCookie)).json<Summary>();
    const rows = systemRows(body);

    expect(rows.map((row) => row.managed_system_id)).toEqual([seed.msA]);
    expect(rows.every((row) => !row.coverage?.['finding-execution'])).toBe(true);
  });

  it('applies managed_system_id selectors and returns no scoped data for an outside system', async () => {
    const seed = await createDashboardScope();
    const beforeAll = (await get(adminCookie)).json<Summary>();
    const beforeA = (await get(adminCookie, seed.msA)).json<Summary>();
    const beforeB = (await get(adminCookie, seed.msB)).json<Summary>();
    await seedDashboard(seed);
    const all = (await get(adminCookie)).json<Summary>();
    const a = (await get(adminCookie, seed.msA)).json<Summary>();
    const b = (await get(adminCookie, seed.msB)).json<Summary>();
    expectQueueDelta(all, beforeAll, 'unassigned-voc', 11);
    expectQueueDelta(a, beforeA, 'unassigned-voc', 6);
    expectQueueDelta(b, beforeB, 'unassigned-voc', 5);
    expectQueueDelta(all, beforeAll, 'bad-outcome-no-followup', 6);
    expectQueueDelta(a, beforeA, 'bad-outcome-no-followup', 4);
    expectQueueDelta(b, beforeB, 'bad-outcome-no-followup', 2);
    expectQueueDelta(all, beforeAll, 'released-task-unresolved-voc', 4);
    expectQueueDelta(a, beforeA, 'released-task-unresolved-voc', 2);
    expectQueueDelta(b, beforeB, 'released-task-unresolved-voc', 2);
    expectCoverageDelta(all, beforeAll, 'finding-execution', 4, 12);
    expectCoverageDelta(a, beforeA, 'finding-execution', 2, 7);
    expectCoverageDelta(b, beforeB, 'finding-execution', 2, 5);
    expectCoverageDelta(all, beforeAll, 'released-update', 1, 4);
    expectCoverageDelta(a, beforeA, 'released-update', 1, 2);
    expectCoverageDelta(b, beforeB, 'released-update', 0, 2);
    const outside = await get(seed.devCookie, seed.msB);
    expect(outside.statusCode).toBe(200);
    expect(outside.json<Summary>().action_queues).toEqual([]);
    expect(outside.json<Summary>().coverage).toEqual([]);
  });

  it('keeps the zero-grant actor empty and writes no audit row', async () => {
    const actor = await insertDevActor(
      migrateHandle,
      WORKSPACE_ID,
      `dashboard-217-no-grants-${uid('actor')}`,
    );
    const cookie = await loginAs(app, actor.externalId);
    const before = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.audit_log where actor_id = $1',
      [actor.id],
    );
    const response = await get(cookie);
    const after = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.audit_log where actor_id = $1',
      [actor.id],
    );
    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>()).toEqual({
      kpis: {},
      action_queues: [],
      coverage: [],
      by_managed_system: [],
      computed_at: expect.any(String),
    });
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('rejects an invalid scope selector', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/summary?managed_system_id=not-a-uuid',
      headers: headers(adminCookie),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('counts each released Task once only when it has an active unresolved VOC link', async () => {
    const seed = await createDashboardScope();
    const before = (await get(adminCookie)).json<Summary>();
    const archivedVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'archived released-task VOC',
    );
    await migrateHandle.pool.query('update voc.vocs set archived_at = now() where id = $1', [
      archivedVoc.id,
    ]);
    const archivedTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      status: 'released',
      createdBy: adminActorId,
    });
    await link('voc', archivedVoc.id, 'task', archivedTask.id, 'evidence_of', seed.msA);

    const resolvedVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'resolved released-task VOC',
    );
    await migrateHandle.pool.query(
      "update voc.vocs set reporter_facing_status = 'resolved' where id = $1",
      [resolvedVoc.id],
    );
    const resolvedTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      status: 'released',
      createdBy: adminActorId,
    });
    await link('voc', resolvedVoc.id, 'task', resolvedTask.id, 'evidence_of', seed.msA);

    const closedVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'closed released-task VOC',
    );
    await migrateHandle.pool.query(
      "update voc.vocs set reporter_facing_status = 'closed' where id = $1",
      [closedVoc.id],
    );
    const mixedUnresolvedVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'unresolved mixed released-task VOC',
    );
    const mixedTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      status: 'released',
      createdBy: adminActorId,
    });
    await link('voc', closedVoc.id, 'task', mixedTask.id, 'evidence_of', seed.msA);
    await link('voc', mixedUnresolvedVoc.id, 'task', mixedTask.id, 'evidence_of', seed.msA);

    const firstUnresolvedVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'first duplicated released-task VOC',
    );
    const secondUnresolvedVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'second duplicated released-task VOC',
    );
    const duplicatedTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      status: 'released',
      createdBy: adminActorId,
    });
    await link('voc', firstUnresolvedVoc.id, 'task', duplicatedTask.id, 'evidence_of', seed.msA);
    await link('voc', secondUnresolvedVoc.id, 'task', duplicatedTask.id, 'evidence_of', seed.msA);

    const after = (await get(adminCookie)).json<Summary>();
    expectQueueDelta(after, before, 'released-task-unresolved-voc', 2);
  });

  it('treats a related_to-only high VOC as unlinked and outside the high-followup numerator', async () => {
    const seed = await createDashboardScope();
    const before = (await get(adminCookie)).json<Summary>();
    const relatedHigh = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'related_to-only high VOC',
      { severity: 'high' },
    );
    const peer = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'related_to-only peer',
    );
    await link('voc', relatedHigh.id, 'voc', peer.id, 'related_to', seed.msA);

    const after = (await get(adminCookie)).json<Summary>();
    expectQueueDelta(after, before, 'high-severity-unlinked', 1);
    expectCoverageDelta(after, before, 'high-followup', 0, 1);
  });

  it('treats a cluster member with an active cluster finding link as followed up', async () => {
    const seed = await createDashboardScope();
    const before = (await get(adminCookie)).json<Summary>();
    const memberHigh = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      seed.msA,
      reporterActorId,
      'cluster member high VOC',
      { severity: 'high' },
    );
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      createdBy: adminActorId,
      title: 'N2 followed-up cluster',
    });
    await insertVocClusterMemberRow(migrateHandle, {
      clusterId: cluster.id,
      vocId: memberHigh.id,
      addedBy: adminActorId,
    });
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: seed.msA,
      sourceType: 'voc_cluster',
      sourceId: cluster.id,
      status: 'active',
      createdBy: adminActorId,
    });
    await link('voc_cluster', cluster.id, 'finding', finding.id, 'created_finding', seed.msA);

    const after = (await get(adminCookie)).json<Summary>();
    expectQueueDelta(after, before, 'high-severity-unlinked', 0);
    expectCoverageDelta(after, before, 'high-followup', 1, 1);
  });
});

describe.skipIf(!runIntegration)('dashboard authorization absence', () => {
  it('propagates a non-authorization downstream failure rather than omitting an entry', async () => {
    const service = createDashboardService({
      db: { execute: async () => ({ rows: [] }) } as never,
      checkService: { checkCapability: async () => ({ allow: true, via: 'role' }) } as never,
      requestService: { listAllActive: async () => ({ count: 0, requests: [] }) },
      vocReadService: {
        countGroupedVocs: async () => {
          throw new HttpError('internal.unexpected', 'dashboard dependency failed');
        },
      },
    });
    await expect(
      service.getSummary({ actor_id: 'actor', workspace_id: 'workspace', role_level: 'admin' }),
    ).rejects.toMatchObject({ code: 'internal.unexpected' });
  });
});
