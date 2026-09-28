// #510 part C (ADR-0055): route-level contracts for the outcome follow-up
// READ endpoint. Fixtures are seeded through the migrate handle; sessions are
// seeded via SQL (submit-more-info pattern) so this suite never spends the
// shared mock-login rate-limit bucket, and each test uses its own actor.
//
// The non-holder payload is the disclosure boundary (ADR-0055 part C): it
// must carry the survey-grain booleans only — no counts, no response ids, no
// per-response flags — and a holder read must audit one
// survey_response_personal_read row per exposed (response, low-answer
// question) pair, exactly like a holder result read.
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
const TEST_PREFIX = `survey-followup-read-${randomUUID()}`;

type Actor = { id: string; externalId: string; roleLevel: string; cookie: string };
type Resolution =
  | 'open'
  | 'finding'
  | 'no_follow_up'
  | 'reopened'
  | 'archived_finding'
  | 'finding_and_no_follow_up';
type SeededSurvey = {
  msId: string;
  surveyId: string;
  lowQuestionId: string;
  midQuestionId: string;
  /** extra low-band question answered only by the first response, when requested */
  qualityQuestionId: string | null;
  /** submission order, oldest first — response_number is index + 1 */
  responseIds: string[];
  poorResponseIds: string[];
  /** every seeded Finding, earliest-created first within a response */
  findings: Array<{ id: string; display_id: string }>;
};
type FollowUpItem = {
  response_id: string;
  response_number: number;
  submitted_at: string;
  low_answers: Array<{
    question_id: string;
    question_label: string;
    value: number;
    rating_min: number;
    rating_max: number;
  }>;
  resolution: string;
  finding: { id: string; display_id: string; status: string } | null;
  decision: { state: string; reason: string; updated_at: string } | null;
  next_actions: Array<Record<string, unknown>>;
};
type FollowUpBody = {
  survey_id: string;
  classifiable: boolean;
  follow_up_needed: boolean;
  personal_access: boolean;
  items: FollowUpItem[] | null;
};

