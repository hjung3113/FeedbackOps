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
import { checkSurveyPersonalResponseRead } from '../authorization.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-survey-create';
const BASIC_EXTERNAL_ID = `${SLUG_PREFIX}-basic-${randomUUID().slice(0, 8)}`;

describe.skipIf(!runIntegration)('POST /surveys (#184)', () => {
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

    const basic = await appHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'user', 'internal_member')
       returning id`,
      [WORKSPACE_ID, BASIC_EXTERNAL_ID, `${BASIC_EXTERNAL_ID}@local`, 'Survey Basic User'],
    );
    basicActorId = basic.rows[0]?.id ?? '';
    if (!basicActorId) throw new Error('basic actor seed failed');
    basicCookie = await loginAs(app, BASIC_EXTERNAL_ID);
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await migrateHandle.pool.query(
      'delete from core.actors where workspace_id = $1 and external_id = $2',
      [WORKSPACE_ID, BASIC_EXTERNAL_ID],
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
        select id from core.actors where workspace_id = $1 and external_id like $2
      )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants where workspace_id = $1 and managed_system_id in (
        ${managedSystems}
      )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.analytics_areas where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.actors where workspace_id = $1 and external_id like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}-operator-%`],
    );
  }

  async function postSurvey(
    cookie: string,
    body: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: '/surveys',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: body,
    });
  }

  async function seedManagedSystem(name = 'Survey Create MS'): Promise<string> {
    return insertMsDirectly(appHandle, WORKSPACE_ID, uid(SLUG_PREFIX), name);
  }

  function surveyBody(managedSystemId: string, overrides: Record<string, unknown> = {}) {
    return {
      type: 'discovery',
      title: 'Survey command coverage',
      primary_managed_system_id: managedSystemId,
      responses_identity_protected: true,
      ...overrides,
    };
  }

  it('allows a scoped operator and records creation audit with resolution', async () => {
    const managedSystemId = await seedManagedSystem();
    const operator = await insertDevActor(appHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-operator`));
    await grantCapability(
      appHandle,
      WORKSPACE_ID,
      operator.id,
      'survey.manage',
      managedSystemId,
      adminActorId,
    );
    const operatorCookie = await loginAs(app, operator.externalId);

    const response = await postSurvey(operatorCookie, surveyBody(managedSystemId));

    expect(response.statusCode).toBe(201);
    const created = response.json<{ id: string; display_id: string; operator_actor_id: string }>();
    expect(created.display_id).toMatch(/^SRV-\d+$/);
    expect(created.operator_actor_id).toBe(operator.id);
    const audit = await appHandle.pool.query<{
      event_type: string;
      detail: { operator_resolution: string };
    }>(
      `select event_type, detail
         from core.audit_log
        where workspace_id = $1 and subject_id = $2`,
      [WORKSPACE_ID, created.id],
    );
    expect(audit.rows).toEqual([
      expect.objectContaining({
        event_type: 'survey_created',
        detail: expect.objectContaining({ operator_resolution: 'creator' }),
      }),
    ]);
  });

  it('denies a basic user without survey.manage and permits the admin role bypass', async () => {
    const managedSystemId = await seedManagedSystem();

    const denied = await postSurvey(basicCookie, surveyBody(managedSystemId));
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.denied');

    const allowed = await postSurvey(adminCookie, surveyBody(managedSystemId));
    expect(allowed.statusCode).toBe(201);
  });

  it('rejects missing, archived, and foreign-workspace managed systems', async () => {
    const missing = await postSurvey(adminCookie, surveyBody(randomUUID()));
    expect([404, 422]).toContain(missing.statusCode);

    const archivedId = await seedManagedSystem('Archived survey MS');
    await appHandle.pool.query(
      'update core.managed_systems set archived_at = now() where id = $1',
      [archivedId],
    );
    const archived = await postSurvey(adminCookie, surveyBody(archivedId));
    expect(archived.statusCode).toBeGreaterThanOrEqual(400);

    const foreignWorkspaceId = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      foreignWorkspaceId,
      'Survey foreign workspace',
    ]);
    const foreign = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [foreignWorkspaceId, `foreign-${randomUUID()}`, 'Foreign survey MS'],
    );
    const foreignId = foreign.rows[0]?.id;
    if (!foreignId) throw new Error('foreign managed system seed failed');
    const foreignResponse = await postSurvey(adminCookie, surveyBody(foreignId));
    expect(foreignResponse.statusCode).toBe(404);
    await migrateHandle.pool.query('delete from core.managed_systems where id = $1', [foreignId]);
    await migrateHandle.pool.query('delete from core.workspaces where id = $1', [
      foreignWorkspaceId,
    ]);
  });

  it('rejects an analytics area belonging to a different managed system', async () => {
    const managedSystemId = await seedManagedSystem('Survey target MS');
    const otherManagedSystemId = await seedManagedSystem('Survey other MS');
    const area = await appHandle.pool.query<{ id: string }>(
      `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
       values ($1, $2, $3, $4) returning id`,
      [WORKSPACE_ID, otherManagedSystemId, uid(SLUG_PREFIX), 'Other survey area'],
    );
    const analyticsAreaId = area.rows[0]?.id;
    if (!analyticsAreaId) throw new Error('analytics area seed failed');

    const response = await postSurvey(
      adminCookie,
      surveyBody(managedSystemId, { analytics_area_id: analyticsAreaId }),
    );

    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('replays an idempotent create without a second row, audit, or display id', async () => {
    const managedSystemId = await seedManagedSystem();
    const idempotencyKey = randomUUID();
    const body = surveyBody(managedSystemId);

    const first = await postSurvey(adminCookie, body, idempotencyKey);
    const replay = await postSurvey(adminCookie, body, idempotencyKey);

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
    const createdId = first.json<{ id: string }>().id;
    const rows = await appHandle.pool.query<{ count: number; audits: number }>(
      `select count(*)::int as count,
              (select count(*)::int from core.audit_log where subject_id = $1 and event_type = 'survey_created') as audits
         from survey.surveys where id = $1`,
      [createdId],
    );
    expect(rows.rows[0]).toEqual({ count: 1, audits: 1 });
  });

  it('assigns strictly increasing display ids across distinct creates', async () => {
    const managedSystemId = await seedManagedSystem();
    const first = await postSurvey(adminCookie, surveyBody(managedSystemId, { title: 'First' }));
    const second = await postSurvey(adminCookie, surveyBody(managedSystemId, { title: 'Second' }));

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const parseDisplayId = (displayId: string) => Number(displayId.replace('SRV-', ''));
    expect(parseDisplayId(second.json<{ display_id: string }>().display_id)).toBeGreaterThan(
      parseDisplayId(first.json<{ display_id: string }>().display_id),
    );
  });

  it('resolves explicit and configured operators, but rejects an invalid configured default', async () => {
    const managedSystemId = await seedManagedSystem();
    const explicit = await insertDevActor(appHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-operator`));
    const configured = await insertDevActor(
      appHandle,
      WORKSPACE_ID,
      uid(`${SLUG_PREFIX}-operator`),
    );
    await grantCapability(
      appHandle,
      WORKSPACE_ID,
      explicit.id,
      'survey.manage',
      managedSystemId,
      adminActorId,
    );
    await grantCapability(
      appHandle,
      WORKSPACE_ID,
      configured.id,
      'survey.manage',
      managedSystemId,
      adminActorId,
    );
    await appHandle.pool.query(
      'update core.managed_systems set default_survey_operator_actor_id = $1 where id = $2',
      [configured.id, managedSystemId],
    );

    const explicitResponse = await postSurvey(
      adminCookie,
      surveyBody(managedSystemId, { operator_actor_id: explicit.id }),
    );
    expect(explicitResponse.statusCode).toBe(201);
    expect(explicitResponse.json<{ operator_actor_id: string }>().operator_actor_id).toBe(
      explicit.id,
    );

    const defaultResponse = await postSurvey(adminCookie, surveyBody(managedSystemId));
    expect(defaultResponse.statusCode).toBe(201);
    expect(defaultResponse.json<{ operator_actor_id: string }>().operator_actor_id).toBe(
      configured.id,
    );

    await appHandle.pool.query(
      'update core.managed_systems set default_survey_operator_actor_id = $1 where id = $2',
      [basicActorId, managedSystemId],
    );
    const invalidDefault = await postSurvey(adminCookie, surveyBody(managedSystemId));
    expect(invalidDefault.statusCode).toBe(422);
    expect(invalidDefault.json<{ code: string }>().code).toBe('validation.failed');
  });
});

describe('checkSurveyPersonalResponseRead (#184)', () => {
  it('denies an admin without the explicit personal-response grant', async () => {
    const checkService = {
      checkCapability: async () => ({
        allow: false as const,
        reason: 'no_grant' as const,
        requestable: null,
      }),
    };

    const decision = await checkSurveyPersonalResponseRead(
      checkService as never,
      { actor_id: randomUUID(), workspace_id: randomUUID(), role_level: 'admin' },
      randomUUID(),
    );

    expect(decision.allow).toBe(false);
  });
});
