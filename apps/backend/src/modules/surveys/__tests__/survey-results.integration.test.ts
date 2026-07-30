import { randomUUID } from 'node:crypto';

import { surveyResultDtoSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
const SLUG = 'it-survey-results';
type Answer = {
  choice?: string;
  multi?: string[];
  rating?: number;
  text?: string;
};
type SeededSurvey = {
  id: string;
  msId: string;
  questions: Record<string, string>;
  responseIds: string[];
};

describe.skipIf(!runIntegration)('survey result read route (#186)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');
    const r = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = r.rows[0]?.id ?? '';
  });
  beforeEach(async () => cleanup());
  afterAll(async () => {
    await cleanup();
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup() {
    if (!migrateHandle) return;
    const systems = 'select id from core.managed_systems where workspace_id=$1 and slug like $2';
    const surveys = `select id from survey.surveys where workspace_id=$1 and primary_managed_system_id in (${systems})`;
    const responses = `select id from survey.survey_responses where survey_id in (${surveys})`;
    const findings = `select id from finding.findings where source_type='survey_response' and source_id in (${responses})`;
    await migrateHandle.pool.query(
      `delete from core.audit_log where subject_id in (${surveys}) or subject_id in (${responses}) or subject_id in (${findings}) or detail->>'source_survey_response_id' in (select id::text from survey.survey_responses where survey_id in (${surveys}))`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links where source_id in (${responses}) or target_id in (${findings})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from finding.evidence_highlights where finding_id in (${findings})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(`delete from finding.findings where id in (${findings})`, [
      WORKSPACE_ID,
      `${SLUG}%`,
    ]);
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
      `delete from permission.permission_denies where workspace_id=$1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_grants where workspace_id=$1 and actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)',
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_denies where workspace_id=$1 and actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)',
      [WORKSPACE_ID, `${SLUG}-%`],
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
      "delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'",
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id=$1 and slug like $2',
      [WORKSPACE_ID, `${SLUG}%`],
    );
  }

  async function seed(
    answers: Answer[],
    options: {
      status?: 'draft' | 'open' | 'closed';
      identityProtected?: boolean;
    } = {},
  ): Promise<SeededSurvey> {
    const status = options.status ?? 'open';
    const msId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(SLUG), 'Results MS');
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at,closed_at)
       values ($1,$2,'validation',$3,$4,$5,$6,$7,$6,
               case when $3 in ('open','closed') then now() else null end,
               case when $3='closed' then now() else null end) returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        status,
        `${SLUG} survey`,
        msId,
        adminId,
        options.identityProtected ?? true,
      ],
    );
    const id = survey.rows[0]?.id;
    if (!id) throw new Error('survey seed failed');
    const rows = await migrateHandle.pool.query<{ id: string; kind: string }>(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,sort_order,branch_depth)
       values ($1,$2,'single_choice','Choice',false,'[{"key":"yes","label":"Yes"},{"key":"no","label":"No"}]',null,null,0,0),
              ($1,$2,'multiple_choice','Multiple',false,'[{"key":"a","label":"A"},{"key":"b","label":"B"}]',null,null,1,0),
              ($1,$2,'rating','Rating',false,null,1,5,2,0),
              ($1,$2,'text','Text',false,null,null,null,3,0) returning id,kind`,
      [WORKSPACE_ID, id],
    );
    const questions = Object.fromEntries(rows.rows.map((row) => [row.kind, row.id]));
    const questionId = (kind: string) => {
      const question = questions[kind];
      if (!question) throw new Error(`missing ${kind} question`);
      return question;
    };
    const responseIds: string[] = [];
    for (const answer of answers) {
      const responseId = randomUUID();
      responseIds.push(responseId);
      const respondent = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type)
         values ($1,$2,$3,'Results respondent','user','internal_member') returning id`,
        [WORKSPACE_ID, `${SLUG}-${responseId}`, `${SLUG}-${responseId}@example.test`],
      );
      await migrateHandle.pool.query(
        'insert into survey.survey_responses (id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,$4,true,now())',
        [responseId, WORKSPACE_ID, id, respondent.rows[0]?.id],
      );
      const add = async (kind: string, question: string, value: unknown) =>
        migrateHandle.pool.query(
          'insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values ($1,$2,$3,$4,$5,$6::jsonb)',
          [WORKSPACE_ID, id, responseId, question, kind, JSON.stringify(value)],
        );
      if (answer.choice !== undefined)
        await add('single_choice', questionId('single_choice'), answer.choice);
      if (answer.multi !== undefined)
        await add('multiple_choice', questionId('multiple_choice'), answer.multi);
      if (answer.rating !== undefined) await add('rating', questionId('rating'), answer.rating);
      if (answer.text !== undefined) await add('text', questionId('text'), answer.text);
    }
    return { id, msId, questions, responseIds };
  }

  async function dev() {
    const externalId = `${SLUG}-developer-${randomUUID()}`;
    const row = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Results developer','developer','internal_member') returning id",
      [WORKSPACE_ID, externalId, `${externalId}@example.test`],
    );
    return {
      id: row.rows[0]?.id ?? '',
      cookie: await loginAs(app, externalId),
    };
  }
  async function user() {
    const externalId = `${SLUG}-user-${randomUUID()}`;
    const row = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Results user','user','internal_member') returning id",
      [WORKSPACE_ID, externalId, `${externalId}@example.test`],
    );
    return {
      id: row.rows[0]?.id ?? '',
      cookie: await loginAs(app, externalId),
    };
  }
  async function grant(actorId: string, capability: string, msId: string) {
    await migrateHandle.pool.query(
      'insert into permission.permission_grants (workspace_id,actor_id,capability,managed_system_id,granted_by_actor_id) values ($1,$2,$3,$4,$5)',
      [WORKSPACE_ID, actorId, capability, msId, adminId],
    );
  }
  async function deny(actorId: string, capability: string, msId: string) {
    await migrateHandle.pool.query(
      "insert into permission.permission_denies (workspace_id,actor_id,capability,managed_system_id,reason,created_by_actor_id) values ($1,$2,$3,$4,'test deny',$5)",
      [WORKSPACE_ID, actorId, capability, msId, adminId],
    );
  }
  function get(id: string, cookie = adminCookie, suffix = '') {
    return app.inject({
      method: 'GET',
      url: `/surveys/${id}/results${suffix}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }
  function patchWorkspaceSettings(payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: '/workspace/settings',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
      },
      payload,
    });
  }
  function assertNoForbidden(value: unknown, inApprovedExcerpt = false) {
    const forbidden =
      /^(respondent.*|actor_id|email|external_id|response_id|submitted_at|created_at|session.*|ip.*|user_agent|answer_value|text|excerpt)$/;
    if (Array.isArray(value)) {
      for (const child of value) assertNoForbidden(child, inApprovedExcerpt);
      return;
    }
    if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        const approvedExcerpt = key === 'excerpts';
        if (
          !(inApprovedExcerpt && (key === 'id' || key === 'text' || key === 'response_id')) &&
          !approvedExcerpt
        )
          expect(key).not.toMatch(forbidden);
        assertNoForbidden(child, approvedExcerpt);
      }
  }
  function parse2xx(response: { statusCode: number; json: () => unknown }) {
    expect(response.statusCode).toBe(200);
    const body = surveyResultDtoSchema.parse(response.json());
    expect(body.next_actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'create_finding' })]),
    );
    assertNoForbidden(body);
    return body;
  }
  async function approveExcerpt(
    survey: SeededSurvey,
    responseId: string,
    questionId = survey.questions.text,
  ) {
    const approval = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_response_excerpt_approvals
        (workspace_id,survey_id,response_id,question_id,redacted_excerpt,approved_by)
       values ($1,$2,$3,$4,'approved result excerpt',$5) returning id`,
      [WORKSPACE_ID, survey.id, responseId, questionId, adminId],
    );
    const id = approval.rows[0]?.id;
    if (!id) throw new Error('excerpt approval seed failed');
    return id;
  }
  const full = (count: number): Answer[] =>
    Array.from({ length: count }, () => ({
      choice: 'yes',
      multi: ['a'],
      rating: 3,
      text: 'private body',
    }));

  it('AC-1 returns an allowed create_finding action and holder-only response_id', async () => {
    const survey = await seed(full(5));
    const responseId = survey.responseIds[0];
    if (!responseId) throw new Error('response seed failed');
    await approveExcerpt(survey, responseId);
    await grant(adminId, 'survey.read_personal_responses', survey.msId);
    const body = parse2xx(await get(survey.id));
    expect(body.next_actions).toEqual([
      { id: 'create_finding', availability: 'allowed', intent: 'open_finding_draft' },
    ]);
    const text = body.questions.find((question) => question.question_id === survey.questions.text);
    expect(text).toMatchObject({ excerpts: [{ response_id: responseId }] });
  });

  it('AC-2 omits response_id for non-holders and parses the strict DTO', async () => {
    const survey = await seed(full(5));
    const responseId = survey.responseIds[0];
    if (!responseId) throw new Error('response seed failed');
    await approveExcerpt(survey, responseId);
    const body = surveyResultDtoSchema.parse((await get(survey.id)).json());
    const text = body.questions.find((question) => question.question_id === survey.questions.text);
    if (!text || text.visibility !== 'visible' || text.kind !== 'text')
      throw new Error('text result missing');
    expect('response_id' in text.excerpts[0]!).toBe(false);
  });

  it('AC-3 returns requestable finding permission only when the decision permits a request', async () => {
    const survey = await seed(full(5));
    const actor = await dev();
    await grant(actor.id, 'survey.read', survey.msId);
    await grant(actor.id, 'survey.read_personal_responses', survey.msId);
    const body = parse2xx(await get(survey.id, actor.cookie));
    expect(body.next_actions).toEqual([
      {
        id: 'create_finding',
        availability: 'blocked_requestable',
        intent: 'open_finding_draft',
        requestable_permission: {
          permission: 'finding.manage',
          managed_system_id: survey.msId,
        },
      },
    ]);
    const deniedActor = await dev();
    await grant(deniedActor.id, 'survey.read', survey.msId);
    await grant(deniedActor.id, 'survey.read_personal_responses', survey.msId);
    await deny(deniedActor.id, 'finding.manage', survey.msId);
    const deniedBody = parse2xx(await get(survey.id, deniedActor.cookie));
    expect(deniedBody.next_actions).toEqual([
      {
        id: 'create_finding',
        availability: 'blocked_requestable',
        intent: 'open_finding_draft',
      },
    ]);
    const externalId = `${SLUG}-user-${randomUUID()}`;
    const user = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Results user','user','internal_member') returning id",
      [WORKSPACE_ID, externalId, `${externalId}@example.test`],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error('user seed failed');
    await grant(userId, 'survey.read', survey.msId);
    await grant(userId, 'survey.read_personal_responses', survey.msId);
    await grant(userId, 'finding.manage', survey.msId);
    const userBody = parse2xx(await get(survey.id, await loginAs(app, externalId)));
    expect(userBody.next_actions).toEqual([
      { id: 'create_finding', availability: 'allowed', intent: 'open_finding_draft' },
    ]);
  });

  it('AC-4 audits each distinct holder-exposed response/question pair and no non-holder read', async () => {
    const survey = await seed(full(5));
    const firstResponseId = survey.responseIds[0];
    const secondResponseId = survey.responseIds[1];
    if (!firstResponseId || !secondResponseId) throw new Error('response seed failed');
    await approveExcerpt(survey, firstResponseId);
    await approveExcerpt(survey, firstResponseId);
    await approveExcerpt(survey, secondResponseId);
    await grant(adminId, 'survey.read_personal_responses', survey.msId);
    parse2xx(await get(survey.id));
    const holderAudit = await migrateHandle.pool.query<{
      subject_type: string;
      subject_id: string;
      detail: Record<string, string>;
    }>(
      "select subject_type,subject_id,detail from core.audit_log where actor_id=$1 and event_type='survey_response_personal_read'",
      [adminId],
    );
    expect(
      holderAudit.rows
        .map((row) => [row.subject_id, row.detail.question_id])
        .sort(([leftResponseId, leftQuestionId], [rightResponseId, rightQuestionId]) =>
          `${leftResponseId}:${leftQuestionId}`.localeCompare(
            `${rightResponseId}:${rightQuestionId}`,
          ),
        ),
    ).toEqual(
      [
        [firstResponseId, survey.questions.text],
        [secondResponseId, survey.questions.text],
      ].sort(([leftResponseId, leftQuestionId], [rightResponseId, rightQuestionId]) =>
        `${leftResponseId}:${leftQuestionId}`.localeCompare(
          `${rightResponseId}:${rightQuestionId}`,
        ),
      ),
    );
    for (const row of holderAudit.rows) {
      expect(row.subject_type).toBe('survey_response');
      expect(row.detail.survey_id).toBe(survey.id);
      expect(row.detail.survey_response_id).toBe(row.subject_id);
      expect(Object.keys(row.detail).sort()).toEqual([
        'question_id',
        'survey_id',
        'survey_response_id',
      ]);
    }
    const reader = await dev();
    await grant(reader.id, 'survey.read', survey.msId);
    parse2xx(await get(survey.id, reader.cookie));
    const readerAudit = await migrateHandle.pool.query<{ count: string }>(
      "select count(*)::text as count from core.audit_log where actor_id=$1 and event_type='survey_response_personal_read'",
      [reader.id],
    );
    expect(readerAudit.rows).toEqual([{ count: '0' }]);
  });

  it('AC-5 exposes no VOC action and keeps create-voc as a route miss', async () => {
    const survey = await seed(full(5));
    const responseId = survey.responseIds[0];
    if (!responseId) throw new Error('response seed failed');
    const body = parse2xx(await get(survey.id));
    expect(body.next_actions.map((action) => action.id)).not.toContain('create_voc');
    expect(
      (await app.inject({ method: 'POST', url: `/survey-responses/${responseId}/create-voc` }))
        .statusCode,
    ).toBe(404);
  });

  it('AC-6 preserves non-holder threshold suppression and the evidence privilege wall', async () => {
    const survey = await seed(full(4));
    const body = parse2xx(await get(survey.id));
    expect(body.questions).toContainEqual({
      question_id: survey.questions.text,
      visibility: 'suppressed',
      response_count: null,
      suppression: { code: 'anonymity_threshold' },
    });
    const privileges = await migrateHandle.pool.query<{
      grantee: string;
      core_usage: boolean;
      app_response_select: boolean;
    }>(
      `select roles.grantee,
              pg_catalog.has_schema_privilege(roles.grantee, schemas.schema_name, 'USAGE') as core_usage,
              exists(
                select 1
                  from information_schema.table_privileges
                 where grantee = 'fops_app'
                   and table_schema = 'survey'
                   and table_name = 'survey_responses'
                   and privilege_type = 'SELECT'
                union all
                select 1
                  from information_schema.column_privileges
                 where grantee = 'fops_app'
                   and table_schema = 'survey'
                   and table_name = 'survey_responses'
                   and privilege_type = 'SELECT'
              ) as app_response_select
         from (values ('fops_app'), ('fops_survey_evidence_reader_owner')) as roles(grantee)
         cross join information_schema.schemata as schemas
        where schemas.schema_name = 'core'
        order by roles.grantee`,
    );
    expect(privileges.rows).toEqual([
      { grantee: 'fops_app', core_usage: true, app_response_select: false },
      {
        grantee: 'fops_survey_evidence_reader_owner',
        core_usage: false,
        app_response_select: false,
      },
    ]);
  });

  it('emits request_task only for elevated actors who can read the derived Finding', async () => {
    const survey = await seed(full(5));
    const responseId = survey.responseIds[0];
    if (!responseId) throw new Error('response seed failed');
    const excerptId = await approveExcerpt(survey, responseId);
    await grant(adminId, 'survey.read_personal_responses', survey.msId);
    const beforeDerivation = parse2xx(await get(survey.id));
    expect(beforeDerivation.next_actions.map((action) => action.id)).not.toContain('request_task');
    const findingMsId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG),
      'Derived Finding MS',
    );
    const created = await app.inject({
      method: 'POST',
      url: `/survey-responses/${responseId}/create-finding`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        severity: 'medium',
        primary_managed_system_id: findingMsId,
        approved_excerpt_ids: [excerptId],
      },
    });
    expect(created.statusCode).toBe(201);
    const findingId = created.json<{ id: string }>().id;

    const elevatedManage = parse2xx(await get(survey.id));
    expect(elevatedManage.next_actions).toContainEqual(
      expect.objectContaining({
        id: 'request_task',
        availability: 'allowed',
        intent: 'open_task_request_draft',
        source_finding_id: findingId,
      }),
    );

    const nonElevatedManage = await user();
    for (const capability of ['survey.read', 'survey.read_personal_responses', 'finding.manage'])
      await grant(nonElevatedManage.id, capability, survey.msId);
    await grant(nonElevatedManage.id, 'finding.manage', findingMsId);
    // Deliberately grants Finding scope so this User actor exercises the elevated-role guard.
    await grant(nonElevatedManage.id, 'finding.read', findingMsId);
    const nonElevatedBody = parse2xx(await get(survey.id, nonElevatedManage.cookie));
    expect(nonElevatedBody.next_actions).toContainEqual(
      expect.objectContaining({ id: 'create_finding', availability: 'allowed' }),
    );
    expect(nonElevatedBody.next_actions.map((action) => action.id)).not.toContain('request_task');
    expect(JSON.stringify(nonElevatedBody)).not.toContain(findingId);

    const elevatedReadOnly = await dev();
    for (const capability of ['survey.read', 'survey.read_personal_responses'])
      await grant(elevatedReadOnly.id, capability, survey.msId);
    await grant(elevatedReadOnly.id, 'finding.read', findingMsId);
    const elevatedReadOnlyBody = parse2xx(await get(survey.id, elevatedReadOnly.cookie));
    expect(elevatedReadOnlyBody.next_actions).toContainEqual(
      expect.objectContaining({
        id: 'request_task',
        availability: 'blocked_requestable',
        source_finding_id: findingId,
        requestable_permission: {
          permission: 'finding.manage',
          managed_system_id: findingMsId,
        },
      }),
    );

    const outOfScope = await dev();
    for (const capability of ['survey.read', 'survey.read_personal_responses'])
      await grant(outOfScope.id, capability, survey.msId);
    const outOfScopeBody = parse2xx(await get(survey.id, outOfScope.cookie));
    expect(outOfScopeBody.next_actions.map((action) => action.id)).not.toContain('request_task');
    expect(JSON.stringify(outOfScopeBody)).not.toContain(findingId);
  });

  it('enforces the actor matrix and parses every successful result', async () => {
    const survey = await seed(full(4));
    const adminThreshold = parse2xx(await get(survey.id));
    expect(adminThreshold.questions).toEqual(
      adminThreshold.questions.map((q) => ({
        question_id: q.question_id,
        visibility: 'suppressed',
        response_count: null,
        suppression: { code: 'anonymity_threshold' },
      })),
    );
    await grant(adminId, 'survey.read_personal_responses', survey.msId);
    const adminExact = parse2xx(await get(survey.id));
    expect(adminExact.questions.map((q) => q.visibility)).toEqual([
      'visible',
      'visible',
      'visible',
      'visible',
    ]);
    expect(adminExact.questions[2]).toMatchObject({
      answer_count: 4,
      distribution: { low: 0, mid: 4, high: 0 },
    });
    const actor = await dev();
    expect((await get(survey.id, actor.cookie)).statusCode).toBe(404);
    await grant(actor.id, 'survey.read', survey.msId);
    expect(
      parse2xx(await get(survey.id, actor.cookie)).questions.every(
        (q) => q.visibility === 'suppressed',
      ),
    ).toBe(true);
    await grant(actor.id, 'survey.read_personal_responses', survey.msId);
    expect(parse2xx(await get(survey.id, actor.cookie)).questions.map((q) => q.visibility)).toEqual(
      ['visible', 'visible', 'visible', 'visible'],
    );
    await deny(actor.id, 'survey.read', survey.msId);
    expect((await get(survey.id, actor.cookie)).statusCode).toBe(404);
    expect((await get(survey.id, userCookie)).statusCode).toBe(404);
  });

  it('makes cohorts 0 through 4 byte-identical and exposes 5 and 6', async () => {
    const hidden = await Promise.all(
      [0, 1, 4].map(async (count) => parse2xx(await get((await seed(full(count))).id))),
    );
    const safeQuestionBytes = (body: (typeof hidden)[number]) =>
      body.questions.map(({ question_id: _questionId, ...question }) => JSON.stringify(question));
    const [firstHidden] = hidden;
    if (!firstHidden) throw new Error('hidden cohort seed failed');
    for (const body of hidden)
      expect(safeQuestionBytes(body)).toEqual(safeQuestionBytes(firstHidden));
    for (const count of [5, 6]) {
      const body = parse2xx(await get((await seed(full(count))).id));
      expect(body.questions.map((q) => q.visibility)).toEqual([
        'visible',
        'visible',
        'visible',
        'visible',
      ]);
      expect(body.questions[0]).toMatchObject({
        answer_count: count,
        option_buckets: [
          { key: 'yes', count },
          { key: 'no', count: 0 },
        ],
      });
      expect(body.questions[1]).toMatchObject({
        answer_count: count,
        option_buckets: [
          { key: 'a', count },
          { key: 'b', count: 0 },
        ],
      });
      expect(body.questions[2]).toMatchObject({
        answer_count: count,
        distribution: { low: 0, mid: count, high: 0 },
      });
      expect(body.questions[3]).toMatchObject({ answer_count: count });
    }
  });

  it('uses the resolved workspace anonymity threshold and keeps the no-row default at five', async () => {
    const configured = await patchWorkspaceSettings({
      survey_anonymity_threshold: 7,
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json()).toMatchObject({ survey_anonymity_threshold: 7 });

    const six = parse2xx(await get((await seed(full(6))).id));
    expect(six.questions).toEqual(
      six.questions.map((question) => ({
        question_id: question.question_id,
        visibility: 'suppressed',
        response_count: null,
        suppression: { code: 'anonymity_threshold' },
      })),
    );

    const seven = parse2xx(await get((await seed(full(7))).id));
    expect(seven.questions.map((question) => question.visibility)).toEqual([
      'visible',
      'visible',
      'visible',
      'visible',
    ]);

    await migrateHandle.pool.query('delete from core.workspace_settings where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
    const noRowFive = parse2xx(await get((await seed(full(5))).id));
    expect(noRowFive.questions.map((question) => question.visibility)).toEqual([
      'visible',
      'visible',
      'visible',
      'visible',
    ]);
  });

  it('applies low bucket suppression, exact overlapping choice buckets, rating partition, and text masking', async () => {
    const one = await seed([
      ...full(4),
      { choice: 'no', multi: ['a', 'b'], rating: 6, text: 'private' },
    ]);
    const noGrant = parse2xx(await get(one.id));
    expect(noGrant.questions.map((q) => q.visibility)).toEqual([
      'suppressed',
      'suppressed',
      'suppressed',
      'visible',
    ]);
    await grant(adminId, 'survey.read_personal_responses', one.msId);
    const exact = parse2xx(await get(one.id));
    expect(exact.questions.map((q) => q.question_id)).toEqual([
      one.questions.single_choice,
      one.questions.multiple_choice,
      one.questions.rating,
      one.questions.text,
    ]);
    expect(exact.questions[0]).toMatchObject({
      answer_count: 5,
      option_buckets: [
        { key: 'yes', count: 4 },
        { key: 'no', count: 1 },
      ],
    });
    expect(exact.questions[1]).toMatchObject({
      answer_count: 5,
      option_buckets: [
        { key: 'a', count: 5 },
        { key: 'b', count: 1 },
      ],
    });
    expect(exact.questions[2]).toMatchObject({
      answer_count: 5,
      distribution: { low: 0, mid: 4, high: 0 },
    });
    expect(exact.questions[3]).toMatchObject({
      answer_count: 5,
      distribution: null,
      excerpts: [],
    });
    const four = await seed([
      ...full(5),
      ...Array.from({ length: 4 }, () => ({
        choice: 'no',
        multi: ['a'],
        rating: 3,
      })),
    ]);
    const fourBody = parse2xx(await get(four.id));
    expect(fourBody.questions[0]?.visibility).toBe('suppressed');
    const zero = await seed(
      Array.from({ length: 5 }, () => ({
        choice: 'yes',
        multi: ['a'],
        rating: 3,
      })),
    );
    const zeroBody = parse2xx(await get(zero.id));
    expect(zeroBody.questions[0]).toMatchObject({
      visibility: 'visible',
      option_buckets: [
        { key: 'yes', count: 5 },
        { key: 'no', count: 0 },
      ],
    });
    expect(zeroBody.questions[3]).toMatchObject({
      visibility: 'visible',
      answer_count: 0,
      excerpts: [],
    });
    for (const textCount of [1, 2, 3, 4]) {
      const textMasked = await seed([
        ...Array.from({ length: textCount }, () => ({
          choice: 'yes',
          multi: ['a'],
          rating: 3,
          text: 'private',
        })),
        ...Array.from({ length: 5 - textCount }, () => ({
          choice: 'yes',
          multi: ['a'],
          rating: 3,
        })),
      ]);
      expect(parse2xx(await get(textMasked.id)).questions[3]?.visibility).toBe('suppressed');
    }
  });

  it('serves closed results, preserves identity protection, rejects draft/query/cross-workspace, and writes no audit', async () => {
    const before = await migrateHandle.pool.query<{ count: string }>(
      'select count(*) from core.audit_log where workspace_id=$1',
      [WORKSPACE_ID],
    );
    const closed = await seed(full(5), {
      status: 'closed',
      identityProtected: false,
    });
    expect(parse2xx(await get(closed.id)).identity_protected).toBe(false);
    const protectedSurvey = await seed(full(5), { identityProtected: true });
    expect(parse2xx(await get(protectedSurvey.id)).identity_protected).toBe(true);
    const draft = await seed([], { status: 'draft' });
    const draftResponse = await get(draft.id);
    expect(draftResponse.statusCode).toBe(409);
    expect(draftResponse.json<{ code: string }>().code).toBe('conflict.survey_results_unavailable');
    const invalidQuery = await get(closed.id, adminCookie, '?segment=internal');
    expect(invalidQuery.statusCode).toBe(422);
    expect(invalidQuery.json<{ code: string }>().code).toBe('validation.failed');
    const foreignWorkspace = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces (id,name) values ($1,$2)', [
      foreignWorkspace,
      `${SLUG} foreign`,
    ]);
    const foreignActor = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Foreign admin','admin','internal_member') returning id",
      [
        foreignWorkspace,
        `${SLUG}-foreign-${foreignWorkspace}`,
        `foreign-${foreignWorkspace}@example.test`,
      ],
    );
    const foreignMs = await insertMsDirectly(
      migrateHandle,
      foreignWorkspace,
      uid(`${SLUG}-foreign`),
      'Foreign results MS',
    );
    const foreignSurvey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at)
       values ($1,$2,'validation','open',$3,$4,$5,true,$5,now()) returning id`,
      [
        foreignWorkspace,
        `S-${randomUUID()}`,
        `${SLUG} foreign`,
        foreignMs,
        foreignActor.rows[0]?.id,
      ],
    );
    expect((await get(foreignSurvey.rows[0]?.id ?? randomUUID())).statusCode).toBe(404);
    await migrateHandle.pool.query('delete from survey.surveys where workspace_id=$1', [
      foreignWorkspace,
    ]);
    await migrateHandle.pool.query('delete from core.actors where workspace_id=$1', [
      foreignWorkspace,
    ]);
    await migrateHandle.pool.query('delete from core.managed_systems where workspace_id=$1', [
      foreignWorkspace,
    ]);
    await migrateHandle.pool.query('delete from core.workspaces where id=$1', [foreignWorkspace]);
    const after = await migrateHandle.pool.query<{ count: string }>(
      'select count(*) from core.audit_log where workspace_id=$1',
      [WORKSPACE_ID],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
