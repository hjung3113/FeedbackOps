import { randomUUID } from 'node:crypto';

import { answerableSurveysResponseSchema } from '@fops/shared';
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
const SLUG = 'it-answerable-surveys-718';

type ActorFixture = { id: string; cookie: string; externalId: string };
type SeededSurvey = { id: string; msId: string; title: string };

describe.skipIf(!runIntegration)('my answerable surveys route (#718)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminId: string;
  let actorA: ActorFixture;
  let actorB: ActorFixture;
  const idempotencyKeys = new Set<string>();
  const foreignWorkspaceIds = new Set<string>();

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
    if (!adminId) throw new Error('answerable surveys test requires the mock Admin seed');
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
    if (idempotencyKeys.size) {
      await migrateHandle.pool.query(
        'delete from core.idempotency_keys where key = any($1::uuid[])',
        [[...idempotencyKeys]],
      );
      idempotencyKeys.clear();
    }
    if (foreignWorkspaceIds.size) {
      for (const workspaceId of foreignWorkspaceIds) {
        await migrateHandle.pool.query(
          'delete from survey.survey_responses where workspace_id = $1',
          [workspaceId],
        );
        await migrateHandle.pool.query(
          'delete from survey.survey_questions where workspace_id = $1',
          [workspaceId],
        );
        await migrateHandle.pool.query('delete from survey.surveys where workspace_id = $1', [
          workspaceId,
        ]);
        await migrateHandle.pool.query('delete from core.managed_systems where workspace_id = $1', [
          workspaceId,
        ]);
        await migrateHandle.pool.query('delete from core.actors where workspace_id = $1', [
          workspaceId,
        ]);
        await migrateHandle.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
      }
      foreignWorkspaceIds.clear();
    }
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
    if (!id) throw new Error('answerable surveys actor seed failed');
    return { id, externalId, cookie: await loginAs(app, externalId) };
  }

  async function seedSurvey(
    title: string,
    status: 'draft' | 'open' | 'closed' = 'open',
    options: { openedAt?: string; questionCount?: number } = {},
  ) {
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
               case when $3 in ('open','closed') then coalesce($8::timestamptz, now()) else null end,
               case when $3='closed' then now() else null end) returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        status,
        title,
        msId,
        adminId,
        adminId,
        options.openedAt ?? null,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('answerable surveys survey seed failed');
    const questionCount = options.questionCount ?? 2;
    if (questionCount > 0) {
      const questions = Array.from(
        { length: questionCount },
        (_, i) => `($1,$2,'text','Q${i}',false,${i},0)`,
      ).join(',');
      await migrateHandle.pool.query(
        `insert into survey.survey_questions
           (workspace_id,survey_id,kind,prompt,is_required,sort_order,branch_depth)
         values ${questions}`,
        [WORKSPACE_ID, id],
      );
    }
    return { id, msId, title } satisfies SeededSurvey;
  }

  async function seedResponse(surveyId: string, respondentId: string) {
    await migrateHandle.pool.query(
      `insert into survey.survey_responses
         (id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at)
       values ($1,$2,$3,$4,false,now())`,
      [randomUUID(), WORKSPACE_ID, surveyId, respondentId],
    );
  }

  async function seedForeignSurvey(title: string) {
    const workspaceId = randomUUID();
    foreignWorkspaceIds.add(workspaceId);
    await migrateHandle.pool.query('insert into core.workspaces (id,name) values ($1,$2)', [
      workspaceId,
      `${SLUG} foreign workspace`,
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type)
       values ($1,$2,$3,'Foreign Admin','admin','internal_member') returning id`,
      [workspaceId, `foreign-admin-${workspaceId}`, `foreign-${workspaceId}@local`],
    );
    const actorId = actor.rows[0]?.id;
    if (!actorId) throw new Error('foreign actor seed failed');
    const managedSystemId = await insertMsDirectly(
      migrateHandle,
      workspaceId,
      uid(`${SLUG}-foreign`),
      `${title} MS`,
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys
         (workspace_id,display_id,type,status,title,primary_managed_system_id,
          operator_actor_id,responses_identity_protected,created_by,opened_at)
       values ($1,$2,'validation','open',$3,$4,$5,true,$5,now()) returning id`,
      [workspaceId, `S-${randomUUID()}`, title, managedSystemId, actorId],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('foreign survey seed failed');
    return surveyId;
  }

  async function seedQuestionIds(surveyId: string, count: number) {
    const rows = await migrateHandle.pool.query<{ id: string }>(
      `select id from survey.survey_questions
        where workspace_id=$1 and survey_id=$2 order by sort_order limit $3`,
      [WORKSPACE_ID, surveyId, count],
    );
    return rows.rows.map((row) => row.id);
  }

  function get(cookie: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/me/answerable-surveys${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it.each(['draft', 'closed'] as const)(
    'excludes a %s Survey and returns only Survey-level item fields',
    async (status) => {
      const open = await seedSurvey(`${SLUG} filter open`, 'open', {
        openedAt: '2026-09-30T13:00:00.000Z',
      });
      await seedSurvey(`${SLUG} filter ${status}`, status);

      const response = await get(actorA.cookie);
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-cache');
      const body = answerableSurveysResponseSchema.parse(response.json());
      expect(body.items).toEqual([
        {
          survey_id: open.id,
          display_id: expect.any(String),
          title: open.title,
          type: 'validation',
          question_count: 2,
          opened_at: expect.any(String),
        },
      ]);
      expect(body.page).toEqual({ has_more: false });
    },
  );

  it('excludes open Surveys in another Workspace', async () => {
    const local = await seedSurvey(`${SLUG} workspace local`);
    const foreignId = await seedForeignSurvey(`${SLUG} workspace foreign`);

    const response = await get(actorA.cookie);
    expect(response.statusCode).toBe(200);
    const body = answerableSurveysResponseSchema.parse(response.json());
    expect(body.items.map((item) => item.survey_id)).toEqual([local.id]);
    expect(body.items.map((item) => item.survey_id)).not.toContain(foreignId);
  });

  it('excludes Surveys the caller already answered while keeping them for others', async () => {
    const answered = await seedSurvey(`${SLUG} answered`, 'open', {
      openedAt: '2026-09-30T12:00:00.000Z',
    });
    const untouched = await seedSurvey(`${SLUG} untouched`, 'open', {
      openedAt: '2026-09-30T13:00:00.000Z',
    });
    await seedResponse(answered.id, actorA.id);

    const forA = answerableSurveysResponseSchema.parse((await get(actorA.cookie)).json());
    expect(forA.items.map((item) => item.survey_id)).toEqual([untouched.id]);
    const forB = answerableSurveysResponseSchema.parse((await get(actorB.cookie)).json());
    expect(forB.items.map((item) => item.survey_id)).toEqual([untouched.id, answered.id]);
  });

  it('drops a Survey from the submitter list after POST /surveys/:id/responses while another Actor keeps it', async () => {
    const survey = await seedSurvey(`${SLUG} submit`, 'open', {
      openedAt: '2026-09-30T13:00:00.000Z',
    });
    const questionIds = await seedQuestionIds(survey.id, 2);
    const key = randomUUID();
    idempotencyKeys.add(key);
    const submitted = await app.inject({
      method: 'POST',
      url: `/surveys/${survey.id}/responses`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${actorA.cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: {
        answers: [
          { question_id: questionIds[0], value: 'yes' },
          { question_id: questionIds[1], value: 'no' },
        ],
      },
    });
    expect(submitted.statusCode).toBe(201);

    const forA = answerableSurveysResponseSchema.parse((await get(actorA.cookie)).json());
    expect(forA.items.map((item) => item.survey_id)).toEqual([]);
    expect(forA.page).toEqual({ has_more: false });
    const forB = answerableSurveysResponseSchema.parse((await get(actorB.cookie)).json());
    expect(forB.items.map((item) => item.survey_id)).toEqual([survey.id]);
    expect(forB.items[0]).toMatchObject({ title: survey.title, question_count: 2 });
  });

  it('returns the list to an Actor without survey.read', async () => {
    const survey = await seedSurvey(`${SLUG} no capability`);

    // actorA is role_level 'user' with no capability grants in this suite.
    const response = await get(actorA.cookie);
    expect(response.statusCode).toBe(200);
    const body = answerableSurveysResponseSchema.parse(response.json());
    expect(body.items.map((item) => item.survey_id)).toEqual([survey.id]);
  });

  it('paginates by opened_at then survey_id across pages without gaps or overlap', async () => {
    const oldest = await seedSurvey(`${SLUG} pagination oldest`, 'open', {
      openedAt: '2026-09-30T11:00:00.000Z',
    });
    const middle = await seedSurvey(`${SLUG} pagination middle`, 'open', {
      openedAt: '2026-09-30T12:00:00.000Z',
    });
    const newest = await seedSurvey(`${SLUG} pagination newest`, 'open', {
      openedAt: '2026-09-30T13:00:00.000Z',
    });

    const firstPage = answerableSurveysResponseSchema.parse(
      (await get(actorA.cookie, '?limit=1')).json(),
    );
    expect(firstPage.items.map((item) => item.survey_id)).toEqual([newest.id]);
    expect(firstPage.page.has_more).toBe(true);
    expect(firstPage.page.cursor).toBeTruthy();

    const secondResponse = await get(
      actorA.cookie,
      `?limit=1&cursor=${encodeURIComponent(firstPage.page.cursor ?? '')}`,
    );
    const secondPage = answerableSurveysResponseSchema.parse(secondResponse.json());
    expect(secondPage.items.map((item) => item.survey_id)).toEqual([middle.id]);
    expect(secondPage.page.has_more).toBe(true);

    const thirdResponse = await get(
      actorA.cookie,
      `?limit=1&cursor=${encodeURIComponent(secondPage.page.cursor ?? '')}`,
    );
    const thirdPage = answerableSurveysResponseSchema.parse(thirdResponse.json());
    expect(thirdPage.items.map((item) => item.survey_id)).toEqual([oldest.id]);
    expect(thirdPage.page).toEqual({ has_more: false });

    const seen = [firstPage, secondPage, thirdPage].flatMap((page) =>
      page.items.map((item) => item.survey_id),
    );
    expect(new Set(seen).size).toBe(3);
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
});
