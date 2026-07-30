import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-survey-patch';

describe.skipIf(!runIntegration)('survey scalar patch and question reorder (#233)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  let adminCookie: string;
  let basicActorId: string;
  let basicCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('mock admin actor not found');
    const basic = await insertDevActor(appHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-basic`));
    basicActorId = basic.id;
    basicCookie = await loginAs(app, basic.externalId);
  });

  beforeEach(async () => cleanupFixtures());

  afterAll(async () => {
    await cleanupFixtures();
    await migrateHandle.pool.query(
      `delete from core.sessions where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.actors where workspace_id = $1 and external_id like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
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
      `delete from core.audit_log where workspace_id = $1 and (subject_id in (${surveys}) or subject_id in (${questions}))`,
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
      `delete from core.idempotency_keys where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants where workspace_id = $1 and managed_system_id in (${managedSystems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  function headers(cookie: string) {
    return {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    };
  }

  async function createSurvey(cookie = adminCookie): Promise<{ id: string; primary_managed_system_id: string }> {
    const managedSystemId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Survey patch MS',
    );
    const response = await app.inject({
      method: 'POST',
      url: '/surveys',
      headers: headers(cookie),
      payload: {
        type: 'discovery',
        title: 'Before patch',
        description: 'Existing description',
        primary_managed_system_id: managedSystemId,
        responses_identity_protected: true,
      },
    });
    if (response.statusCode !== 201) throw new Error(`survey seed failed: ${response.body}`);
    return response.json<{ id: string; primary_managed_system_id: string }>();
  }

  async function patch(cookie: string, surveyId: string, payload: Record<string, unknown>) {
    return app.inject({ method: 'PATCH', url: `/surveys/${surveyId}`, headers: headers(cookie), payload });
  }

  async function addQuestion(surveyId: string, prompt: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/surveys/${surveyId}/questions`,
      headers: headers(adminCookie),
      payload: { kind: 'text', prompt },
    });
    if (response.statusCode !== 201) throw new Error(`question seed failed: ${response.body}`);
    return response.json<{ id: string }>().id;
  }

  async function reorder(surveyId: string, question_ids: string[]) {
    return app.inject({
      method: 'PATCH',
      url: `/surveys/${surveyId}/questions/reorder`,
      headers: headers(adminCookie),
      payload: { question_ids },
    });
  }

  it('patches only supplied scalar fields and records IDs-only audit detail', async () => {
    const survey = await createSurvey();
    const response = await patch(adminCookie, survey.id, { title: 'After patch' });

    expect(response.statusCode).toBe(200);
    const updated = response.json<{
      title: string;
      type: string;
      description: string | null;
      responses_identity_protected: boolean;
    }>();
    expect(updated.title).toBe('After patch');
    expect(updated.type).toBe('discovery');
    expect(updated.description).toBe('Existing description');
    expect(updated.responses_identity_protected).toBe(true);
    const audit = await appHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where subject_id = $1 and event_type = 'survey_updated'`,
      [survey.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(Object.keys(audit.rows[0]?.detail ?? {}).sort()).toEqual(['survey_id']);
  });

  it('rejects open, unauthorized, and unauthorized target-system scalar patches without mutation or audit', async () => {
    const survey = await createSurvey();
    const questionId = await addQuestion(survey.id, 'Open me');
    const opened = await app.inject({
      method: 'POST',
      url: `/surveys/${survey.id}/open`,
      headers: headers(adminCookie),
    });
    expect(opened.statusCode).toBe(200);
    const openPatch = await patch(adminCookie, survey.id, { title: 'Must not change' });
    expect(openPatch.statusCode).toBe(422);
    expect(
      openPatch.json<{ detail: { fields: Array<{ path: string[]; code: string }> } }>().detail
        .fields,
    ).toContainEqual({ path: ['status'], code: 'not_draft' });
    expect((await app.inject({ method: 'GET', url: `/surveys/${survey.id}`, headers: headers(adminCookie) })).json<{ title: string }>().title).toBe('Before patch');
    expect(questionId).toBeTruthy();

    const draft = await createSurvey();
    await grantCapability(
      appHandle,
      WORKSPACE_ID,
      basicActorId,
      'survey.read',
      draft.primary_managed_system_id,
      adminActorId,
    );
    const denied = await patch(basicCookie, draft.id, { title: 'Denied' });
    expect(denied.statusCode).toBe(403);
    expect(
      (
        await app.inject({ method: 'GET', url: `/surveys/${draft.id}`, headers: headers(adminCookie) })
      ).json<{ title: string }>().title,
    ).toBe('Before patch');
    const deniedAudits = await appHandle.pool.query(
      `select 1 from core.audit_log where subject_id = $1 and event_type = 'survey_updated'`,
      [draft.id],
    );
    expect(deniedAudits.rows).toEqual([]);

    await grantCapability(
      appHandle,
      WORKSPACE_ID,
      basicActorId,
      'survey.manage',
      draft.primary_managed_system_id,
      adminActorId,
    );
    const targetManagedSystemId = await insertMsDirectly(
      appHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Unauthorized target MS',
    );
    const targetDenied = await patch(basicCookie, draft.id, {
      primary_managed_system_id: targetManagedSystemId,
    });
    expect(targetDenied.statusCode).toBe(403);
    expect(
      (
        await app.inject({ method: 'GET', url: `/surveys/${draft.id}`, headers: headers(adminCookie) })
      ).json<{ primary_managed_system_id: string }>().primary_managed_system_id,
    ).toBe(draft.primary_managed_system_id);
  });

  it('normalizes a complete reorder and rejects incomplete, duplicate, and foreign IDs atomically', async () => {
    const survey = await createSurvey();
    const q1 = await addQuestion(survey.id, 'One');
    const q2 = await addQuestion(survey.id, 'Two');
    const q3 = await addQuestion(survey.id, 'Three');
    const reordered = await reorder(survey.id, [q3, q1, q2]);

    expect(reordered.statusCode).toBe(200);
    const questions = reordered.json<{ questions: Array<{ id: string; sort_order: number }> }>().questions;
    expect(questions.map((question) => question.id)).toEqual([q3, q1, q2]);
    expect(questions[0]?.sort_order).toBe(0);
    expect(questions[1]?.sort_order).toBe(1);
    expect(questions[2]?.sort_order).toBe(2);
    const audit = await appHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where subject_id = $1 and event_type = 'survey_questions_reordered'`,
      [survey.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(Object.keys(audit.rows[0]?.detail ?? {}).sort()).toEqual(['survey_id']);

    const foreign = await createSurvey();
    const foreignQuestion = await addQuestion(foreign.id, 'Foreign');
    for (const bad of [[q3, q1], [q3, q1, q1], [q3, q1, foreignQuestion]]) {
      const failed = await reorder(survey.id, bad);
      expect(failed.statusCode).toBe(422);
      const current = await app.inject({ method: 'GET', url: `/surveys/${survey.id}`, headers: headers(adminCookie) });
      expect(current.json<{ questions: Array<{ id: string; sort_order: number }> }>().questions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: q3, sort_order: 0 }),
          expect.objectContaining({ id: q1, sort_order: 1 }),
          expect.objectContaining({ id: q2, sort_order: 2 }),
        ]),
      );
    }
  });
});
