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
const SLUG_PREFIX = 'it-survey-lifecycle';

describe.skipIf(!runIntegration)('survey lifecycle routes (#184)', () => {
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

  function mutationHeaders() {
    return {
      cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    };
  }

  function bodylessMutationHeaders() {
    return {
      cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      'idempotency-key': randomUUID(),
    };
  }

  async function createSurvey(): Promise<string> {
    const managedSystemId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Lifecycle route MS',
    );
    const response = await app.inject({
      method: 'POST',
      url: '/surveys',
      headers: mutationHeaders(),
      payload: {
        type: 'validation',
        title: 'Lifecycle survey',
        primary_managed_system_id: managedSystemId,
        responses_identity_protected: false,
      },
    });
    if (response.statusCode !== 201) throw new Error(`survey seed failed: ${response.body}`);
    return response.json<{ id: string }>().id;
  }

  async function addQuestion(surveyId: string): Promise<void> {
    const response = await app.inject({
      method: 'POST',
      url: `/surveys/${surveyId}/questions`,
      headers: mutationHeaders(),
      payload: {
        kind: 'single_choice',
        prompt: 'Will this open?',
        options: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
      },
    });
    if (response.statusCode !== 201) throw new Error(`question seed failed: ${response.body}`);
  }

  async function transition(surveyId: string, target: 'open' | 'close') {
    return app.inject({
      method: 'POST',
      url: `/surveys/${surveyId}/${target}`,
      headers: bodylessMutationHeaders(),
    });
  }

  it('requires at least one question before opening', async () => {
    const surveyId = await createSurvey();
    const response = await transition(surveyId, 'open');

    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('opens a draft survey, sets opened_at, and records question_count in its audit', async () => {
    const surveyId = await createSurvey();
    await addQuestion(surveyId);
    const response = await transition(surveyId, 'open');

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string; opened_at: string | null }>().status).toBe('open');
    expect(response.json<{ opened_at: string | null }>().opened_at).not.toBeNull();
    const audit = await appHandle.pool.query<{
      event_type: string;
      detail: { question_count: number };
    }>(
      `select event_type, detail from core.audit_log where subject_id = $1 and event_type = 'survey_opened'`,
      [surveyId],
    );
    expect(audit.rows).toEqual([
      expect.objectContaining({
        event_type: 'survey_opened',
        detail: expect.objectContaining({ question_count: 1 }),
      }),
    ]);
  });

  it('makes open→open a no-op without a duplicate audit', async () => {
    const surveyId = await createSurvey();
    await addQuestion(surveyId);
    expect((await transition(surveyId, 'open')).statusCode).toBe(200);
    const repeated = await transition(surveyId, 'open');

    expect(repeated.statusCode).toBe(200);
    const audits = await appHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from core.audit_log where subject_id = $1 and event_type = 'survey_opened'`,
      [surveyId],
    );
    expect(audits.rows[0]?.count).toBe(1);
  });

  it('closes an open survey, audits the close, and rejects closed→open', async () => {
    const surveyId = await createSurvey();
    await addQuestion(surveyId);
    expect((await transition(surveyId, 'open')).statusCode).toBe(200);
    const closed = await transition(surveyId, 'close');

    expect(closed.statusCode).toBe(200);
    expect(closed.json<{ status: string; closed_at: string | null }>().status).toBe('closed');
    expect(closed.json<{ closed_at: string | null }>().closed_at).not.toBeNull();
    const closeAudit = await appHandle.pool.query<{
      event_type: string;
      detail: { survey_id: string };
    }>(
      `select event_type, detail from core.audit_log where subject_id = $1 and event_type = 'survey_closed'`,
      [surveyId],
    );
    expect(closeAudit.rows[0]).toEqual(
      expect.objectContaining({
        event_type: 'survey_closed',
        detail: expect.objectContaining({ survey_id: surveyId }),
      }),
    );

    const reopen = await transition(surveyId, 'open');
    expect(reopen.statusCode).toBe(422);
    expect(reopen.json<{ code: string }>().code).toBe('validation.failed');
  });
});
