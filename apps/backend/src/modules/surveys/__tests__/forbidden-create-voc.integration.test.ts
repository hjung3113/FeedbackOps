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
const SLUG_PREFIX = 'it-survey-forbidden-create-voc';

describe.skipIf(!runIntegration)('forbidden Survey Response create-VOC route (#185)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let userCookie: string;
  const idempotencyKeys = new Set<string>();
  const sessionIds = new Set<string>();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    userCookie = await loginAs(app, 'mock-user-1');
    sessionIds.add(userCookie);
  });

  beforeEach(async () => cleanupFixtures());

  afterAll(async () => {
    await cleanupFixtures({ includeSessions: true });
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures({ includeSessions = false } = {}): Promise<void> {
    if (idempotencyKeys.size) {
      await migrateHandle.pool.query(
        'delete from core.idempotency_keys where key = any($1::uuid[])',
        [[...idempotencyKeys]],
      );
      idempotencyKeys.clear();
    }

    const surveys = `select id from survey.surveys where workspace_id = $1 and title like '${SLUG_PREFIX}%'`;
    const responses = `select id from survey.survey_responses where survey_id in (${surveys})`;
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where source_id in (${responses}) or target_id in (${responses})`,
      [WORKSPACE_ID],
    );
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
    await migrateHandle.pool.query(`delete from core.audit_log where subject_id in (${surveys})`, [
      WORKSPACE_ID,
    ]);
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
    if (includeSessions && sessionIds.size) {
      await migrateHandle.pool.query('delete from core.sessions where id = any($1::text[])', [
        [...sessionIds],
      ]);
      sessionIds.clear();
    }
  }

  async function seedSubmittedResponse(): Promise<string> {
    const managedSystemId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Forbidden create-VOC Survey MS',
    );
    const admin = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
      [WORKSPACE_ID],
    );
    const adminActorId = admin.rows[0]?.id;
    if (!adminActorId) throw new Error('mock admin actor not found');
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys
         (workspace_id, display_id, type, status, title, primary_managed_system_id,
          operator_actor_id, responses_identity_protected, created_by, opened_at)
       values ($1, $2, 'validation', 'open', $3, $4, $5, true, $5, now())
       returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        `${SLUG_PREFIX}-${randomUUID()}`,
        managedSystemId,
        adminActorId,
      ],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('survey seed failed');
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions
         (workspace_id, survey_id, kind, prompt, is_required, options, sort_order, branch_depth)
       values ($1, $2, 'single_choice', 'Continue?', true,
               '[{"key":"yes","label":"Yes"}]', 0, 0)
       returning id`,
      [WORKSPACE_ID, surveyId],
    );
    const questionId = question.rows[0]?.id;
    if (!questionId) throw new Error('question seed failed');

    const idempotencyKey = randomUUID();
    idempotencyKeys.add(idempotencyKey);
    const submission = await app.inject({
      method: 'POST',
      url: `/surveys/${surveyId}/responses`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userCookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: { answers: [{ question_id: questionId, value: 'yes' }] },
    });
    if (submission.statusCode !== 201) throw new Error(`response seed failed: ${submission.body}`);
    return submission.json<{ id: string }>().id;
  }

  async function snapshotCounts() {
    return migrateHandle.pool.query<{ vocs: number; entity_links: number; audit_log: number }>(
      `select
         (select count(*)::int from voc.vocs where workspace_id = $1) as vocs,
         (select count(*)::int from core.entity_links where workspace_id = $1) as entity_links,
         (select count(*)::int from core.audit_log where workspace_id = $1) as audit_log`,
      [WORKSPACE_ID],
    );
  }

  it('returns 404 without creating a VOC, entity link, or audit record for any response id', async () => {
    const responseId = await seedSubmittedResponse();
    const before = await snapshotCounts();
    const unmatchedPath = `/definitely-not-a-route-${randomUUID()}`;
    const unmatched = await app.inject({ method: 'POST', url: unmatchedPath });
    const unmatchedBody = unmatched.json<Record<string, unknown>>();

    expect(unmatched.statusCode).toBe(404);
    expect(unmatchedBody).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: expect.stringMatching(/^Route POST:.* not found$/),
    });
    expect(unmatchedBody).not.toHaveProperty('code');

    for (const id of [responseId, randomUUID()]) {
      const createVocPath = `/survey-responses/${id}/create-voc`;
      const response = await app.inject({
        method: 'POST',
        url: createVocPath,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${userCookie}` },
      });
      const body = response.json<Record<string, unknown>>();

      expect(response.statusCode).toBe(404);
      expect(Object.keys(body).sort()).toEqual(Object.keys(unmatchedBody).sort());
      expect(body).toEqual({
        ...unmatchedBody,
        message: (unmatchedBody.message as string).replace(unmatchedPath, createVocPath),
      });
      expect(body).not.toHaveProperty('code');
    }

    const after = await snapshotCounts();
    expect(after.rows).toEqual(before.rows);
    const generatedVocLinks = await migrateHandle.pool.query<{ count: number }>(
      "select count(*)::int as count from core.entity_links where relation_type = 'generated_voc'",
    );
    expect(generatedVocLinks.rows).toEqual([{ count: 0 }]);
  });
});
