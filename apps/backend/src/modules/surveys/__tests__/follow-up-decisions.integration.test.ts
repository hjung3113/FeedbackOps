// #510 part B (ADR-0055): route-level contracts for the outcome follow-up
// commands. Fixtures are seeded through the migrate handle; sessions are
// seeded via SQL (submit-more-info pattern) so this suite never spends the
// shared mock-login rate-limit bucket, and each test uses its own actor so
// the mutation tier (10/min/actor) cannot mask behavior.
//
// Rejected commands additionally assert that no state row and no audit row
// were written, so a regression cannot silently mutate on denial.
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TEST_PREFIX = `survey-followup-${randomUUID()}`;

type Actor = { id: string; externalId: string; roleLevel: string; cookie: string };
type Subject = {
  msId: string;
  surveyId: string;
  responseId: string;
};

describe.skipIf(!runIntegration)('POST /survey-responses/:id/mark-no-follow-up (#510)', () => {
  let db: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let grantorActorId: string;
  const actorIds: string[] = [];
  const managedSystemIds: string[] = [];
  const surveyIds: string[] = [];
  const responseIds: string[] = [];
  const findingIds: string[] = [];
  const secondaryWorkspaceIds: string[] = [];
  const secondarySurveyIds: string[] = [];
  const secondaryResponseIds: string[] = [];
  const secondaryActorIds: string[] = [];

  const post = async (
    url: string,
    actor: Actor,
    payload: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) => {
    return await app.inject({
      method: 'POST',
      url,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${actor.cookie}`,
        ...(key ? { 'idempotency-key': key } : {}),
      },
      payload,
    });
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    const grantor = await db.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and role_level = 'admin' order by created_at limit 1`,
      [WORKSPACE_ID],
    );
    grantorActorId = grantor.rows[0]?.id ?? '';
    if (!grantorActorId) throw new Error('no admin actor found in seed workspace');
  });

  afterAll(async () => {
    if (!migrateDb) return;
    const surveyTrees: Array<{ workspaceId: string; surveys: string[]; responses: string[] }> = [
      { workspaceId: WORKSPACE_ID, surveys: surveyIds, responses: responseIds },
      ...secondaryWorkspaceIds.map((workspaceId, index) => ({
        workspaceId,
        surveys: secondarySurveyIds[index] ? [secondarySurveyIds[index]] : [],
        responses: secondaryResponseIds[index] ? [secondaryResponseIds[index]] : [],
      })),
    ];
    for (const { workspaceId, responses } of surveyTrees) {
      await migrateDb.pool.query(
        'delete from survey.outcome_follow_up_decisions where response_id = any($1::uuid[])',
        [responses],
      );
      await migrateDb.pool.query(
        "delete from core.entity_links where workspace_id = $1 and source_type = 'survey_response' and source_id = any($2::uuid[])",
        [workspaceId, responses],
      );
      await migrateDb.pool.query(
        'delete from core.idempotency_keys where actor_id = any($1::uuid[])',
        [actorIds],
      );
      await migrateDb.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        actorIds,
      ]);
      await migrateDb.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
        actorIds,
      ]);
      await migrateDb.pool.query(
        'delete from core.audit_log where actor_id = any($1::uuid[]) or subject_id = any($2::uuid[])',
        [actorIds, responses],
      );
    }
    for (const { workspaceId, surveys } of surveyTrees) {
      await migrateDb.pool.query(
        'delete from survey.survey_response_answers where workspace_id = $1 and survey_id = any($2::uuid[])',
        [workspaceId, surveys],
      );
      await migrateDb.pool.query(
        'delete from survey.survey_responses where workspace_id = $1 and survey_id = any($2::uuid[])',
        [workspaceId, surveys],
      );
      await migrateDb.pool.query(
        'delete from survey.survey_questions where workspace_id = $1 and survey_id = any($2::uuid[])',
        [workspaceId, surveys],
      );
      await migrateDb.pool.query(
        'delete from survey.surveys where workspace_id = $1 and id = any($2::uuid[])',
        [workspaceId, surveys],
      );
    }
    await migrateDb.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [[...actorIds, ...secondaryActorIds]],
    );
    await migrateDb.pool.query('delete from finding.findings where id = any($1::uuid[])', [
      findingIds,
    ]);
    await migrateDb.pool.query('delete from core.actors where id = any($1::uuid[])', [
      [...actorIds, ...secondaryActorIds],
    ]);
    await migrateDb.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [
      managedSystemIds,
    ]);
    await migrateDb.pool.query('delete from core.workspaces where id = any($1::uuid[])', [
      secondaryWorkspaceIds,
    ]);
    await app?.close();
    await db?.close();
    await migrateDb?.close();
  });

  async function createActor(
    roleLevel: 'admin' | 'developer' | 'user',
    grants: string[] = [],
    msId?: string,
  ): Promise<Actor> {
    const externalId = `${TEST_PREFIX}-${randomUUID()}`;
    const inserted = await migrateDb.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, $4, 'internal_member') returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@example.test`, roleLevel],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('test actor seed returned no id');
    actorIds.push(id);
    for (const capability of grants)
      await grantCapability(migrateDb, WORKSPACE_ID, id, capability, msId ?? null, grantorActorId);
    const sessionId = randomUUID();
    await migrateDb.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [sessionId, id, WORKSPACE_ID],
    );
    return { id, externalId, roleLevel, cookie: sessionId };
  }

  /** Closed outcome survey at the default threshold with one low-band subject. */
  async function seedSubject(options?: {
    type?: 'outcome' | 'discovery';
    status?: 'draft' | 'open' | 'closed';
    subjectRating?: number;
    respondentCount?: number;
  }): Promise<Subject> {
    const type = options?.type ?? 'outcome';
    const status = options?.status ?? 'closed';
    const respondentCount = options?.respondentCount ?? 5;
    const ms = await migrateDb.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [WORKSPACE_ID, `${TEST_PREFIX}-ms-${randomUUID()}`, 'Follow-up MS'],
    );
    const msId = ms.rows[0]?.id;
    if (!msId) throw new Error('managed system seed failed');
    managedSystemIds.push(msId);
    const respondents: string[] = [];
    for (let index = 0; index < respondentCount; index += 1) {
      const actor = await migrateDb.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $2, 'user', 'internal_member') returning id`,
        [
          WORKSPACE_ID,
          `${TEST_PREFIX}-respondent-${randomUUID()}`,
          `${TEST_PREFIX}-r-${randomUUID()}@example.test`,
        ],
      );
      const id = actor.rows[0]?.id;
      if (!id) throw new Error('respondent seed failed');
      secondaryActorIds.push(id);
      respondents.push(id);
    }
    const survey = await migrateDb.pool.query<{ id: string }>(
      `insert into survey.surveys (
         workspace_id, display_id, type, status, title, primary_managed_system_id,
         operator_actor_id, created_by, opened_at, closed_at
       ) values ($1, $2, $3, $4, 'Follow-up survey', $5, $6, $6, $7, $8) returning id`,
      [
        WORKSPACE_ID,
        `SRV-followup-${randomUUID()}`,
        type,
        status,
        msId,
        grantorActorId,
        status === 'draft' ? null : new Date(),
        status === 'closed' ? new Date() : null,
      ],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('survey seed failed');
    surveyIds.push(surveyId);
    const question = await migrateDb.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, rating_min, rating_max, sort_order, branch_depth)
       values ($1, $2, 'rating', 'Did this release help?', 1, 5, 0, 0) returning id`,
      [WORKSPACE_ID, surveyId],
    );
    const questionId = question.rows[0]?.id;
    if (!questionId) throw new Error('question seed failed');
    let subjectResponseId = '';
    for (const [index, respondentId] of respondents.entries()) {
      const rating = index === 0 ? (options?.subjectRating ?? 2) : 5;
      const response = await migrateDb.pool.query<{ id: string }>(
        `insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
         values ($1, $2, $3, true, now()) returning id`,
        [WORKSPACE_ID, surveyId, respondentId],
      );
      const responseId = response.rows[0]?.id;
      if (!responseId) throw new Error('response seed failed');
      if (index === 0) {
        subjectResponseId = responseId;
        responseIds.push(responseId);
      }
      await migrateDb.pool.query(
        `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
         values ($1, $2, $3, $4, 'rating', $5::jsonb)`,
        [WORKSPACE_ID, surveyId, responseId, questionId, JSON.stringify(rating)],
      );
    }
    return { msId, surveyId, responseId: subjectResponseId };
  }

  /** Poor subject already resolved by an active generated_finding link. */
  async function seedResolvedSubject(): Promise<Subject> {
    const subject = await seedSubject();
    const finding = await migrateDb.pool.query<{ id: string }>(
      `insert into finding.findings (
         workspace_id, display_id, primary_managed_system_id, title, summary,
         source_type, source_id, severity, status, created_by
       ) values ($1, core.next_display_id($1::uuid, 'finding'), $2, 'Resolved finding', 'summary',
         'survey_response', $3, 'medium', 'active', $4) returning id`,
      [WORKSPACE_ID, subject.msId, subject.responseId, grantorActorId],
    );
    const findingId = finding.rows[0]?.id;
    if (!findingId) throw new Error('resolved finding seed failed');
    findingIds.push(findingId);
    await migrateDb.pool.query(
      `insert into core.entity_links (
         workspace_id, source_type, source_id, target_type, target_id, relation_type,
         visibility, status, managed_system_id, created_by
       ) values ($1, 'survey_response', $2, 'finding', $3, 'generated_finding', 'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, subject.responseId, findingId, subject.msId, grantorActorId],
    );
    return subject;
  }

  async function decisionRow(responseId: string) {
    const { rows } = await db.pool.query<{
      state: string;
      reason: string;
      managed_system_id: string;
      decided_by_actor_id: string;
    }>(
      'select state, reason, managed_system_id, decided_by_actor_id from survey.outcome_follow_up_decisions where workspace_id = $1 and response_id = $2',
      [WORKSPACE_ID, responseId],
    );
    return rows[0] ?? null;
  }

  async function auditRows(responseId: string, eventType: string) {
    const { rows } = await db.pool.query<{ actor_id: string; detail: Record<string, unknown> }>(
      'select actor_id, detail from core.audit_log where workspace_id = $1 and subject_id = $2 and event_type = $3',
      [WORKSPACE_ID, responseId, eventType],
    );
    return rows;
  }

  async function gapCount(msId: string): Promise<number> {
    const { rows } = await db.pool.query<{ count: string }>(
      'select survey.count_negative_outcome_without_followup($1::uuid, array[$2]::uuid[])::text as count',
      [WORKSPACE_ID, msId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async function assertRejectedCleanly(
    responseId: string,
    res: { statusCode: number; json(): unknown },
    expected: { statusCode: number; code: string; failureCode?: string },
  ) {
    expect(res.statusCode).toBe(expected.statusCode);
    const body = res.json() as { code: string; detail?: { failure_code?: string } };
    expect(body.code).toBe(expected.code);
    if (expected.failureCode) expect(body.detail?.failure_code).toBe(expected.failureCode);
    expect(await decisionRow(responseId)).toBeNull();
    expect(await auditRows(responseId, 'survey_outcome_no_follow_up_marked')).toEqual([]);
    expect(await auditRows(responseId, 'survey_outcome_follow_up_reopened')).toEqual([]);
  }

  it('marks a poor response, writes the state row and one audit row', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'Handled outside the tool.',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { response_id: string; resolution: string; updated_at: string };
    expect(body).toMatchObject({
      response_id: subject.responseId,
      resolution: 'no_follow_up',
    });
    expect(Date.parse(body.updated_at)).not.toBeNaN();
    expect(await decisionRow(subject.responseId)).toMatchObject({
      state: 'no_follow_up',
      reason: 'Handled outside the tool.',
      managed_system_id: subject.msId,
      decided_by_actor_id: actor.id,
    });
    expect(await gapCount(subject.msId)).toBe(0);
    const audits = await auditRows(subject.responseId, 'survey_outcome_no_follow_up_marked');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actor_id).toBe(actor.id);
    expect(audits[0]?.detail).toEqual({
      survey_id: subject.surveyId,
      managed_system_id: subject.msId,
      reason: 'Handled outside the tool.',
    });
  });

  it('reopens a marked response, audits the superseded reason, and the gap counts again', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const marked = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'First decision.',
    });
    expect(marked.statusCode).toBe(200);
    const res = await post(`/survey-responses/${subject.responseId}/reopen-follow-up`, actor, {
      reason: 'Finding was archived; follow-up needed again.',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ response_id: subject.responseId, resolution: 'open' });
    expect(await decisionRow(subject.responseId)).toMatchObject({ state: 'reopened' });
    expect(await gapCount(subject.msId)).toBe(1);
    const audits = await auditRows(subject.responseId, 'survey_outcome_follow_up_reopened');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.detail).toEqual({
      survey_id: subject.surveyId,
      managed_system_id: subject.msId,
      reason: 'Finding was archived; follow-up needed again.',
      previous_reason: 'First decision.',
    });
  });

  it('rejects a second reopen while the current row is reopened, without another audit row', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const marked = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'First decision.',
    });
    expect(marked.statusCode).toBe(200);
    const reopened = await post(`/survey-responses/${subject.responseId}/reopen-follow-up`, actor, {
      reason: 'Reopen once.',
    });
    expect(reopened.statusCode).toBe(200);
    // A new key makes this a fresh command, not an idempotent replay.
    const secondReopen = await post(
      `/survey-responses/${subject.responseId}/reopen-follow-up`,
      actor,
      { reason: 'Reopen twice.' },
    );
    expect(secondReopen.statusCode).toBe(409);
    const body = secondReopen.json() as {
      code: string;
      detail?: { failure_code?: string };
    };
    expect(body.code).toBe('conflict.stale_write');
    expect(body.detail?.failure_code).toBe('action_no_longer_available');
    expect(await decisionRow(subject.responseId)).toMatchObject({ state: 'reopened' });
    expect(await auditRows(subject.responseId, 'survey_outcome_follow_up_reopened')).toHaveLength(
      1,
    );
  });

  it('re-marks after reopen with a new key, adding a second mark audit row', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    expect(
      (
        await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
          reason: 'One.',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await post(`/survey-responses/${subject.responseId}/reopen-follow-up`, actor, {
          reason: 'Two.',
        })
      ).statusCode,
    ).toBe(200);
    const reMarked = await post(
      `/survey-responses/${subject.responseId}/mark-no-follow-up`,
      actor,
      {
        reason: 'Three.',
      },
    );
    expect(reMarked.statusCode).toBe(200);
    expect(reMarked.json()).toMatchObject({
      response_id: subject.responseId,
      resolution: 'no_follow_up',
    });
    expect(await decisionRow(subject.responseId)).toMatchObject({ state: 'no_follow_up' });
    expect(await auditRows(subject.responseId, 'survey_outcome_no_follow_up_marked')).toHaveLength(
      2,
    );
    expect(await gapCount(subject.msId)).toBe(0);
  });

  it('replays a stored response for the same key with exactly one audit row', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const key = randomUUID();
    const first = await post(
      `/survey-responses/${subject.responseId}/mark-no-follow-up`,
      actor,
      { reason: 'Replay me.' },
      key,
    );
    expect(first.statusCode).toBe(200);
    const replay = await post(
      `/survey-responses/${subject.responseId}/mark-no-follow-up`,
      actor,
      { reason: 'Replay me.' },
      key,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(await auditRows(subject.responseId, 'survey_outcome_no_follow_up_marked')).toHaveLength(
      1,
    );
  });

  it('returns 404 for an actor without survey.read_personal_responses', async () => {
    const subject = await seedSubject();
    const actor = await createActor('developer', ['survey.read'], subject.msId);
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 404,
      code: 'not_found.record',
    });
  });

  it('returns 404 for an Admin without survey.read_personal_responses (no role bypass)', async () => {
    const subject = await seedSubject();
    const actor = await createActor('admin');
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 404,
      code: 'not_found.record',
    });
  });

  // Gate-order oracle: the personal-response 404 must fire before the
  // classifier's 409, so a non-poor or already-resolved subject still yields
  // the plain 404 with no structured failure code.
  it('returns a plain 404, not a classifier 409, for a non-poor subject without personal read', async () => {
    const subject = await seedSubject({ subjectRating: 3 });
    const actor = await createActor('developer', ['survey.read'], subject.msId);
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string; detail?: { failure_code?: string } };
    expect(body.code).toBe('not_found.record');
    expect(body.detail?.failure_code).toBeUndefined();
    expect(await decisionRow(subject.responseId)).toBeNull();
  });

  it('returns a plain 404, not a classifier 409, for a resolved subject without personal read', async () => {
    const subject = await seedResolvedSubject();
    const actor = await createActor('developer', ['survey.read'], subject.msId);
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string; detail?: { failure_code?: string } };
    expect(body.code).toBe('not_found.record');
    expect(body.detail?.failure_code).toBeUndefined();
    expect(await decisionRow(subject.responseId)).toBeNull();
  });

  it('Admin without personal read gets a plain 404 for a non-poor subject, not a classifier 409', async () => {
    const subject = await seedSubject({ subjectRating: 3 });
    const actor = await createActor('admin');
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string; detail?: { failure_code?: string } };
    expect(body.code).toBe('not_found.record');
    expect(body.detail?.failure_code).toBeUndefined();
    expect(await decisionRow(subject.responseId)).toBeNull();
  });

  it('Admin without personal read gets a plain 404 for a resolved subject, not a classifier 409', async () => {
    const subject = await seedResolvedSubject();
    const actor = await createActor('admin');
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string; detail?: { failure_code?: string } };
    expect(body.code).toBe('not_found.record');
    expect(body.detail?.failure_code).toBeUndefined();
    expect(await decisionRow(subject.responseId)).toBeNull();
  });

  it('returns 403 with personal read but without finding.manage on that Managed System', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses'],
      subject.msId,
    );
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 403,
      code: 'permission.denied',
    });
  });

  it('allows an Admin holding survey.read_personal_responses (role bypasses finding.manage)', async () => {
    const subject = await seedSubject();
    const actor = await createActor('admin', ['survey.read_personal_responses'], subject.msId);
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'Admin decision.',
    });
    expect(res.statusCode).toBe(200);
    expect(await decisionRow(subject.responseId)).toMatchObject({ state: 'no_follow_up' });
  });

  it('rejects a non-poor response with action_no_longer_available', async () => {
    const subject = await seedSubject({ subjectRating: 3 });
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 409,
      code: 'conflict.stale_write',
      failureCode: 'action_no_longer_available',
    });
  });

  it('rejects an open survey with action_no_longer_available', async () => {
    const subject = await seedSubject({ status: 'open' });
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 409,
      code: 'conflict.stale_write',
      failureCode: 'action_no_longer_available',
    });
  });

  it('rejects with recovery_item_resolved when a generated_finding link to an active Finding exists', async () => {
    const subject = await seedSubject();
    const finding = await migrateDb.pool.query<{ id: string }>(
      `insert into finding.findings (
         workspace_id, display_id, primary_managed_system_id, title, summary,
         source_type, source_id, severity, status, created_by
       ) values ($1, core.next_display_id($1::uuid, 'finding'), $2, 'Follow-up finding', 'summary',
         'survey_response', $3, 'medium', 'active', $4) returning id`,
      [WORKSPACE_ID, subject.msId, subject.responseId, grantorActorId],
    );
    const findingId = finding.rows[0]?.id;
    if (!findingId) throw new Error('finding seed failed');
    findingIds.push(findingId);
    await migrateDb.pool.query(
      `insert into core.entity_links (
         workspace_id, source_type, source_id, target_type, target_id, relation_type,
         visibility, status, managed_system_id, created_by
       ) values ($1, 'survey_response', $2, 'finding', $3, 'generated_finding', 'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, subject.responseId, findingId, subject.msId, grantorActorId],
    );
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 409,
      code: 'conflict.stale_write',
      failureCode: 'recovery_item_resolved',
    });
  });

  it('rejects reopen when no current no-follow-up decision exists', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(`/survey-responses/${subject.responseId}/reopen-follow-up`, actor, {
      reason: 'x',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 409,
      code: 'conflict.stale_write',
      failureCode: 'action_no_longer_available',
    });
  });

  it('rejects a blank reason with validation.failed', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(`/survey-responses/${subject.responseId}/mark-no-follow-up`, actor, {
      reason: '   ',
    });
    await assertRejectedCleanly(subject.responseId, res, {
      statusCode: 422,
      code: 'validation.failed',
    });
  });

  it('returns 404 for a response in another workspace', async () => {
    const foreign = await seedForeignSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      foreign.msId,
    );
    const res = await post(`/survey-responses/${foreign.responseId}/mark-no-follow-up`, actor, {
      reason: 'x',
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe('not_found.record');
    const foreignRow = await migrateDb.pool.query(
      'select state from survey.outcome_follow_up_decisions where response_id = $1',
      [foreign.responseId],
    );
    expect(foreignRow.rows).toEqual([]);
  });

  it('requires an Idempotency-Key header', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(
      `/survey-responses/${subject.responseId}/mark-no-follow-up`,
      actor,
      { reason: 'x' },
      null,
    );
    expect(res.statusCode).toBe(422);
    const body = res.json() as {
      code: string;
      detail?: { fields?: Array<{ path: string[] }> };
    };
    expect(body.code).toBe('validation.failed');
    expect(body.detail?.fields?.[0]?.path).toEqual(['headers', 'idempotency-key']);
  });

  it('rejects a malformed Idempotency-Key with validation.malformed_idempotency_key', async () => {
    const subject = await seedSubject();
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const res = await post(
      `/survey-responses/${subject.responseId}/mark-no-follow-up`,
      actor,
      { reason: 'x' },
      'not-a-uuid',
    );
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe('validation.malformed_idempotency_key');
  });

  async function seedForeignSubject(): Promise<Subject> {
    const workspace = await migrateDb.pool.query<{ id: string }>(
      'insert into core.workspaces (name) values ($1) returning id',
      [`${TEST_PREFIX}-foreign`],
    );
    const workspaceId = workspace.rows[0]?.id;
    if (!workspaceId) throw new Error('foreign workspace seed failed');
    secondaryWorkspaceIds.push(workspaceId);
    const ms = await migrateDb.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [workspaceId, `${TEST_PREFIX}-foreign-ms`, 'Foreign MS'],
    );
    const msId = ms.rows[0]?.id;
    if (!msId) throw new Error('foreign managed system seed failed');
    managedSystemIds.push(msId);
    const respondents: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const actor = await migrateDb.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
         values ($1, $2, $3, $2, 'user') returning id`,
        [
          workspaceId,
          `${TEST_PREFIX}-foreign-${randomUUID()}`,
          `${TEST_PREFIX}-f-${randomUUID()}@example.test`,
        ],
      );
      const id = actor.rows[0]?.id;
      if (!id) throw new Error('foreign respondent seed failed');
      secondaryActorIds.push(id);
      respondents.push(id);
    }
    const operator = await migrateDb.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
       values ($1, $2, $3, $2, 'admin') returning id`,
      [workspaceId, `${TEST_PREFIX}-foreign-operator`, `${TEST_PREFIX}-op@example.test`],
    );
    const operatorId = operator.rows[0]?.id;
    if (!operatorId) throw new Error('foreign operator seed failed');
    secondaryActorIds.push(operatorId);
    const survey = await migrateDb.pool.query<{ id: string }>(
      `insert into survey.surveys (
         workspace_id, display_id, type, status, title, primary_managed_system_id,
         operator_actor_id, created_by, opened_at, closed_at
       ) values ($1, $2, 'outcome', 'closed', 'Foreign survey', $3, $4, $4, now(), now()) returning id`,
      [workspaceId, `SRV-foreign-${randomUUID()}`, msId, operatorId],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('foreign survey seed failed');
    secondarySurveyIds.push(surveyId);
    const question = await migrateDb.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, rating_min, rating_max, sort_order, branch_depth)
       values ($1, $2, 'rating', 'Outcome', 1, 5, 0, 0) returning id`,
      [workspaceId, surveyId],
    );
    const questionId = question.rows[0]?.id;
    if (!questionId) throw new Error('foreign question seed failed');
    let responseId = '';
    for (const [index, respondentId] of respondents.entries()) {
      const response = await migrateDb.pool.query<{ id: string }>(
        `insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
         values ($1, $2, $3, true, now()) returning id`,
        [workspaceId, surveyId, respondentId],
      );
      const id = response.rows[0]?.id;
      if (!id) throw new Error('foreign response seed failed');
      if (index === 0) responseId = id;
      await migrateDb.pool.query(
        `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
         values ($1, $2, $3, $4, 'rating', $5::jsonb)`,
        [workspaceId, surveyId, id, questionId, JSON.stringify(index === 0 ? 2 : 5)],
      );
    }
    secondaryResponseIds.push(responseId);
    return { msId, surveyId, responseId };
  }
});
