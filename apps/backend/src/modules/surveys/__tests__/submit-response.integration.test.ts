import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { surveyResponseSubmittedDetailSchema } from '@fops/shared';
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
const SLUG_PREFIX = 'it-survey-submit-response';

describe.skipIf(!runIntegration)('survey response submission routes (#185)', () => {
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
    const responses = `select id from survey.survey_responses where survey_id in (${surveys})`;
    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers where response_id in (${responses})`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.audit_log where subject_id in (${responses})`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_responses where id in (${responses})`,
      [WORKSPACE_ID],
    );
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
    const msId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Submission MS');
    const admin = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
      [WORKSPACE_ID],
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at,closed_at)
       values ($1,$2,'validation',$3,$4,$5,$6,true,$6,
               case when $3 in ('open', 'closed') then now() else null end,
               case when $3 = 'closed' then now() else null end) returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        status,
        `${SLUG_PREFIX}-${status}`,
        msId,
        admin.rows[0]?.id,
      ],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('survey seed failed');
    const questions = await migrateHandle.pool.query<{ id: string; kind: string }>(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,options,rating_min,rating_max,sort_order,branch_depth)
       values ($1,$2,'single_choice','Choice',true,'[{"key":"yes","label":"Yes"},{"key":"no","label":"No"}]',null,null,0,0),
              ($1,$2,'multiple_choice','Multi',true,'[{"key":"a","label":"A"},{"key":"b","label":"B"}]',null,null,1,0),
              ($1,$2,'rating','Rating',true,null,1,5,2,0),
              ($1,$2,'text','Text',true,null,null,null,3,0)
       returning id,kind`,
      [WORKSPACE_ID, surveyId],
    );
    return {
      surveyId,
      questions: Object.fromEntries(questions.rows.map((row) => [row.kind, row.id])) as Record<
        string,
        string
      >,
    };
  }

  function submit(surveyId: string, answers: unknown, idempotencyKey = randomUUID()) {
    return app.inject({
      method: 'POST',
      url: `/surveys/${surveyId}/responses`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userCookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: { answers },
    });
  }

  it('stores canonical answers, audits privacy-safe detail, and replays an identical submission', async () => {
    const { surveyId, questions } = await seed();
    const sentinel = 'private response sentinel';
    const answers = [
      { question_id: questions.single_choice, value: 'yes' },
      { question_id: questions.multiple_choice, value: ['a', 'b'] },
      { question_id: questions.rating, value: 4 },
      { question_id: questions.text, value: `  ${sentinel}  ` },
    ];
    const key = randomUUID();
    const created = await submit(surveyId, answers, key);
    const replay = await submit(surveyId, answers, key);

    expect(created.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(created.json());
    const ack = created.json<{
      id: string;
      survey_id: string;
      submitted_at: string;
      identity_protected: boolean;
    }>();
    expect(ack).toEqual({
      id: expect.any(String),
      survey_id: surveyId,
      submitted_at: expect.any(String),
      identity_protected: true,
    });
    const stored = await migrateHandle.pool.query<{ answer_kind: string; answer_value: unknown }>(
      'select answer_kind,answer_value from survey.survey_response_answers where response_id = $1 order by answer_kind',
      [ack.id],
    );
    expect(stored.rows).toHaveLength(4);
    expect(stored.rows).toContainEqual({ answer_kind: 'text', answer_value: sentinel });
    const audit = await migrateHandle.pool.query<{
      actor_id: string;
      subject_type: string;
      subject_id: string;
      event_type: string;
      detail: unknown;
    }>(
      'select actor_id,subject_type,subject_id,event_type,detail from core.audit_log where subject_id = $1',
      [ack.id],
    );
    expect(audit.rows[0]).toEqual(
      expect.objectContaining({
        event_type: 'survey_response_submitted',
        subject_type: 'survey_response',
        subject_id: ack.id,
      }),
    );
    expect(surveyResponseSubmittedDetailSchema.parse(audit.rows[0]?.detail)).toEqual(
      expect.objectContaining({
        survey_id: surveyId,
        response_id: ack.id,
        question_count: 4,
        identity_protected: true,
      }),
    );
    expect(JSON.stringify(audit.rows[0]?.detail)).not.toContain(sentinel);
  });

  it('rejects repeat responses and non-open surveys', async () => {
    const { surveyId, questions } = await seed();
    const answers = [
      { question_id: questions.single_choice, value: 'yes' },
      { question_id: questions.multiple_choice, value: ['a'] },
      { question_id: questions.rating, value: 1 },
      { question_id: questions.text, value: 'valid' },
    ];
    expect((await submit(surveyId, answers)).statusCode).toBe(201);
    expect((await submit(surveyId, answers)).json<{ code: string }>().code).toBe(
      'conflict.survey_response_already_submitted',
    );
    for (const status of ['draft', 'closed'] as const) {
      const seeded = await seed(status);
      const response = await submit(seeded.surveyId, [
        { question_id: seeded.questions.single_choice, value: 'yes' },
        { question_id: seeded.questions.multiple_choice, value: ['a'] },
        { question_id: seeded.questions.rating, value: 1 },
        { question_id: seeded.questions.text, value: 'valid' },
      ]);
      expect(response.statusCode).toBe(409);
      expect(response.json<{ code: string }>().code).toBe('conflict.survey_not_open');
    }
  });

  it.each([
    ['unknown question', [{ question_id: randomUUID(), value: 'yes' }]],
    ['duplicate question', null],
    ['wrong type', null],
    ['invalid option', null],
    ['non-integer rating', null],
    ['long text', null],
    ['empty text', null],
  ])('returns 422 for %s', async (_name, supplied) => {
    const { surveyId, questions } = await seed();
    const valid = [
      { question_id: questions.single_choice, value: 'yes' },
      { question_id: questions.multiple_choice, value: ['a'] },
      { question_id: questions.rating, value: 4 },
      { question_id: questions.text, value: 'text' },
    ];
    const cases: Record<string, unknown> = {
      'duplicate question': [...valid, { question_id: questions.text, value: 'again' }],
      'wrong type': valid.map((answer) =>
        answer.question_id === questions.rating ? { ...answer, value: 'four' } : answer,
      ),
      'invalid option': valid.map((answer) =>
        answer.question_id === questions.single_choice ? { ...answer, value: 'missing' } : answer,
      ),
      'non-integer rating': valid.map((answer) =>
        answer.question_id === questions.rating ? { ...answer, value: 1.5 } : answer,
      ),
      'long text': valid.map((answer) =>
        answer.question_id === questions.text ? { ...answer, value: 'x'.repeat(4001) } : answer,
      ),
      'empty text': valid.map((answer) =>
        answer.question_id === questions.text ? { ...answer, value: '   ' } : answer,
      ),
    };
    const response = await submit(surveyId, supplied ?? cases[_name] ?? valid);
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });
});
