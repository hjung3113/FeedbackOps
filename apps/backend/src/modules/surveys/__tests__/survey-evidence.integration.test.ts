import { randomUUID } from 'node:crypto';

import {
  approvedExcerptDtoSchema,
  surveyResponseExcerptCandidateDtoSchema,
  surveyResultDtoSchema,
} from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG = 'it-survey-evidence';

describe.skipIf(!runIntegration)('survey response evidence routes (#187 C3)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminId: string;
  let adminCookie: string;
  const foreignWorkspaceIds = new Set<string>();
  type SideEffectExpectation = { count: number; message: string };
  type SideEffectExpectations = {
    audit: SideEffectExpectation;
    approvals: SideEffectExpectation;
  };
  const deniedPathSideEffects: SideEffectExpectations = {
    audit: { count: 0, message: 'denied probes leave no audit side effects before cleanup' },
    approvals: {
      count: 0,
      message: 'denied probes leave no approval side effects before cleanup',
    },
  };
  const personalCandidateReadSideEffects: SideEffectExpectations = {
    audit: { count: 1, message: 'personal candidate read audit rows before cleanup' },
    approvals: { count: 0, message: 'personal candidate read approval rows before cleanup' },
  };
  const approvedExcerptSideEffects: SideEffectExpectations = {
    audit: { count: 4, message: 'approved excerpt audit rows before cleanup' },
    approvals: { count: 2, message: 'approved excerpt rows before cleanup' },
  };
  let expectedSideEffects = deniedPathSideEffects;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const actor = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = actor.rows[0]?.id ?? '';
  });
  beforeEach(async () => {
    expectedSideEffects = deniedPathSideEffects;
    await cleanup();
  });
  afterEach(async () => cleanup(true));
  afterAll(async () => {
    await cleanup();
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup(assertTeardown = false) {
    if (!migrateHandle) return;
    const systems = 'select id from core.managed_systems where workspace_id=$1 and slug like $2';
    const surveys = `select id from survey.surveys where workspace_id=$1 and primary_managed_system_id in (${systems})`;
    const responses = `select id from survey.survey_responses where survey_id in (${surveys})`;
    const approvals = `select id from survey.survey_response_excerpt_approvals where survey_id in (${surveys})`;
    const scopedCounts = async () => {
      const count = async (query: string) => {
        const result = await migrateHandle.pool.query<{ count: string }>(query, [
          WORKSPACE_ID,
          `${SLUG}%`,
        ]);
        return Number(result.rows[0]?.count ?? 0);
      };
      return {
        audit: await count(
          `select count(*)::text as count from core.audit_log where subject_id in (${surveys}) or subject_id in (${responses}) or subject_id in (${approvals})`,
        ),
        approvals: await count(
          `select count(*)::text as count from survey.survey_response_excerpt_approvals where survey_id in (${surveys})`,
        ),
        answers: await count(
          `select count(*)::text as count from survey.survey_response_answers where survey_id in (${surveys})`,
        ),
        responses: await count(
          `select count(*)::text as count from survey.survey_responses where survey_id in (${surveys})`,
        ),
        questions: await count(
          `select count(*)::text as count from survey.survey_questions where survey_id in (${surveys})`,
        ),
        surveys: await count(
          `select count(*)::text as count from survey.surveys where id in (${surveys})`,
        ),
        grants: await count(
          `select count(*)::text as count from permission.permission_grants where workspace_id=$1 and managed_system_id in (${systems})`,
        ),
        sessions: await count(
          'select count(*)::text as count from core.sessions where actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)',
        ),
        actors: await count(
          'select count(*)::text as count from core.actors where workspace_id=$1 and external_id like $2',
        ),
        systems: await count(
          'select count(*)::text as count from core.managed_systems where workspace_id=$1 and slug like $2',
        ),
      };
    };
    const before = await scopedCounts();
    if (assertTeardown) {
      for (const table of ['answers', 'responses', 'questions', 'surveys', 'grants', 'sessions', 'actors', 'systems'] as const)
        expect(before[table], `${table} fixture rows before cleanup`).toBeGreaterThan(0);
      expect(before.audit, expectedSideEffects.audit.message).toBe(expectedSideEffects.audit.count);
      expect(before.approvals, expectedSideEffects.approvals.message).toBe(
        expectedSideEffects.approvals.count,
      );
    }
    await migrateHandle.pool.query(
      `delete from core.audit_log where subject_id in (${surveys}) or subject_id in (${responses}) or subject_id in (${approvals})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_response_excerpt_approvals where survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers where survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_responses where survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_questions where survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(`delete from survey.surveys where id in (${surveys})`, [
      WORKSPACE_ID,
      `${SLUG}%`,
    ]);
    await migrateHandle.pool.query(
      `delete from permission.permission_grants where workspace_id=$1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.sessions where actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)',
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      'delete from core.actors where workspace_id=$1 and external_id like $2',
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id=$1 and slug like $2',
      [WORKSPACE_ID, `${SLUG}%`],
    );
    for (const workspaceId of foreignWorkspaceIds) {
      const foreignCounts = async () => {
        const count = async (table: string, where = 'workspace_id=$1') => {
          const result = await migrateHandle.pool.query<{ count: string }>(
            `select count(*)::text as count from ${table} where ${where}`,
            [workspaceId],
          );
          return Number(result.rows[0]?.count ?? 0);
        };
        return {
          audit: await count('core.audit_log'),
          approvals: await count('survey.survey_response_excerpt_approvals'),
          answers: await count('survey.survey_response_answers'),
          responses: await count('survey.survey_responses'),
          questions: await count('survey.survey_questions'),
          surveys: await count('survey.surveys'),
          grants: await count('permission.permission_grants'),
          sessions: await count(
            'core.sessions',
            'actor_id in (select id from core.actors where workspace_id=$1)',
          ),
          actors: await count('core.actors'),
          systems: await count('core.managed_systems'),
          workspaces: await count('core.workspaces', 'id=$1'),
        };
      };
      const foreignBefore = await foreignCounts();
      if (assertTeardown) {
        for (const table of [
          'answers',
          'responses',
          'questions',
          'surveys',
          'actors',
          'systems',
          'workspaces',
        ] as const)
          expect(foreignBefore[table], `foreign ${table} fixture rows before cleanup`).toBeGreaterThan(0);
        expect(foreignBefore.audit, 'foreign denied probes leave no audit side effects before cleanup').toBe(0);
        expect(
          foreignBefore.approvals,
          'foreign denied probes leave no approval side effects before cleanup',
        ).toBe(0);
        expect(foreignBefore.grants, 'foreign fixture grant rows before cleanup').toBe(0);
        expect(foreignBefore.sessions, 'foreign fixture session rows before cleanup').toBe(0);
      }
      await migrateHandle.pool.query('delete from core.audit_log where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        'delete from survey.survey_response_excerpt_approvals where workspace_id=$1',
        [workspaceId],
      );
      await migrateHandle.pool.query(
        'delete from survey.survey_response_answers where workspace_id=$1',
        [workspaceId],
      );
      await migrateHandle.pool.query('delete from survey.survey_responses where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from survey.survey_questions where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from survey.surveys where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        'delete from permission.permission_grants where workspace_id=$1',
        [workspaceId],
      );
      await migrateHandle.pool.query(
        'delete from core.sessions where actor_id in (select id from core.actors where workspace_id=$1)',
        [workspaceId],
      );
      await migrateHandle.pool.query('delete from core.actors where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.managed_systems where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.workspaces where id=$1', [workspaceId]);
      if (assertTeardown) {
        for (const [table, count] of Object.entries(await foreignCounts()))
          expect(count, `foreign ${table} rows after cleanup`).toBe(0);
      }
    }
    foreignWorkspaceIds.clear();
    if (assertTeardown) {
      for (const count of Object.values(await scopedCounts())) expect(count).toBe(0);
    }
  }

  async function actor() {
    const externalId = `${SLUG}-${randomUUID()}`;
    const inserted = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Evidence developer','developer','internal_member') returning id",
      [WORKSPACE_ID, externalId, `${externalId}@example.test`],
    );
    return { id: inserted.rows[0]?.id ?? '', cookie: await loginAs(app, externalId) };
  }
  async function grant(actorId: string, capability: string, managedSystemId: string) {
    await migrateHandle.pool.query(
      'insert into permission.permission_grants (workspace_id,actor_id,capability,managed_system_id,granted_by_actor_id) values ($1,$2,$3,$4,$5)',
      [WORKSPACE_ID, actorId, capability, managedSystemId, adminId],
    );
  }
  async function seed(status: 'draft' | 'open' = 'open') {
    const msId = await insertMsDirectly(migrateHandle, WORKSPACE_ID, uid(SLUG), 'Evidence MS');
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at)
       values ($1,$2,'outcome',$3,'Evidence survey',$4,$5,true,$5,case when $3='open' then now() else null end) returning id`,
      [WORKSPACE_ID, `S-${randomUUID()}`, status, msId, adminId],
    );
    const surveyId = survey.rows[0]?.id ?? '';
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,sort_order,branch_depth)
       values ($1,$2,'text','What should we improve?',true,0,0) returning id`,
      [WORKSPACE_ID, surveyId],
    );
    const questionId = question.rows[0]?.id ?? '';
    const response = await migrateHandle.pool.query<{ id: string }>(
      'insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,true,now()) returning id',
      [WORKSPACE_ID, surveyId, adminId],
    );
    const responseId = response.rows[0]?.id ?? '';
    await migrateHandle.pool.query(
      "insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,'text',$5::jsonb)",
      [WORKSPACE_ID, surveyId, responseId, questionId, JSON.stringify('Raw private response text')],
    );
    return { msId, surveyId, questionId, responseId };
  }
  function post(url: string, body: object, cookie: string) {
    return app.inject({
      method: 'POST',
      url,
      payload: body,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  async function seedForeignResponse() {
    const workspaceId = randomUUID();
    foreignWorkspaceIds.add(workspaceId);
    await migrateHandle.pool.query('insert into core.workspaces (id,name) values ($1,$2)', [
      workspaceId,
      `${SLUG} foreign workspace`,
    ]);
    const foreignActor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type)
       values ($1,$2,$3,'Foreign admin','admin','internal_member') returning id`,
      [
        workspaceId,
        `${SLUG}-foreign-${workspaceId}`,
        `${SLUG}-foreign-${workspaceId}@example.test`,
      ],
    );
    const actorId = foreignActor.rows[0]?.id;
    if (!actorId) throw new Error('foreign actor seed failed');
    const msId = await insertMsDirectly(
      migrateHandle,
      workspaceId,
      uid(`${SLUG}-foreign`),
      'Foreign MS',
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at)
       values ($1,$2,'outcome','open','Foreign evidence survey',$3,$4,true,$4,now()) returning id`,
      [workspaceId, `S-${randomUUID()}`, msId, actorId],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('foreign survey seed failed');
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,sort_order,branch_depth)
       values ($1,$2,'text','Foreign question',true,0,0) returning id`,
      [workspaceId, surveyId],
    );
    const response = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at)
       values ($1,$2,$3,true,now()) returning id`,
      [workspaceId, surveyId, actorId],
    );
    const responseId = response.rows[0]?.id;
    if (!responseId) throw new Error('foreign response seed failed');
    await migrateHandle.pool.query(
      `insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value)
       values ($1,$2,$3,$4,'text',$5::jsonb)`,
      [
        workspaceId,
        surveyId,
        responseId,
        question.rows[0]?.id,
        JSON.stringify('Foreign private response'),
      ],
    );
    return { workspaceId, responseId };
  }

  it('reads one personal candidate and audits without raw text', async () => {
    expectedSideEffects = personalCandidateReadSideEffects;
    const source = await seed();
    const reader = await actor();
    await grant(reader.id, 'survey.read', source.msId);
    await grant(reader.id, 'survey.read_personal_responses', source.msId);
    const response = await post(
      `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
      { question_id: source.questionId },
      reader.cookie,
    );
    expect(response.statusCode).toBe(200);
    expect(surveyResponseExcerptCandidateDtoSchema.parse(response.json())).toEqual({
      question_id: source.questionId,
      question_label: 'What should we improve?',
      raw_text: 'Raw private response text',
    });
    const audit = await migrateHandle.pool.query<{ detail: object }>(
      "select detail from core.audit_log where event_type='survey_response_personal_read' and subject_id=$1",
      [source.responseId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.detail).toEqual({
      survey_id: source.surveyId,
      survey_response_id: source.responseId,
      question_id: source.questionId,
    });
    expect(JSON.stringify(audit.rows[0]?.detail)).not.toContain('Raw private response text');
  });

  it('collapses all candidate existence and read probes to the identical 404 body', async () => {
    expectedSideEffects = deniedPathSideEffects;
    const source = await seed();
    const foreign = await seedForeignResponse();
    const unreadable = await actor();
    const readOnly = await actor();
    const authorized = await actor();
    await grant(readOnly.id, 'survey.read', source.msId);
    await grant(authorized.id, 'survey.read', source.msId);
    await grant(authorized.id, 'survey.read_personal_responses', source.msId);
    const oracleCases = await Promise.all([
      post(
        `/survey-responses/${randomUUID()}/evidence-excerpt-candidates`,
        { question_id: source.questionId },
        adminCookie,
      ),
      post(
        `/survey-responses/${foreign.responseId}/evidence-excerpt-candidates`,
        { question_id: source.questionId },
        adminCookie,
      ),
      post(
        `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
        { question_id: source.questionId },
        unreadable.cookie,
      ),
      post(
        `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
        { question_id: source.questionId },
        readOnly.cookie,
      ),
      post(
        `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
        { question_id: source.questionId },
        adminCookie,
      ),
    ]);
    const bodies = oracleCases.map(
      (response) => response.json() as { code: string; message: string; detail?: unknown },
    );
    expect(oracleCases.every((response) => response.statusCode === 404)).toBe(true);
    expect(bodies).toEqual(Array.from({ length: 5 }, () => bodies[0]));
    const wrongQuestion = await post(
      `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
      { question_id: randomUUID() },
      authorized.cookie,
    );
    expect(wrongQuestion.statusCode).toBe(404);
    expect(wrongQuestion.json()).toEqual(bodies[0]);
  });

  it('returns draft conflict only to a fully authorized personal reader', async () => {
    expectedSideEffects = deniedPathSideEffects;
    const source = await seed('draft');
    const authorized = await actor();
    const unauthorized = await actor();
    await grant(authorized.id, 'survey.read', source.msId);
    await grant(authorized.id, 'survey.read_personal_responses', source.msId);
    const body = { question_id: source.questionId };
    expect(
      (
        await post(
          `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
          body,
          authorized.cookie,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          `/survey-responses/${source.responseId}/evidence-excerpt-candidates`,
          body,
          unauthorized.cookie,
        )
      ).statusCode,
    ).toBe(404);
  });

  it('collapses all approval source and access probes to 404, including an authorized wrong question', async () => {
    expectedSideEffects = deniedPathSideEffects;
    const source = await seed();
    const foreign = await seedForeignResponse();
    const unreadable = await actor();
    const readOnly = await actor();
    const authorized = await actor();
    await grant(readOnly.id, 'survey.read', source.msId);
    await grant(authorized.id, 'survey.read', source.msId);
    await grant(authorized.id, 'survey.read_personal_responses', source.msId);
    await grant(authorized.id, 'survey.manage', source.msId);
    const input = { question_id: source.questionId, redacted_excerpt: 'Safe excerpt' };
    const responses = await Promise.all([
      post(`/survey-responses/${randomUUID()}/approved-excerpts`, input, adminCookie),
      post(`/survey-responses/${foreign.responseId}/approved-excerpts`, input, adminCookie),
      post(`/survey-responses/${source.responseId}/approved-excerpts`, input, unreadable.cookie),
      post(`/survey-responses/${source.responseId}/approved-excerpts`, input, readOnly.cookie),
      post(
        `/survey-responses/${source.responseId}/approved-excerpts`,
        { ...input, question_id: randomUUID() },
        authorized.cookie,
      ),
    ]);
    const bodies = responses.map((response) => response.json());
    expect(responses.every((response) => response.statusCode === 404)).toBe(true);
    expect(bodies).toEqual(Array.from({ length: 5 }, () => bodies[0]));
  });

  it('approves duplicate excerpts, records ID-only audit detail, and flips active results excerpts', async () => {
    expectedSideEffects = approvedExcerptSideEffects;
    const source = await seed();
    const approver = await actor();
    await grant(approver.id, 'survey.read', source.msId);
    await grant(approver.id, 'survey.read_personal_responses', source.msId);
    await grant(approver.id, 'survey.manage', source.msId);
    const input = { question_id: source.questionId, redacted_excerpt: 'Approved safe excerpt' };
    // Five responses keep the aggregate visible to a reader without the personal capability.
    for (let index = 0; index < 4; index += 1) {
      const respondent = await actor();
      const response = await migrateHandle.pool.query<{ id: string }>(
        'insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,true,now()) returning id',
        [WORKSPACE_ID, source.surveyId, respondent.id],
      );
      await migrateHandle.pool.query(
        "insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,'text',$5::jsonb)",
        [
          WORKSPACE_ID,
          source.surveyId,
          response.rows[0]?.id,
          source.questionId,
          JSON.stringify('Another private response'),
        ],
      );
    }
    const first = await post(
      `/survey-responses/${source.responseId}/approved-excerpts`,
      input,
      approver.cookie,
    );
    const second = await post(
      `/survey-responses/${source.responseId}/approved-excerpts`,
      input,
      approver.cookie,
    );
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const approved = approvedExcerptDtoSchema.parse(first.json());
    const duplicate = approvedExcerptDtoSchema.parse(second.json());
    const rows = await migrateHandle.pool.query<{ count: string }>(
      'select count(*)::text as count from survey.survey_response_excerpt_approvals where response_id=$1 and revoked_at is null',
      [source.responseId],
    );
    expect(rows.rows[0]?.count).toBe('2');
    const audit = await migrateHandle.pool.query<{ detail: object }>(
      "select detail from core.audit_log where event_type='survey_response_excerpt_approved' and subject_id=$1",
      [approved.approved_excerpt_id],
    );
    expect(audit.rows[0]?.detail).toEqual({
      survey_id: source.surveyId,
      survey_response_id: source.responseId,
      question_id: source.questionId,
      approved_excerpt_id: approved.approved_excerpt_id,
    });
    expect(JSON.stringify(audit.rows[0]?.detail)).not.toContain(input.redacted_excerpt);
    const safeReader = await actor();
    await grant(safeReader.id, 'survey.read', source.msId);
    const results = await app.inject({
      method: 'GET',
      url: `/surveys/${source.surveyId}/results`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${safeReader.cookie}` },
    });
    const body = surveyResultDtoSchema.parse(results.json());
    expect(JSON.stringify(body)).not.toContain(source.responseId);
    expect(
      body.questions.find((question) => question.question_id === source.questionId),
    ).toMatchObject({
      excerpts: expect.arrayContaining([
        { id: approved.approved_excerpt_id, text: input.redacted_excerpt },
      ]),
    });
    await migrateHandle.pool.query(
      'update survey.survey_response_excerpt_approvals set revoked_at=now() where id=$1',
      [approved.approved_excerpt_id],
    );
    const revoked = surveyResultDtoSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/surveys/${source.surveyId}/results`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${safeReader.cookie}` },
        })
      ).json(),
    );
    const revokedQuestion = revoked.questions.find(
      (question) => question.question_id === source.questionId,
    );
    expect(revokedQuestion?.visibility).toBe('visible');
    if (revokedQuestion?.visibility !== 'visible' || revokedQuestion.kind !== 'text')
      throw new Error('expected visible text result');
    expect(revokedQuestion.excerpts.map((excerpt) => excerpt.id)).toEqual([
      duplicate.approved_excerpt_id,
    ]);
  });

  it('returns 403 only after a personal reader lacks survey.manage and preserves 404 for admin without personal grant', async () => {
    expectedSideEffects = deniedPathSideEffects;
    const source = await seed();
    const personalReader = await actor();
    await grant(personalReader.id, 'survey.read', source.msId);
    await grant(personalReader.id, 'survey.read_personal_responses', source.msId);
    const input = { question_id: source.questionId, redacted_excerpt: 'Safe excerpt' };
    expect(
      (
        await post(
          `/survey-responses/${source.responseId}/approved-excerpts`,
          input,
          personalReader.cookie,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await post(`/survey-responses/${source.responseId}/approved-excerpts`, input, adminCookie))
        .statusCode,
    ).toBe(404);
  });
});
