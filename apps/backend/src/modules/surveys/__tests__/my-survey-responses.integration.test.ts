import { randomUUID } from 'node:crypto';

import { mySurveyResponsesResponseSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG = 'it-my-survey-responses-548';

type ActorFixture = { id: string; cookie: string; externalId: string };
type SeededSurvey = { id: string; msId: string; title: string };

describe.skipIf(!runIntegration)('my survey response history route (#548)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminId: string;
  let actorA: ActorFixture;
  let actorB: ActorFixture;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();

    const admin = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('survey history test requires the mock Admin seed');
    actorA = await createActor('actor-a');
    actorB = await createActor('actor-b');
  });

  beforeEach(async () => cleanup());

  afterAll(async () => {
    await cleanup();
    if (migrateHandle && actorA && actorB) {
      const actorIds = [actorA.id, actorB.id];
      const rateLimitKeys = actorIds.map((id) => `${WORKSPACE_ID}:${id}`);
      await migrateHandle.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
        actorIds,
      ]);
      await migrateHandle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        rateLimitKeys,
      ]);
      await migrateHandle.pool.query(
        'delete from core.audit_log where actor_id = any($1::uuid[])',
        [actorIds],
      );
      await migrateHandle.pool.query('delete from core.actors where id = any($1::uuid[])', [
        actorIds,
      ]);
    }
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup() {
    if (!migrateHandle) return;
    const systems = 'select id from core.managed_systems where workspace_id=$1 and slug like $2';
    const surveys = `select id from survey.surveys
      where workspace_id=$1 and primary_managed_system_id in (${systems})`;
    const responses = `select id from survey.survey_responses
      where workspace_id=$1 and survey_id in (${surveys})`;
    await migrateHandle.pool.query(
      `delete from core.audit_log where subject_id in (${surveys}) or subject_id in (${responses})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links where workspace_id=$1 and source_id in (${responses})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers
        where workspace_id=$1 and survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_responses where workspace_id=$1 and survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_questions where workspace_id=$1 and survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(`delete from survey.surveys where id in (${surveys})`, [
      WORKSPACE_ID,
      `${SLUG}%`,
    ]);
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id=$1 and slug like $2',
      [WORKSPACE_ID, `${SLUG}%`],
    );
  }

  async function createActor(label: string): Promise<ActorFixture> {
    const externalId = `${SLUG}-${label}-${randomUUID()}`;
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id,external_id,email,display_name,role_level,actor_type)
       values ($1,$2,$3,$4,'user','internal_member') returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@example.test`, label],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('survey history actor seed failed');
    return { id, externalId, cookie: await loginAs(app, externalId) };
  }

  async function seedSurvey(title: string, status: 'draft' | 'open' | 'closed' = 'open') {
    const msId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(`${SLUG}-${randomUUID()}`),
      title,
    );
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys
         (workspace_id,display_id,type,status,title,primary_managed_system_id,
          operator_actor_id,responses_identity_protected,created_by,opened_at,closed_at)
       values ($1,$2,'validation',$3,$4,$5,$6,false,$7,
               case when $3 in ('open','closed') then now() else null end,
               case when $3='closed' then now() else null end) returning id`,
      [WORKSPACE_ID, `S-${randomUUID()}`, status, title, msId, adminId, adminId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('survey history survey seed failed');
    return { id, msId, title } satisfies SeededSurvey;
  }

  async function seedResponse(
    surveyId: string,
    respondentId: string,
    options: { identityProtected?: boolean; submittedAt: string },
  ) {
    const id = randomUUID();
    await migrateHandle.pool.query(
      `insert into survey.survey_responses
         (id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at)
       values ($1,$2,$3,$4,$5,$6::timestamptz)`,
      [
        id,
        WORKSPACE_ID,
        surveyId,
        respondentId,
        options.identityProtected ?? false,
        options.submittedAt,
      ],
    );
    return id;
  }

  function get(cookie: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/me/survey-responses${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('returns only the session Actor rows across shared and separate Surveys', async () => {
    const shared = await seedSurvey(`${SLUG} shared`);
    const onlyA = await seedSurvey(`${SLUG} A only`, 'closed');
    const onlyB = await seedSurvey(`${SLUG} B only`);
    await seedResponse(shared.id, actorA.id, {
      submittedAt: '2026-09-30T10:00:00.000Z',
    });
    await seedResponse(shared.id, actorB.id, {
      submittedAt: '2026-09-30T09:00:00.000Z',
    });
    await seedResponse(onlyA.id, actorA.id, {
      submittedAt: '2026-09-29T10:00:00.000Z',
    });
    await seedResponse(onlyB.id, actorB.id, {
      submittedAt: '2026-09-28T10:00:00.000Z',
    });

    const response = await get(actorA.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    const body = mySurveyResponsesResponseSchema.parse(response.json());
    expect(body.items.map((item) => item.survey_id)).toEqual([shared.id, onlyA.id]);
    expect(body.items.map((item) => new Date(item.submitted_at).toISOString())).toEqual([
      '2026-09-30T10:00:00.000Z',
      '2026-09-29T10:00:00.000Z',
    ]);
    expect(body.items).toMatchObject([
      {
        survey_id: shared.id,
        survey_title: shared.title,
      },
      {
        survey_id: onlyA.id,
        survey_title: onlyA.title,
      },
    ]);
    expect(body.items.map((item) => item.survey_id)).not.toContain(onlyB.id);
    expect(body.page).toEqual({ has_more: false });
  });

  it('does not audit a successful self-history read that returns rows', async () => {
    const survey = await seedSurvey(`${SLUG} audit`);
    await seedResponse(survey.id, actorA.id, {
      submittedAt: '2026-09-30T11:00:00.000Z',
    });

    const before = await migrateHandle.pool.query<{ count: string }>(
      `select count(*)::text as count from core.audit_log
        where actor_id=$1`,
      [actorA.id],
    );
    const response = await get(actorA.cookie);
    expect(response.statusCode).toBe(200);
    const body = mySurveyResponsesResponseSchema.parse(response.json());
    expect(body.items).toHaveLength(1);
    const after = await migrateHandle.pool.query<{ count: string }>(
      `select count(*)::text as count from core.audit_log
        where actor_id=$1`,
      [actorA.id],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('includes an identity-protected response for its own respondent', async () => {
    const survey = await seedSurvey(`${SLUG} protected`);
    await seedResponse(survey.id, actorA.id, {
      identityProtected: true,
      submittedAt: '2026-09-30T12:00:00.000Z',
    });

    const response = await get(actorA.cookie);
    expect(response.statusCode).toBe(200);
    const body = mySurveyResponsesResponseSchema.parse(response.json());
    expect(body.items).toMatchObject([
      {
        survey_id: survey.id,
        identity_protected: true,
      },
    ]);
  });

  it('confirms zero with an empty list for an Actor with no responses', async () => {
    const response = await get(actorB.cookie);

    expect(response.statusCode).toBe(200);
    expect(mySurveyResponsesResponseSchema.parse(response.json())).toEqual({
      items: [],
      page: { has_more: false },
    });
  });

  it('paginates by submitted_at then survey_id without gaps or overlap', async () => {
    const newerSurvey = await seedSurvey(`${SLUG} pagination newer`);
    const firstTieSurvey = await seedSurvey(`${SLUG} pagination tie first`);
    const secondTieSurvey = await seedSurvey(`${SLUG} pagination tie second`);
    const tiedTimestamp = '2026-09-30T13:00:00.000Z';
    await seedResponse(newerSurvey.id, actorA.id, {
      submittedAt: '2026-09-30T13:00:01.000Z',
    });
    await seedResponse(firstTieSurvey.id, actorA.id, {
      submittedAt: tiedTimestamp,
    });
    await seedResponse(secondTieSurvey.id, actorA.id, {
      submittedAt: tiedTimestamp,
    });
    const tiedSurveyIds = [firstTieSurvey.id, secondTieSurvey.id].sort().reverse();

    const firstResponse = await get(actorA.cookie, '?limit=2');
    expect(firstResponse.statusCode).toBe(200);
    const firstPage = mySurveyResponsesResponseSchema.parse(firstResponse.json());
    expect(firstPage.items.map((item) => item.survey_id)).toEqual([
      newerSurvey.id,
      tiedSurveyIds[0],
    ]);
    expect(firstPage.page.has_more).toBe(true);
    expect(firstPage.page.cursor).toBeTruthy();

    const secondResponse = await get(
      actorA.cookie,
      `?limit=2&cursor=${encodeURIComponent(firstPage.page.cursor ?? '')}`,
    );
    expect(secondResponse.statusCode).toBe(200);
    const secondPage = mySurveyResponsesResponseSchema.parse(secondResponse.json());
    expect(secondPage.items.map((item) => item.survey_id)).toEqual([tiedSurveyIds[1]]);
    expect(secondPage.page).toEqual({ has_more: false });
    expect(
      secondPage.items.some((item) =>
        firstPage.items.some((firstItem) => firstItem.survey_id === item.survey_id),
      ),
    ).toBe(false);
  });

  it.each(['limit=0', 'limit=101', 'unknown=1', 'cursor=not-a-cursor'])(
    'rejects invalid query %s with a field validation error',
    async (query) => {
      const response = await get(actorA.cookie, `?${query}`);

      expect(response.statusCode).toBe(422);
      const body = response.json() as {
        code: string;
        detail?: { fields?: Array<{ path: string[]; code: string }> };
      };
      expect(body.code).toBe('validation.failed');
      if (query === 'cursor=not-a-cursor')
        expect(body.detail?.fields).toContainEqual({ path: ['cursor'], code: 'invalid_cursor' });
    },
  );

  it('requires a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/me/survey-responses' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'auth.session_invalid' });
  });

  it('returns only the strict response metadata fields and no answer data', async () => {
    const survey = await seedSurvey(`${SLUG} no answers`);
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions
         (workspace_id,survey_id,kind,prompt,is_required,sort_order,branch_depth)
       values ($1,$2,'text','Private answer',false,0,0) returning id`,
      [WORKSPACE_ID, survey.id],
    );
    const questionId = question.rows[0]?.id;
    if (!questionId) throw new Error('survey history question seed failed');
    const responseId = await seedResponse(survey.id, actorA.id, {
      submittedAt: '2026-09-30T14:00:00.000Z',
    });
    await migrateHandle.pool.query(
      `insert into survey.survey_response_answers
         (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value)
       values ($1,$2,$3,$4,'text','"private answer"'::jsonb)`,
      [WORKSPACE_ID, survey.id, responseId, questionId],
    );

    const response = await get(actorA.cookie);
    expect(response.statusCode).toBe(200);
    const body = mySurveyResponsesResponseSchema.parse(response.json());
    expect(Object.keys(body).sort()).toEqual(['items', 'page']);
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual([
      'identity_protected',
      'submitted_at',
      'survey_id',
      'survey_title',
    ]);
    expect(body.items[0]).not.toHaveProperty('answers');
    expect(body.items[0]).not.toHaveProperty('response_id');
  });
});
