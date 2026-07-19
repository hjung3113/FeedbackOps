import { randomUUID } from 'node:crypto';

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
const SLUG_PREFIX = 'it-survey-respondent-form';

describe.skipIf(!runIntegration)('respondent survey form routes (#185)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let userCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    userCookie = await loginAs(app, 'mock-user-1');
  });

  beforeEach(async () => cleanupFixtures());
  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures() {
    const surveys = `select id from survey.surveys where workspace_id = $1 and title like '${SLUG_PREFIX}%'`;
    await migrateHandle.pool.query(
      `delete from survey.survey_questions where survey_id in (${surveys})`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(`delete from survey.surveys where id in (${surveys})`, [
      WORKSPACE_ID,
    ]);
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
  }

  async function seed(status: 'draft' | 'open' | 'closed' = 'open') {
    const managedSystemId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Respondent form MS',
    );
    const actor = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
      [WORKSPACE_ID],
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at,closed_at)
       values ($1, $2, 'validation', $3, $4, $5, $6, true, $6,
               case when $3 in ('open', 'closed') then now() else null end,
               case when $3 = 'closed' then now() else null end) returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        status,
        `${SLUG_PREFIX}-${status}`,
        managedSystemId,
        actor.rows[0]?.id,
      ],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('survey seed failed');
    await migrateHandle.pool.query(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,options,sort_order,branch_depth)
       values ($1,$2,'rating','Rate it',true,null,1,0),
              ($1,$2,'single_choice','Choose',false,'[{"key":"yes","label":"Yes"},{"key":"no","label":"No"}]',0,0)`,
      [WORKSPACE_ID, surveyId],
    );
    return surveyId;
  }

  it('returns only the open respondent form to a basic user in question order', async () => {
    const surveyId = await seed();
    const response = await app.inject({
      method: 'GET',
      url: `/surveys/${surveyId}/form`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${userCookie}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      survey: Record<string, unknown>;
      questions: Array<Record<string, unknown>>;
    }>();
    expect(body.survey).toEqual({
      id: surveyId,
      title: `${SLUG_PREFIX}-open`,
      type: 'validation',
      identity_protected: true,
    });
    expect(body.questions.map((question) => question.sort_order)).toEqual([0, 1]);
    expect(body.questions[0]?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'yes', label: 'Yes' })]),
    );
    expect(body.questions[1]).toEqual(
      expect.objectContaining({ rating_min: null, rating_max: null }),
    );
    expect(JSON.stringify(body)).not.toContain('operator_actor_id');
    expect(JSON.stringify(body)).not.toContain('workspace_id');
  });

  it.each(['draft', 'closed'] as const)('rejects %s survey forms', async (status) => {
    const surveyId = await seed(status);
    const response = await app.inject({
      method: 'GET',
      url: `/surveys/${surveyId}/form`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${userCookie}` },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe('conflict.survey_not_open');
  });

  it('requires authentication', async () => {
    const surveyId = await seed();
    expect((await app.inject({ method: 'GET', url: `/surveys/${surveyId}/form` })).statusCode).toBe(
      401,
    );
  });
});