describe.skipIf(!runIntegration)('GET /surveys/:id/outcome-follow-up (#510)', () => {
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

  const get = async (url: string, actor: Actor) =>
    await app.inject({
      method: 'GET',
      url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actor.cookie}` },
    });

  const readFollowUp = async (surveyId: string, actor: Actor): Promise<FollowUpBody> => {
    const res = await get(`/surveys/${surveyId}/outcome-follow-up`, actor);
    expect(res.statusCode).toBe(200);
    return res.json() as FollowUpBody;
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

  /**
   * One survey with two rating questions on a 1-5 scale (low band 1-2, mid
   * 3-4): "Did this release help?" carries the per-response rating under
   * test, "How was the speed?" always answers 3 so a mid-band answer exists
   * on every response and must never be listed as a low answer. `resolve`
   * seeds per-response resolution state: 'finding' creates two live
   * generated_finding links (the earlier-created Finding must win),
   * 'archived_finding' links a Finding whose status reopens the gap, and
   * 'finding_and_no_follow_up' stacks a live link on a no-follow-up decision
   * (Finding precedence). `secondLowOnFirst` adds a third low-band question
   * answered only by the first response.
   */
  async function seedSurvey(options: {
    type?: 'outcome' | 'discovery';
    status?: 'draft' | 'open' | 'closed';
    ratings: number[];
    resolve?: Resolution[];
    secondLowOnFirst?: boolean;
  }): Promise<SeededSurvey> {
    const type = options.type ?? 'outcome';
    const status = options.status ?? 'closed';
    const resolve = options.resolve ?? [];
    const ms = await migrateDb.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [WORKSPACE_ID, `${TEST_PREFIX}-ms-${randomUUID()}`, 'Follow-up MS'],
    );
    const msId = ms.rows[0]?.id;
    if (!msId) throw new Error('managed system seed failed');
    managedSystemIds.push(msId);
    const respondents: string[] = [];
    for (let index = 0; index < options.ratings.length; index += 1) {
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
    const lowQuestion = await migrateDb.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, rating_min, rating_max, sort_order, branch_depth)
       values ($1, $2, 'rating', 'Did this release help?', 1, 5, 0, 0) returning id`,
      [WORKSPACE_ID, surveyId],
    );
    const lowQuestionId = lowQuestion.rows[0]?.id;
    if (!lowQuestionId) throw new Error('low question seed failed');
    const midQuestion = await migrateDb.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, rating_min, rating_max, sort_order, branch_depth)
       values ($1, $2, 'rating', 'How was the speed?', 1, 5, 1, 0) returning id`,
      [WORKSPACE_ID, surveyId],
    );
    const midQuestionId = midQuestion.rows[0]?.id;
    if (!midQuestionId) throw new Error('mid question seed failed');
    let qualityQuestionId: string | null = null;
    if (options.secondLowOnFirst) {
      const qualityQuestion = await migrateDb.pool.query<{ id: string }>(
        `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, rating_min, rating_max, sort_order, branch_depth)
         values ($1, $2, 'rating', 'How was the quality?', 1, 5, 2, 0) returning id`,
        [WORKSPACE_ID, surveyId],
      );
      qualityQuestionId = qualityQuestion.rows[0]?.id ?? null;
      if (!qualityQuestionId) throw new Error('quality question seed failed');
    }
    const localResponseIds: string[] = [];
    const poorResponseIds: string[] = [];
    const findings: Array<{ id: string; display_id: string }> = [];
    const total = options.ratings.length;
    for (const [index, respondentId] of respondents.entries()) {
      const rating = options.ratings[index] ?? 5;
      const response = await migrateDb.pool.query<{ id: string }>(
        `insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
         values ($1, $2, $3, true, now() - ($4 || ' minutes')::interval) returning id`,
        [WORKSPACE_ID, surveyId, respondentId, total - index],
      );
      const responseId = response.rows[0]?.id;
      if (!responseId) throw new Error('response seed failed');
      localResponseIds.push(responseId);
      responseIds.push(responseId);
      for (const [questionId, value] of [
        [lowQuestionId, rating],
        [midQuestionId, 3],
      ] as Array<[string, number]>) {
        await migrateDb.pool.query(
          `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
           values ($1, $2, $3, $4, 'rating', $5::jsonb)`,
          [WORKSPACE_ID, surveyId, responseId, questionId, JSON.stringify(value)],
        );
      }
      if (index === 0 && qualityQuestionId) {
        await migrateDb.pool.query(
          `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
           values ($1, $2, $3, $4, 'rating', $5::jsonb)`,
          [WORKSPACE_ID, surveyId, responseId, qualityQuestionId, JSON.stringify(1)],
        );
      }
      const poor = rating <= 2;
      if (poor) poorResponseIds.push(responseId);
      const resolution = resolve[index] ?? 'open';
      if (!poor || resolution === 'open') continue;
      const insertDecision = async (state: 'no_follow_up' | 'reopened', reason: string) => {
        await migrateDb.pool.query(
          `insert into survey.outcome_follow_up_decisions (
             workspace_id, survey_id, response_id, managed_system_id, state, reason, decided_by_actor_id
           ) values ($1, $2, $3, $4, $5, $6, $7)`,
          [WORKSPACE_ID, surveyId, responseId, msId, state, reason, grantorActorId],
        );
      };
      if (resolution === 'finding' || resolution === 'finding_and_no_follow_up') {
        // 'finding' seeds two live links so the earliest-created Finding must
        // win; the combined case stacks one live link on a no-follow-up
        // decision to pin the Finding precedence.
        const liveLinks = resolution === 'finding' ? 2 : 1;
        for (let number = 0; number < liveLinks; number += 1) {
          const finding = await migrateDb.pool.query<{ id: string; display_id: string }>(
            `insert into finding.findings (
               workspace_id, display_id, primary_managed_system_id, title, summary,
               source_type, source_id, severity, status, created_by, created_at
             ) values ($1, core.next_display_id($1::uuid, 'finding'), $2, 'Follow-up finding', 'summary',
               'survey_response', $3, 'medium', 'active', $4, now() - ($5 || ' hours')::interval)
             returning id, display_id`,
            [WORKSPACE_ID, msId, responseId, grantorActorId, String(2 - number)],
          );
          const row = finding.rows[0];
          if (!row) throw new Error('finding seed failed');
          findingIds.push(row.id);
          findings.push(row);
          await migrateDb.pool.query(
            `insert into core.entity_links (
               workspace_id, source_type, source_id, target_type, target_id, relation_type,
               visibility, status, managed_system_id, created_by
             ) values ($1, 'survey_response', $2, 'finding', $3, 'generated_finding', 'internal_only', 'active', $4, $5)`,
            [WORKSPACE_ID, responseId, row.id, msId, grantorActorId],
          );
        }
        if (resolution === 'finding_and_no_follow_up')
          await insertDecision('no_follow_up', 'Handled outside the tool.');
      } else if (resolution === 'archived_finding') {
        const finding = await migrateDb.pool.query<{ id: string; display_id: string }>(
          `insert into finding.findings (
             workspace_id, display_id, primary_managed_system_id, title, summary,
             source_type, source_id, severity, status, created_by
           ) values ($1, core.next_display_id($1::uuid, 'finding'), $2, 'Archived finding', 'summary',
             'survey_response', $3, 'medium', 'archived', $4) returning id, display_id`,
          [WORKSPACE_ID, msId, responseId, grantorActorId],
        );
        const row = finding.rows[0];
        if (!row) throw new Error('archived finding seed failed');
        findingIds.push(row.id);
        findings.push(row);
        await migrateDb.pool.query(
          `insert into core.entity_links (
             workspace_id, source_type, source_id, target_type, target_id, relation_type,
             visibility, status, managed_system_id, created_by
           ) values ($1, 'survey_response', $2, 'finding', $3, 'generated_finding', 'internal_only', 'active', $4, $5)`,
          [WORKSPACE_ID, responseId, row.id, msId, grantorActorId],
        );
      } else {
        await insertDecision(
          resolution,
          resolution === 'no_follow_up'
            ? 'Handled outside the tool.'
            : 'Linked Finding archived; follow-up needed again.',
        );
      }
    }
    return {
      msId,
      surveyId,
      lowQuestionId,
      midQuestionId,
      qualityQuestionId,
      responseIds: localResponseIds,
      poorResponseIds,
      findings,
    };
  }

  async function seedForeignSurvey(): Promise<string> {
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
    return surveyId;
  }

  async function personalReadRows(responseId: string) {
    const { rows } = await db.pool.query<{ actor_id: string; detail: Record<string, unknown> }>(
      'select actor_id, detail from core.audit_log where workspace_id = $1 and subject_id = $2 and event_type = $3',
      [WORKSPACE_ID, responseId, 'survey_response_personal_read'],
    );
    return rows;
  }

  it('gives a non-holder only the survey-grain booleans', async () => {
    const subject = await seedSurvey({ ratings: [2, 5, 5, 5, 5] });
    const actor = await createActor('developer', ['survey.read'], subject.msId);
    const res = await get(`/surveys/${subject.surveyId}/outcome-follow-up`, actor);
    expect(res.statusCode).toBe(200);
    const body = res.json() as FollowUpBody;
    expect(body).toEqual({
      survey_id: subject.surveyId,
      classifiable: true,
      follow_up_needed: true,
      personal_access: false,
      items: null,
    });
    // No count field and no response id may appear anywhere in the payload.
    const serialized = JSON.stringify(body);
    for (const responseId of subject.responseIds) expect(serialized).not.toContain(responseId);
    expect(Object.keys(body).some((key) => key.toLowerCase().includes('count'))).toBe(false);
  });

  it('reports follow_up_needed false when the only poor response is resolved', async () => {
    const subject = await seedSurvey({ ratings: [2, 5, 5, 5, 5], resolve: ['no_follow_up'] });
    const actor = await createActor('developer', ['survey.read'], subject.msId);
    expect(await readFollowUp(subject.surveyId, actor)).toEqual({
      survey_id: subject.surveyId,
      classifiable: true,
      follow_up_needed: false,
      personal_access: false,
      items: null,
    });
  });

  it('excludes a below-threshold survey from classification', async () => {
    const subject = await seedSurvey({ ratings: [2, 5, 5, 5] });
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses'],
      subject.msId,
    );
    expect(await readFollowUp(subject.surveyId, actor)).toEqual({
      survey_id: subject.surveyId,
      classifiable: false,
      follow_up_needed: false,
      personal_access: true,
      items: [],
    });
  });

  it('returns every poor response with all-response ordinals, low answers only, and per-case resolution', async () => {
    const subject = await seedSurvey({
      // Poor responses sit at submission positions 2/4/5/6 of 6, so the
      // ordinals prove the numbering runs over ALL responses, not the poor
      // subset (and not by id alone).
      ratings: [5, 2, 5, 2, 2, 2],
      resolve: ['open', 'open', 'open', 'finding', 'no_follow_up', 'reopened'],
    });
    // finding.read is needed for item.finding to be disclosed (Finding read scope).
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage', 'finding.read'],
      subject.msId,
    );
    const body = await readFollowUp(subject.surveyId, actor);
    expect(body.personal_access).toBe(true);
    expect(body.classifiable).toBe(true);
    expect(body.follow_up_needed).toBe(true);
    const items = body.items ?? [];
    expect(items.map((item) => item.response_id)).toEqual(subject.poorResponseIds);
    expect(items.map((item) => item.response_number)).toEqual([2, 4, 5, 6]);
    for (const item of items) expect(Date.parse(item.submitted_at)).not.toBeNaN();
    expect(items[0]).toMatchObject({
      response_id: subject.responseIds[1],
      resolution: 'open',
      finding: null,
      decision: null,
    });
    expect(items[0]?.low_answers).toEqual([
      {
        question_id: subject.lowQuestionId,
        question_label: 'Did this release help?',
        value: 2,
        rating_min: 1,
        rating_max: 5,
      },
    ]);
    // The same response's mid-band answer must not be listed.
    expect(JSON.stringify(items[0]?.low_answers)).not.toContain(subject.midQuestionId);
    expect(items[1]?.resolution).toBe('finding');
    // The earlier-created of the two live Findings is the qualifying one.
    expect(items[1]?.finding).toEqual({
      id: subject.findings[0]?.id,
      display_id: subject.findings[0]?.display_id,
      status: 'active',
    });
    expect(items[1]?.finding?.id).not.toBe(subject.findings[1]?.id);
    expect(items[2]?.resolution).toBe('no_follow_up');
    expect(items[2]?.finding).toBeNull();
    expect(items[2]?.decision).toMatchObject({
      state: 'no_follow_up',
      reason: 'Handled outside the tool.',
    });
    expect(items[3]?.resolution).toBe('open');
    expect(items[3]?.decision).toMatchObject({
      state: 'reopened',
      reason: 'Linked Finding archived; follow-up needed again.',
    });
    expect(Date.parse(items[2]?.decision?.updated_at ?? '')).not.toBeNaN();
  });

  it('gates per-item next_actions on finding.manage and resolution', async () => {
    const subject = await seedSurvey({
      ratings: [2, 2, 2, 5, 5],
      resolve: ['open', 'no_follow_up', 'finding'],
    });
    const requestable = { permission: 'finding.manage', managed_system_id: subject.msId };
    const blocked = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses'],
      subject.msId,
    );
    const blockedBody = await readFollowUp(subject.surveyId, blocked);
    expect(blockedBody.items?.[0]?.next_actions).toEqual([
      {
        id: 'create_finding',
        availability: 'blocked_requestable',
        requestable_permission: requestable,
      },
      {
        id: 'mark_no_follow_up',
        availability: 'blocked_requestable',
        requestable_permission: requestable,
      },
    ]);
    expect(blockedBody.items?.[1]?.next_actions).toEqual([
      {
        id: 'reopen_follow_up',
        availability: 'blocked_requestable',
        requestable_permission: requestable,
      },
    ]);
    const manager = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.manage'],
      subject.msId,
    );
    const managedBody = await readFollowUp(subject.surveyId, manager);
    expect(managedBody.items?.[0]?.next_actions).toEqual([
      { id: 'create_finding', availability: 'allowed' },
      { id: 'mark_no_follow_up', availability: 'allowed' },
    ]);
    expect(managedBody.items?.[1]?.next_actions).toEqual([
      { id: 'reopen_follow_up', availability: 'allowed' },
    ]);
    // A Finding resolution offers no follow-up actions.
    expect(managedBody.items?.[2]?.next_actions).toEqual([]);
    // Admin role bypasses finding.manage once the personal grant is explicit.
    const admin = await createActor('admin', ['survey.read_personal_responses'], subject.msId);
    const adminBody = await readFollowUp(subject.surveyId, admin);
    expect(adminBody.items?.[0]?.next_actions).toEqual([
      { id: 'create_finding', availability: 'allowed' },
      { id: 'mark_no_follow_up', availability: 'allowed' },
    ]);
  });

  it('filters item.finding by the caller Finding read scope while resolution stays finding', async () => {
    const subject = await seedSurvey({ ratings: [2, 5, 5, 5, 5], resolve: ['finding'] });
    const withoutFindingRead = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses'],
      subject.msId,
    );
    const hidden = await readFollowUp(subject.surveyId, withoutFindingRead);
    expect(hidden.personal_access).toBe(true);
    expect(hidden.items?.[0]).toMatchObject({
      response_id: subject.responseIds[0],
      resolution: 'finding',
      finding: null,
    });
    const withFindingRead = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses', 'finding.read'],
      subject.msId,
    );
    const visible = await readFollowUp(subject.surveyId, withFindingRead);
    expect(visible.items?.[0]?.resolution).toBe('finding');
    expect(visible.items?.[0]?.finding).toEqual({
      id: subject.findings[0]?.id,
      display_id: subject.findings[0]?.display_id,
      status: 'active',
    });
  });

  it('does not grant personal access to Admin without the explicit capability', async () => {
    const subject = await seedSurvey({ ratings: [2, 5, 5, 5, 5] });
    const actor = await createActor('admin');
    expect(await readFollowUp(subject.surveyId, actor)).toEqual({
      survey_id: subject.surveyId,
      classifiable: true,
      follow_up_needed: true,
      personal_access: false,
      items: null,
    });
  });

  it('audits one personal read per (response, low-answer question) for holders only', async () => {
    // The poor response answers TWO low-band questions, so the audit must
    // carry one row per question, not one per response.
    const subject = await seedSurvey({ ratings: [2, 5, 5, 5, 5], secondLowOnFirst: true });
    const poorResponseId = subject.responseIds[0] ?? '';
    const nonHolder = await createActor('developer', ['survey.read'], subject.msId);
    expect((await readFollowUp(subject.surveyId, nonHolder)).personal_access).toBe(false);
    expect(await personalReadRows(poorResponseId)).toEqual([]);
    const holder = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses'],
      subject.msId,
    );
    const body = await readFollowUp(subject.surveyId, holder);
    expect(body.items?.[0]?.low_answers.map((answer) => answer.question_id).sort()).toEqual(
      [subject.lowQuestionId, subject.qualityQuestionId].filter(Boolean).sort(),
    );
    const rows = await personalReadRows(poorResponseId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.detail.question_id).sort()).toEqual(
      [subject.lowQuestionId, subject.qualityQuestionId].filter(Boolean).sort(),
    );
    for (const row of rows) {
      expect(row.actor_id).toBe(holder.id);
      expect(row.detail).toMatchObject({
        survey_id: subject.surveyId,
        survey_response_id: poorResponseId,
      });
    }
  });

  it('matches read_outcome_follow_up_state resolution for every seeded response', async () => {
    const subject = await seedSurvey({
      // Poor at positions 2/4/5/6/7/8; the last two pin the archived-Finding
      // reopen and the Finding-over-decision precedence.
      ratings: [5, 2, 5, 2, 2, 2, 2, 2],
      resolve: [
        'open',
        'open',
        'open',
        'finding',
        'no_follow_up',
        'reopened',
        'archived_finding',
        'finding_and_no_follow_up',
      ],
    });
    const actor = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses'],
      subject.msId,
    );
    const body = await readFollowUp(subject.surveyId, actor);
    const items = body.items ?? [];
    // Non-vacuity guard: the returned set must be exactly the seeded poor set
    // before any per-item comparison runs.
    expect(items).toHaveLength(subject.poorResponseIds.length);
    expect([...items.map((item) => item.response_id)].sort()).toEqual(
      [...subject.poorResponseIds].sort(),
    );
    for (const item of items) {
      const state = await db.pool.query<{ resolution: string }>(
        'select resolution from survey.read_outcome_follow_up_state($1::uuid, $2::uuid)',
        [WORKSPACE_ID, item.response_id],
      );
      expect(state.rows[0]?.resolution).toBe(item.resolution);
    }
    // An archived Finding does not resolve the gap.
    const archived = items.find((item) => item.response_id === subject.responseIds[6]);
    expect(archived?.resolution).toBe('open');
    expect(archived?.finding).toBeNull();
    // A live Finding wins over a standing no-follow-up decision.
    const both = items.find((item) => item.response_id === subject.responseIds[7]);
    expect(both?.resolution).toBe('finding');
    expect(both?.decision).toMatchObject({ state: 'no_follow_up' });
    // The non-poor responses are classified but never listed.
    for (const goodIndex of [0, 2]) {
      const goodResponseId = subject.responseIds[goodIndex] ?? '';
      const good = await db.pool.query<{ is_poor: boolean }>(
        'select is_poor from survey.read_outcome_follow_up_state($1::uuid, $2::uuid)',
        [WORKSPACE_ID, goodResponseId],
      );
      expect(good.rows[0]?.is_poor).toBe(false);
      expect(items.some((item) => item.response_id === goodResponseId)).toBe(false);
    }
  });

  it('classifies open surveys as not classifiable and guards draft/type/workspace/id', async () => {
    const admin = await createActor('admin');
    const openSubject = await seedSurvey({ status: 'open', ratings: [2, 5, 5, 5, 5] });
    expect(await readFollowUp(openSubject.surveyId, admin)).toEqual({
      survey_id: openSubject.surveyId,
      classifiable: false,
      follow_up_needed: false,
      personal_access: false,
      items: null,
    });
    // The closed-survey gate also holds for a holder: no items on an open survey.
    const holder = await createActor(
      'developer',
      ['survey.read', 'survey.read_personal_responses'],
      openSubject.msId,
    );
    expect((await readFollowUp(openSubject.surveyId, holder)).items).toEqual([]);

    const draftSubject = await seedSurvey({ status: 'draft', ratings: [2, 5, 5, 5, 5] });
    const draftRes = await get(`/surveys/${draftSubject.surveyId}/outcome-follow-up`, admin);
    expect(draftRes.statusCode).toBe(409);
    expect((draftRes.json() as { code: string }).code).toBe('conflict.survey_results_unavailable');

    const discoverySubject = await seedSurvey({ type: 'discovery', ratings: [2, 5, 5, 5, 5] });
    const discoveryRes = await get(
      `/surveys/${discoverySubject.surveyId}/outcome-follow-up`,
      admin,
    );
    expect(discoveryRes.statusCode).toBe(404);
    expect((discoveryRes.json() as { code: string }).code).toBe('not_found.record');

    const foreignSurveyId = await seedForeignSurvey();
    const foreignRes = await get(`/surveys/${foreignSurveyId}/outcome-follow-up`, admin);
    expect(foreignRes.statusCode).toBe(404);
    expect((foreignRes.json() as { code: string }).code).toBe('not_found.record');

    const malformedRes = await get('/surveys/not-a-uuid/outcome-follow-up', admin);
    expect(malformedRes.statusCode).toBe(422);
    expect((malformedRes.json() as { code: string }).code).toBe('validation.failed');

    const unknownRes = await get(`/surveys/${randomUUID()}/outcome-follow-up`, admin);
    expect(unknownRes.statusCode).toBe(404);
    expect((unknownRes.json() as { code: string }).code).toBe('not_found.record');

    // survey.read denial collapses to the same 404 as an unknown survey.
    const noGrant = await createActor('developer');
    const deniedRes = await get(`/surveys/${openSubject.surveyId}/outcome-follow-up`, noGrant);
    expect(deniedRes.statusCode).toBe(404);
    expect((deniedRes.json() as { code: string }).code).toBe('not_found.record');
  });
});
