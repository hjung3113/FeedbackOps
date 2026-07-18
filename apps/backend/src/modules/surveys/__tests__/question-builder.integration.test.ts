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
const SLUG_PREFIX = 'it-survey-questions';

describe.skipIf(!runIntegration)('survey question routes (#184)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    const managedSystems =
      'select id from core.managed_systems where workspace_id = $1 and slug like $2';
    const surveys = `select id from survey.surveys where workspace_id = $1 and primary_managed_system_id in (${managedSystems})`;
    const questions = `select id from survey.survey_questions where workspace_id = $1 and survey_id in (${surveys})`;
    await migrateHandle.pool.query(
      `delete from core.audit_log where workspace_id = $1 and subject_id in (${questions})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.audit_log where workspace_id = $1 and subject_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_questions where workspace_id = $1 and survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.surveys where workspace_id = $1 and primary_managed_system_id in (${managedSystems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys where actor_id in (
        select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'
      )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function createDraftSurvey(): Promise<string> {
    const managedSystemId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Question route MS',
    );
    const response = await app.inject({
      method: 'POST',
      url: '/surveys',
      headers: mutationHeaders(),
      payload: {
        type: 'discovery',
        title: 'Question route survey',
        primary_managed_system_id: managedSystemId,
        responses_identity_protected: true,
      },
    });
    if (response.statusCode !== 201) throw new Error(`survey seed failed: ${response.body}`);
    return response.json<{ id: string }>().id;
  }

  function mutationHeaders(idempotencyKey = randomUUID()) {
    return {
      cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    };
  }

  async function postQuestion(surveyId: string, body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/surveys/${surveyId}/questions`,
      headers: mutationHeaders(),
      payload: body,
    });
  }

  async function patchQuestion(
    surveyId: string,
    questionId: string,
    body: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/surveys/${surveyId}/questions/${questionId}`,
      headers: mutationHeaders(),
      payload: body,
    });
  }

  const choiceQuestion = (overrides: Record<string, unknown> = {}) => ({
    kind: 'single_choice',
    prompt: 'How useful is it?',
    options: [
      { key: 'yes', label: 'Yes' },
      { key: 'no', label: 'No' },
    ],
    ...overrides,
  });

  it('creates a draft question and writes a survey_question_created audit event', async () => {
    const surveyId = await createDraftSurvey();
    const response = await postQuestion(surveyId, choiceQuestion());

    expect(response.statusCode).toBe(201);
    const created = response.json<{ id: string; kind: string }>();
    expect(created.kind).toBe('single_choice');
    const audit = await appHandle.pool.query<{ event_type: string; detail: { survey_id: string } }>(
      'select event_type, detail from core.audit_log where subject_id = $1',
      [created.id],
    );
    expect(audit.rows).toEqual([
      expect.objectContaining({
        event_type: 'survey_question_created',
        detail: expect.objectContaining({ survey_id: surveyId }),
      }),
    ]);
  });

  it('rejects question changes after the survey opens', async () => {
    const surveyId = await createDraftSurvey();
    const created = await postQuestion(surveyId, choiceQuestion());
    const questionId = created.json<{ id: string }>().id;
    const opened = await app.inject({
      method: 'POST',
      url: `/surveys/${surveyId}/open`,
      headers: mutationHeaders(),
    });
    expect(opened.statusCode).toBe(200);

    const createOnOpen = await postQuestion(
      surveyId,
      choiceQuestion({ prompt: 'Second question' }),
    );
    const updateOnOpen = await patchQuestion(
      surveyId,
      questionId,
      choiceQuestion({ prompt: 'Updated after open' }),
    );
    const deleteOnOpen = await app.inject({
      method: 'DELETE',
      url: `/surveys/${surveyId}/questions/${questionId}`,
      headers: mutationHeaders(),
    });
    expect([409, 422]).toContain(createOnOpen.statusCode);
    expect(createOnOpen.json<{ code: string }>().code).toBe('validation.failed');
    for (const response of [updateOnOpen, deleteOnOpen]) {
      expect([409, 422]).toContain(response.statusCode);
      expect(response.json<{ code: string }>().code).toBe('validation.failed');
    }
  });

  it('rejects a branch of a branch through the route', async () => {
    const surveyId = await createDraftSurvey();
    const parent = await postQuestion(surveyId, choiceQuestion());
    const parentId = parent.json<{ id: string }>().id;
    const child = await postQuestion(
      surveyId,
      choiceQuestion({
        prompt: 'Follow-up',
        branch_parent_question_id: parentId,
        branch_trigger_option_key: 'yes',
      }),
    );
    expect(child.statusCode).toBe(201);

    const grandchild = await postQuestion(
      surveyId,
      choiceQuestion({
        prompt: 'Forbidden grandchild',
        branch_parent_question_id: child.json<{ id: string }>().id,
        branch_trigger_option_key: 'yes',
      }),
    );
    expect(grandchild.statusCode).toBe(422);
    expect(grandchild.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('rejects deleting a parent or removing an option referenced by its child', async () => {
    const surveyId = await createDraftSurvey();
    const parent = await postQuestion(surveyId, choiceQuestion());
    const parentId = parent.json<{ id: string }>().id;
    const child = await postQuestion(
      surveyId,
      choiceQuestion({
        prompt: 'Conditional child',
        branch_parent_question_id: parentId,
        branch_trigger_option_key: 'yes',
      }),
    );
    expect(child.statusCode).toBe(201);

    const removeOption = await patchQuestion(
      surveyId,
      parentId,
      choiceQuestion({
        options: [
          { key: 'no', label: 'No' },
          { key: 'maybe', label: 'Maybe' },
        ],
      }),
    );
    expect(removeOption.statusCode).toBe(422);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/surveys/${surveyId}/questions/${parentId}`,
      headers: mutationHeaders(),
    });
    expect(deleted.statusCode).toBe(422);
    expect(deleted.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('rejects invalid choice and rating question shapes', async () => {
    const surveyId = await createDraftSurvey();
    const oneOption = await postQuestion(
      surveyId,
      choiceQuestion({ options: [{ key: 'only', label: 'Only' }] }),
    );
    const duplicateKeys = await postQuestion(
      surveyId,
      choiceQuestion({
        options: [
          { key: 'same', label: 'First' },
          { key: 'same', label: 'Second' },
        ],
      }),
    );
    const invalidRating = await postQuestion(surveyId, {
      kind: 'rating',
      prompt: 'Rate this',
      rating_min: 5,
      rating_max: 5,
    });

    for (const response of [oneOption, duplicateKeys, invalidRating]) {
      expect(response.statusCode).toBe(422);
      expect(response.json<{ code: string }>().code).toBe('validation.failed');
    }
  });

  it('audits only allowed changed fields and ordering_changed on update', async () => {
    const surveyId = await createDraftSurvey();
    const created = await postQuestion(surveyId, choiceQuestion({ sort_order: 0 }));
    const questionId = created.json<{ id: string }>().id;
    const updated = await patchQuestion(
      surveyId,
      questionId,
      choiceQuestion({ prompt: 'Updated prompt', sort_order: 1 }),
    );

    expect(updated.statusCode).toBe(200);
    const audit = await appHandle.pool.query<{
      detail: { changed_fields: string[]; ordering_changed: boolean };
    }>(
      `select detail from core.audit_log where subject_id = $1 and event_type = 'survey_question_updated'`,
      [questionId],
    );
    const detail = audit.rows[0]?.detail;
    expect(detail).toBeDefined();
    expect(detail?.changed_fields).toEqual(expect.arrayContaining(['prompt', 'sort_order']));
    expect(
      detail?.changed_fields.every((field) =>
        [
          'prompt',
          'is_required',
          'options',
          'rating_min',
          'rating_max',
          'rating_low_label',
          'rating_high_label',
          'sort_order',
          'branch_parent_question_id',
          'branch_trigger_option_key',
          'kind',
        ].includes(field),
      ),
    ).toBe(true);
    expect(detail?.ordering_changed).toBe(true);
  });

  it('deletes an unreferenced question and writes a deletion audit', async () => {
    const surveyId = await createDraftSurvey();
    const created = await postQuestion(surveyId, choiceQuestion());
    const questionId = created.json<{ id: string }>().id;

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/surveys/${surveyId}/questions/${questionId}`,
      headers: mutationHeaders(),
    });

    expect(deleted.statusCode).toBe(200);
    const audit = await appHandle.pool.query<{ event_type: string; detail: { survey_id: string } }>(
      'select event_type, detail from core.audit_log where subject_id = $1',
      [questionId],
    );
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'survey_question_deleted',
          detail: expect.objectContaining({ survey_id: surveyId }),
        }),
      ]),
    );
  });
});
