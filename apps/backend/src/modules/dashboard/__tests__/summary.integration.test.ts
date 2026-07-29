import type { DashboardSummary } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { insertTaskRequestRow } from '../../task-requests/__tests__/_seed-helpers.js';
import { insertTaskRow } from '../../tasks/__tests__/_seed-helpers.js';
import {
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';
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

const queue = (body: Summary, id: QueueId) =>
  body.action_queues.find((entry) => entry.id === id);
const coverage = (body: Summary, id: CoverageId) =>
  body.coverage.find((entry) => entry.id === id);

function expectDelta(after: number | undefined, before: number | undefined, seeded: number, label: string) {
  expect(after, `${label} after`).toBeTypeOf('number');
  expect(before, `${label} before`).toBeTypeOf('number');
  expect(after! - before!).toBe(seeded);
}

function expectQueueDelta(after: Summary, before: Summary, id: QueueId, seeded: number) {
  expectDelta(queue(after, id)?.count, queue(before, id)?.count, seeded, id);
}

function expectCoverageDelta(after: Summary, before: Summary, id: CoverageId, value: number, total: number) {
  const afterEntry = coverage(after, id);
  const beforeEntry = coverage(before, id);
  expectDelta(afterEntry?.value, beforeEntry?.value, value, `${id}.value`);
  expectDelta(afterEntry?.total, beforeEntry?.total, total, `${id}.total`);
  expect(afterEntry?.percent).toBe(afterEntry ? Math.round((afterEntry.value / afterEntry.total) * 100) : undefined);
}

describe.skipIf(!runIntegration)('GET /dashboard/summary (#217)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterActorId: string;

  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const get = (cookie: string, selector = 'all') => app.inject({
    method: 'GET', url: `/dashboard/summary?managed_system_id=${selector}`, headers: headers(cookie),
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
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

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    const systems = `select id from core.managed_systems where workspace_id = $1 and slug like $2`;
    await migrateHandle.pool.query(`delete from core.entity_links where managed_system_id in (${systems})`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from survey.survey_response_answers where survey_id in (select id from survey.surveys where primary_managed_system_id in (${systems}))`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from survey.survey_responses where survey_id in (select id from survey.surveys where primary_managed_system_id in (${systems}))`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from survey.survey_questions where survey_id in (select id from survey.surveys where primary_managed_system_id in (${systems}))`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from survey.surveys where primary_managed_system_id in (${systems})`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from task.tasks where primary_managed_system_id in (${systems})`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from task_request.task_requests where primary_managed_system_id in (${systems})`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from finding.findings where primary_managed_system_id in (${systems})`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from permission.permission_requests where workspace_id = $1 and reason like $2`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from voc.vocs where primary_managed_system_id in (${systems})`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from permission.permission_grants where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`, [WORKSPACE_ID, 'mock-dev-read-dashboard-217%']);
    await migrateHandle.pool.query(`delete from core.rate_limits where key in (select id::text from core.actors where workspace_id = $1 and external_id like $2)`, [WORKSPACE_ID, 'mock-dev-read-dashboard-217%']);
    await migrateHandle.pool.query(`delete from core.sessions where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`, [WORKSPACE_ID, 'mock-dev-read-dashboard-217%']);
    await migrateHandle.pool.query(`delete from core.audit_log where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`, [WORKSPACE_ID, 'mock-dev-read-dashboard-217%']);
    await migrateHandle.pool.query(`delete from core.actors where workspace_id = $1 and external_id like $2`, [WORKSPACE_ID, 'mock-dev-read-dashboard-217%']);
    await migrateHandle.pool.query(`delete from core.analytics_areas where managed_system_id in (${systems})`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
    await migrateHandle.pool.query(`delete from core.managed_systems where workspace_id = $1 and slug like $2`, [WORKSPACE_ID, `${SLUG_PREFIX}%`]);
  }

  async function createDashboardScope(): Promise<Seed> {
    const msA = await insertMsDirectly(migrateHandle, WORKSPACE_ID, `${SLUG_PREFIX}-${uid('a')}`, 'Dashboard A');
    const msB = await insertMsDirectly(migrateHandle, WORKSPACE_ID, `${SLUG_PREFIX}-${uid('b')}`, 'Dashboard B');
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
    const linkedTask = await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: msA, status: 'done', createdBy: adminActorId, title: 'linked VOC task' });
    await link('voc', vocsA.high[0]!, 'task', linkedTask.id, 'evidence_of', msA);
    await link('voc', vocsB.high[0]!, 'finding', (await insertFindingRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: msB, sourceId: vocsB.all[0]!, status: 'draft', createdBy: adminActorId })).id, 'created_finding', msB);

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
        [WORKSPACE_ID, adminActorId, `dashboard.review.${index}`, `${SLUG_PREFIX} pending ${index}`],
      );
    }
  }

  async function seedVocs(msId: string, total: number, unassigned: number, high: number, analytics: number) {
    const all: string[] = []; const highIds: string[] = [];
    for (let index = 0; index < total; index += 1) {
      const voc = await insertVocDirectly(migrateHandle, WORKSPACE_ID, msId, reporterActorId, `dashboard voc ${msId} ${index}`, {
        severity: index < high ? 'high' : 'low',
        ...(index < unassigned ? {} : { ownerUserId: adminActorId }),
      });
      all.push(voc.id); if (index < high) highIds.push(voc.id);
      if (index < analytics) await migrateHandle.pool.query('update voc.vocs set analytics_area_id = $1 where id = $2', [await analyticsArea(msId), voc.id]);
    }
    return { all, high: highIds };
  }

  const analyticsAreas = new Map<string, string>();
  async function analyticsArea(msId: string) {
    const saved = analyticsAreas.get(msId); if (saved) return saved;
    const result = await migrateHandle.pool.query<{ id: string }>('insert into core.analytics_areas (workspace_id, managed_system_id, slug, name) values ($1, $2, $3, $4) returning id', [WORKSPACE_ID, msId, uid('dashboard-aa'), 'Dashboard area']);
    const id = result.rows[0]?.id; if (!id) throw new Error('analytics area seed failed'); analyticsAreas.set(msId, id); return id;
  }

  async function link(sourceType: string, sourceId: string, targetType: string, targetId: string, relationType: string, msId: string) {
    await migrateHandle.pool.query(
      `insert into core.entity_links (workspace_id, source_type, source_id, target_type, target_id, relation_type, managed_system_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [WORKSPACE_ID, sourceType, sourceId, targetType, targetId, relationType, msId, adminActorId],
    );
  }

  async function seedFindings(msId: string, sourceId: string, total: number, executed: number) {
    for (let index = 0; index < total; index += 1) {
      const finding = await insertFindingRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: msId, sourceId, status: 'active', createdBy: adminActorId, title: `dashboard finding ${msId} ${index}` });
      if (index < executed) await migrateHandle.pool.query('update finding.findings set linked_task_id = $1 where id = $2', [(await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: msId, status: 'done', createdBy: adminActorId })).id, finding.id]);
    }
  }

  async function seedTasks(msId: string, vocIds: string[], inFlight: number, released: number, unresolved: number) {
    const linkedVocIds: string[] = [];
    for (let index = 0; index < inFlight; index += 1) await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: msId, status: 'todo', createdBy: adminActorId });
    for (let index = 0; index < released; index += 1) {
      const task = await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: msId, status: 'released', createdBy: adminActorId });
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
    for (let index = 0; index < total; index += 1) await insertTaskRequestRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: msId, sourceId, requesterActorId: adminActorId });
  }

  async function seedSurveyGaps(msId: string, total: number) {
    for (let index = 0; index < total; index += 1) {
      const survey = await migrateHandle.pool.query<{ id: string }>(`insert into survey.surveys (workspace_id, display_id, type, status, title, primary_managed_system_id, operator_actor_id, responses_identity_protected, created_by, opened_at) values ($1, $2, 'outcome', 'open', $3, $4, $5, true, $5, now()) returning id`, [WORKSPACE_ID, `SRV-${uid('dashboard')}`, `dashboard outcome ${index}`, msId, adminActorId]);
      const surveyId = survey.rows[0]?.id; if (!surveyId) throw new Error('survey seed failed');
      const question = await migrateHandle.pool.query<{ id: string }>(`insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, is_required, rating_min, rating_max, sort_order, branch_depth) values ($1, $2, 'rating', 'Outcome', false, 1, 5, 0, 0) returning id`, [WORKSPACE_ID, surveyId]);
      const questionId = question.rows[0]?.id; if (!questionId) throw new Error('question seed failed');
      const response = await migrateHandle.pool.query<{ id: string }>(`insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at) values ($1, $2, $3, true, now()) returning id`, [WORKSPACE_ID, surveyId, reporterActorId]);
      await migrateHandle.pool.query(`insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value) values ($1, $2, $3, $4, 'rating', '1'::jsonb)`, [WORKSPACE_ID, surveyId, response.rows[0]?.id, questionId]);
    }
  }

  it('returns distinct, non-zero admin counts with all rendered queue and coverage metadata', async () => {
    const before = (await get(adminCookie)).json<Summary>();
    const seed = await createDashboardScope();
    await seedDashboard(seed);
    const beforeAudit = await dbHandle.pool.query<{ count: string }>('select count(*)::text as count from core.audit_log where actor_id = $1', [adminActorId]);
    const response = await get(adminCookie);
    const body = response.json<Summary>();
    const afterAudit = await dbHandle.pool.query<{ count: string }>('select count(*)::text as count from core.audit_log where actor_id = $1', [adminActorId]);

    expect(response.statusCode).toBe(200);
    expect(afterAudit.rows[0]?.count).toBe(beforeAudit.rows[0]?.count);
    expectDelta(body.kpis.open_voc, before.kpis.open_voc, 17, 'open_voc');
    expectDelta(body.kpis.active_finding, before.kpis.active_finding, 12, 'active_finding');
    expectDelta(body.kpis.pending_request, before.kpis.pending_request, 19, 'pending_request');
    expectDelta(body.kpis.tasks_in_flight, before.kpis.tasks_in_flight, 14, 'tasks_in_flight');
    expect(body.kpis.coverage_percent).toBe(coverage(body, 'voc-task')?.percent);
    expect(queue(body, 'unassigned-voc')).toMatchObject({ severity: 'urgent', next_action: { route: '/vocs?view=inbox&tab=unassigned' } });
    expect(queue(body, 'high-severity-unlinked')).toMatchObject({ severity: 'urgent', next_action: { route: '/vocs?view=inbox&tab=high-no-link' } });
    expect(queue(body, 'actionable-finding-no-execution')).toMatchObject({ severity: 'warn', next_action: { route: '/findings?status=active' } });
    expect(queue(body, 'released-task-unresolved-voc')).toMatchObject({ severity: 'warn', next_action: { route: '/tasks?status=released' } });
    expect(queue(body, 'bad-outcome-no-followup')).toMatchObject({ severity: 'urgent', next_action: { route: '/surveys?type=outcome' } });
    expect(queue(body, 'permission-requests-pending')).toMatchObject({ severity: 'info', next_action: { route: '/admin/permission-requests' } });
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
    expect(seed.msA).not.toBe(seed.msB);
  });

  it('keeps bad-outcome-no-followup present at zero for an admin with no outcome surveys', async () => {
    const outcomeSurveys = await migrateHandle.pool.query<{ count: string }>(
      `select count(*)::text as count from survey.surveys where workspace_id = $1 and type = 'outcome'`,
      [WORKSPACE_ID],
    );
    const response = await get(adminCookie);

    expect(outcomeSurveys.rows[0]?.count).toBe('0');
    expect(response.statusCode).toBe(200);
    expect(queue(response.json<Summary>(), 'bad-outcome-no-followup')).toMatchObject({ count: 0 });
  });

  it('limits a developer to their one Managed System and omits unavailable entries', async () => {
    const seed = await createDashboardScope();
    const before = (await get(seed.devCookie)).json<Summary>();
    await seedDashboard(seed);
    const beforeAudit = await dbHandle.pool.query<{ count: string }>('select count(*)::text as count from core.audit_log where actor_id = $1', [seed.devActorId]);
    const visible = (await get(seed.devCookie)).json<Summary>();
    const afterAudit = await dbHandle.pool.query<{ count: string }>('select count(*)::text as count from core.audit_log where actor_id = $1', [seed.devActorId]);
    expectDelta(visible.kpis.open_voc, before.kpis.open_voc, 10, 'developer open_voc');
    expectDelta(visible.kpis.active_finding, before.kpis.active_finding, 7, 'developer active_finding');
    expectDelta(visible.kpis.pending_request, before.kpis.pending_request, 6, 'developer pending_request');
    expectDelta(visible.kpis.tasks_in_flight, before.kpis.tasks_in_flight, 9, 'developer tasks_in_flight');
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
    expect(visible.action_queues.map((entry) => entry.id)).not.toContain('permission-requests-pending');
    expect((await get(seed.devCookie, seed.msB)).json<Summary>().action_queues.map((entry) => entry.id)).not.toContain('unassigned-voc');
    expect(queue((await get(seed.devCookie, seed.msB)).json<Summary>(), 'unassigned-voc')).toBeUndefined();
    expect(afterAudit.rows[0]?.count).toBe(beforeAudit.rows[0]?.count);
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
    const actor = await insertDevActor(migrateHandle, WORKSPACE_ID, `dashboard-217-no-grants-${uid('actor')}`);
    const cookie = await loginAs(app, actor.externalId);
    const before = await dbHandle.pool.query<{ count: string }>('select count(*)::text as count from core.audit_log where actor_id = $1', [actor.id]);
    const response = await get(cookie);
    const after = await dbHandle.pool.query<{ count: string }>('select count(*)::text as count from core.audit_log where actor_id = $1', [actor.id]);
    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>()).toEqual({ kpis: {}, action_queues: [], coverage: [] });
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('rejects an invalid scope selector', async () => {
    const response = await app.inject({ method: 'GET', url: '/dashboard/summary?managed_system_id=not-a-uuid', headers: headers(adminCookie) });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('counts each released Task once only when it has an active unresolved VOC link', async () => {
    const seed = await createDashboardScope();
    const before = (await get(adminCookie)).json<Summary>();
    const archivedVoc = await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, 'archived released-task VOC');
    await migrateHandle.pool.query('update voc.vocs set archived_at = now() where id = $1', [archivedVoc.id]);
    const archivedTask = await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: seed.msA, status: 'released', createdBy: adminActorId });
    await link('voc', archivedVoc.id, 'task', archivedTask.id, 'evidence_of', seed.msA);

    const resolvedVoc = await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, 'resolved released-task VOC');
    await migrateHandle.pool.query("update voc.vocs set reporter_facing_status = 'resolved' where id = $1", [resolvedVoc.id]);
    const resolvedTask = await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: seed.msA, status: 'released', createdBy: adminActorId });
    await link('voc', resolvedVoc.id, 'task', resolvedTask.id, 'evidence_of', seed.msA);

    const closedVoc = await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, 'closed released-task VOC');
    await migrateHandle.pool.query("update voc.vocs set reporter_facing_status = 'closed' where id = $1", [closedVoc.id]);
    const mixedUnresolvedVoc = await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, 'unresolved mixed released-task VOC');
    const mixedTask = await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: seed.msA, status: 'released', createdBy: adminActorId });
    await link('voc', closedVoc.id, 'task', mixedTask.id, 'evidence_of', seed.msA);
    await link('voc', mixedUnresolvedVoc.id, 'task', mixedTask.id, 'evidence_of', seed.msA);

    const firstUnresolvedVoc = await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, 'first duplicated released-task VOC');
    const secondUnresolvedVoc = await insertVocDirectly(migrateHandle, WORKSPACE_ID, seed.msA, reporterActorId, 'second duplicated released-task VOC');
    const duplicatedTask = await insertTaskRow(migrateHandle, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: seed.msA, status: 'released', createdBy: adminActorId });
    await link('voc', firstUnresolvedVoc.id, 'task', duplicatedTask.id, 'evidence_of', seed.msA);
    await link('voc', secondUnresolvedVoc.id, 'task', duplicatedTask.id, 'evidence_of', seed.msA);

    const after = (await get(adminCookie)).json<Summary>();
    expectQueueDelta(after, before, 'released-task-unresolved-voc', 2);
  });
});

describe.skipIf(!runIntegration)('dashboard authorization absence', () => {
  it('propagates a non-authorization downstream failure rather than omitting an entry', async () => {
    const service = createDashboardService({
      db: { execute: async () => ({ rows: [] }) } as never,
      checkService: { checkCapability: async () => ({ allow: true, via: 'role' }) } as never,
      requestService: { listAllActive: async () => ({ count: 0, requests: [] }) },
      vocReadService: { countVocs: async () => { throw new HttpError('internal.unexpected', 'dashboard dependency failed'); } },
    });
    await expect(service.getSummary({ actor_id: 'actor', workspace_id: 'workspace', role_level: 'admin' })).rejects.toMatchObject({ code: 'internal.unexpected' });
  });
});
