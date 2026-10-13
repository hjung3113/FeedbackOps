import { randomUUID } from 'node:crypto';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';

import {
  AUDIT_EVENT_DETAIL_SCHEMAS,
  surveyDetailDtoSchema,
  surveyDtoSchema,
  surveyTemplatesResponseSchema,
} from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';
import {
  checkSurveyManage,
  checkSurveyPersonalResponseRead,
  checkSurveyRead,
} from '../authorization.js';

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
    await migrateHandle.pool.query('delete from core.sessions where actor_id = $1', [basicActorId]);
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
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
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
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.sessions where actor_id in (
        select id from core.actors where workspace_id = $1 and external_id like $2
      )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}-operator-%`],
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
    const audit = await migrateHandle.pool.query<{
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
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.managed_systems where id = $1',
      [foreignId],
    );
    await deleteRecoveryFixtureParents(migrateHandle, 'delete from core.workspaces where id = $1', [
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

  it.each(['create', 'update'] as const)(
    'rejects an archived analytics area on survey %s with the established validation detail',
    async (operation) => {
      const managedSystemId = await seedManagedSystem('Survey archived-area MS');
      const area = await appHandle.pool.query<{ id: string }>(
        `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
         values ($1, $2, $3, $4) returning id`,
        [WORKSPACE_ID, managedSystemId, uid(SLUG_PREFIX), 'Archived survey area'],
      );
      const analyticsAreaId = area.rows[0]?.id;
      if (!analyticsAreaId) throw new Error('analytics area seed failed');
      await migrateHandle.pool.query(
        'update core.analytics_areas set archived_at = now() where id = $1',
        [analyticsAreaId],
      );

      let response: Awaited<ReturnType<typeof postSurvey>>;
      if (operation === 'create') {
        response = await postSurvey(
          adminCookie,
          surveyBody(managedSystemId, { analytics_area_id: analyticsAreaId }),
        );
      } else {
        const created = await postSurvey(adminCookie, surveyBody(managedSystemId));
        expect(created.statusCode).toBe(201);
        const surveyId = created.json<{ id: string }>().id;
        response = await app.inject({
          method: 'PATCH',
          url: `/surveys/${surveyId}`,
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          payload: { analytics_area_id: analyticsAreaId },
        });
      }

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'validation.failed',
        message: 'analytics area must be active and belong to managed system',
        detail: { fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }] },
      });
      const surveys = await appHandle.pool.query<{ analytics_area_id: string | null }>(
        'select analytics_area_id from survey.surveys where workspace_id = $1 and primary_managed_system_id = $2',
        [WORKSPACE_ID, managedSystemId],
      );
      expect(surveys.rows).toEqual(operation === 'create' ? [] : [{ analytics_area_id: null }]);
    },
  );

  it('replays an idempotent create without a second row, audit, display id, or counter increment', async () => {
    const managedSystemId = await seedManagedSystem();
    const idempotencyKey = randomUUID();
    const body = surveyBody(managedSystemId);

    const first = await postSurvey(adminCookie, body, idempotencyKey);
    const replay = await postSurvey(adminCookie, body, idempotencyKey);

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
    const createdId = first.json<{ id: string }>().id;
    const rows = await migrateHandle.pool.query<{ count: number; audits: number }>(
      `select count(*)::int as count,
              (select count(*)::int from core.audit_log where subject_id = $1 and event_type = 'survey_created') as audits
         from survey.surveys where id = $1`,
      [createdId],
    );
    expect(rows.rows[0]).toEqual({ count: 1, audits: 1 });

    const next = await postSurvey(
      adminCookie,
      surveyBody(managedSystemId, { title: 'Next survey' }),
    );
    expect(next.statusCode).toBe(201);
    const parseDisplayId = (displayId: string) => Number(displayId.replace('SRV-', ''));
    expect(parseDisplayId(next.json<{ display_id: string }>().display_id)).toBe(
      parseDisplayId(first.json<{ display_id: string }>().display_id) + 1,
    );
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
  it('keeps explicit deny dominant over the admin survey role fallback', async () => {
    const checkService = {
      checkCapability: async () => ({
        allow: false as const,
        reason: 'explicit_deny' as const,
        requestable: null,
      }),
    };
    const actor = {
      actor_id: randomUUID(),
      workspace_id: randomUUID(),
      role_level: 'admin',
    } as const;
    const managedSystemId = randomUUID();

    await expect(
      checkSurveyRead(checkService as never, actor, managedSystemId),
    ).resolves.toMatchObject({
      allow: false,
      reason: 'explicit_deny',
    });
    await expect(
      checkSurveyManage(checkService as never, actor, managedSystemId),
    ).resolves.toMatchObject({
      allow: false,
      reason: 'explicit_deny',
    });
  });

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

// Independent literals from D-57 §3 C; never derive the oracle from the server catalog.
const expectedStarters = [
  {
    template_id: 'discovery-basic',
    version: 1,
    type: 'discovery',
    title: 'Discovery 기본 템플릿',
    description: 'Managed System 사용 현황과 불편을 확인하세요.',
    questions: [
      {
        key: 'usage-frequency',
        kind: 'single_choice',
        prompt: '이 Managed System을 얼마나 자주 사용하나요?',
        is_required: true,
        sort_order: 0,
        options: [
          { key: 'daily', label: '매일' },
          { key: 'weekly', label: '매주' },
          { key: 'monthly-or-less', label: '월 1회 이하' },
          { key: 'never', label: '사용한 적 없음' },
        ],
      },
      {
        key: 'pain-point',
        kind: 'text',
        prompt: '업무에서 가장 불편한 점은 무엇인가요?',
        is_required: false,
        sort_order: 1,
      },
    ],
  },
  {
    template_id: 'validation-basic',
    version: 1,
    type: 'validation',
    title: 'Validation 기본 템플릿',
    description: '제안된 개선 내용을 Survey 설명에 입력하세요.',
    questions: [
      {
        key: 'expected-usefulness',
        kind: 'rating',
        prompt: '제안된 개선이 업무에 얼마나 도움이 될 것으로 예상하나요?',
        is_required: true,
        sort_order: 0,
        rating_min: 1,
        rating_max: 5,
        rating_low_label: '전혀 도움이 되지 않음',
        rating_high_label: '매우 도움이 됨',
      },
      {
        key: 'improvement-feedback',
        kind: 'text',
        prompt: '개선안에서 보완할 점은 무엇인가요?',
        is_required: false,
        sort_order: 1,
      },
    ],
  },
  {
    template_id: 'outcome-basic',
    version: 1,
    type: 'outcome',
    title: 'Outcome 기본 템플릿',
    description: '출시된 개선 내용을 Survey 설명에 입력하세요.',
    questions: [
      {
        key: 'released-usefulness',
        kind: 'rating',
        prompt: '개선 후 이 Managed System이 업무에 얼마나 도움이 되나요?',
        is_required: true,
        sort_order: 0,
        rating_min: 1,
        rating_max: 5,
        rating_low_label: '전혀 도움이 되지 않음',
        rating_high_label: '매우 도움이 됨',
      },
      {
        key: 'remaining-pain-point',
        kind: 'text',
        prompt: '개선 후에도 남아 있는 불편은 무엇인가요?',
        is_required: false,
        sort_order: 1,
      },
    ],
  },
];

describe.skipIf(!runIntegration)('Survey built-in starting points (#1073)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let systemId: string;
  let adminId: string;
  let developerId: string;
  let userId: string;
  let adminCookie: string;
  let developerCookie: string;
  let userCookie: string;
  let auditBaseline: number;
  const prefix = 'it-survey-starter';
  const actorIds: string[] = [];
  const systemIds: string[] = [];
  const foreignWorkspaceIds: string[] = [];
  const attemptKeys: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    expect(
      (await appHandle.pool.query<{ role: string }>('select current_user as role')).rows[0]?.role,
    ).toBe('fops_app');
    expect(
      (await migrateHandle.pool.query<{ role: string }>('select current_user as role')).rows[0]
        ?.role,
    ).toBe('fops_migrate');
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await appHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('mock admin actor not found');
    const developer = await insertDevActor(appHandle, WORKSPACE_ID, uid(prefix));
    developerId = developer.id;
    actorIds.push(developerId);
    developerCookie = await loginAs(app, developer.externalId);
    const userExternalId = uid(prefix);
    const user = await insertActorRow(appHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: userExternalId,
      roleLevel: 'user',
    });
    userId = user.id;
    actorIds.push(userId);
    userCookie = await loginAs(app, userExternalId);
  });

  async function cleanup() {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.audit_log where workspace_id=$1 and
       (detail->>'primary_managed_system_id'=any($2::text[]) or
        detail->>'survey_id' in (select id::text from survey.surveys where primary_managed_system_id=any($2::uuid[])))`,
      [WORKSPACE_ID, systemIds],
    );
    await migrateHandle.pool.query(
      'delete from survey.survey_questions where survey_id in (select id from survey.surveys where primary_managed_system_id=any($1::uuid[]))',
      [systemIds],
    );
    await migrateHandle.pool.query(
      'delete from survey.surveys where primary_managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await migrateHandle.pool.query('delete from core.idempotency_keys where key=any($1::uuid[])', [
      attemptKeys,
    ]);
    await migrateHandle.pool.query(
      'delete from permission.permission_denies where managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_grants where managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await migrateHandle.pool.query(
      'delete from core.analytics_areas where managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.managed_systems where id=any($1::uuid[])',
      [systemIds],
    );
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.workspaces where id=any($1::uuid[])',
      [foreignWorkspaceIds],
    );
    await migrateHandle.pool.query(
      "delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'",
      [WORKSPACE_ID],
    );
    systemIds.length = 0;
    foreignWorkspaceIds.length = 0;
    attemptKeys.length = 0;
  }

  beforeEach(async () => {
    await cleanup();
    systemId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(prefix), 'Survey starter MS');
    systemIds.push(systemId);
    await grantCapability(appHandle, WORKSPACE_ID, developerId, 'survey.manage', systemId, adminId);
    await grantCapability(appHandle, WORKSPACE_ID, developerId, 'survey.read', systemId, adminId);
    auditBaseline = await creationAuditCount();
  });

  afterAll(async () => {
    await cleanup();
    await migrateHandle.pool.query('delete from core.sessions where actor_id=any($1::uuid[])', [
      actorIds,
    ]);
    await migrateHandle.pool.query('delete from core.actors where id=any($1::uuid[])', [actorIds]);
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  function headers(cookie: string) {
    return { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
  }
  function catalog(cookie: string, query = `managed_system_id=${systemId}`) {
    return app.inject({
      method: 'GET',
      url: `/surveys/templates?${query}`,
      headers: headers(cookie),
    });
  }
  function body(overrides: Record<string, unknown> = {}) {
    return {
      type: 'discovery',
      title: 'New operator title',
      description: 'New context',
      primary_managed_system_id: systemId,
      responses_identity_protected: false,
      starting_point: { kind: 'builtin', template_id: 'discovery-basic', version: 1 },
      ...overrides,
    };
  }
  function post(cookie: string, payload: Record<string, unknown>, key = randomUUID()) {
    attemptKeys.push(key);
    return app.inject({
      method: 'POST',
      url: '/surveys',
      headers: { ...headers(cookie), 'idempotency-key': key },
      payload,
    });
  }
  async function creationAuditCount() {
    const rows = await migrateHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from core.audit_log where workspace_id=$1
       and actor_id=any($2::uuid[]) and event_type in ('survey_created','survey_question_created')`,
      [WORKSPACE_ID, [adminId, developerId, userId]],
    );
    return rows.rows[0]?.count ?? 0;
  }
  async function expectNoWrites(keys = attemptKeys) {
    const rows = await migrateHandle.pool.query(
      `select
       (select count(*)::int from survey.surveys where primary_managed_system_id=any($1::uuid[])) as surveys,
       (select count(*)::int from survey.survey_questions where survey_id in
        (select id from survey.surveys where primary_managed_system_id=any($1::uuid[]))) as questions,
       (select count(*)::int from core.audit_log where detail->>'primary_managed_system_id'=any($1::text[])
        or detail->>'survey_id' in (select id::text from survey.surveys where primary_managed_system_id=any($1::uuid[]))) as audits,
       (select count(*)::int from core.idempotency_keys where key=any($2::uuid[])) as successes`,
      [systemIds, keys],
    );
    expect(rows.rows).toEqual([{ surveys: 0, questions: 0, audits: 0, successes: 0 }]);
    // Also catch orphaned question audits if the failed Survey row has rolled back.
    expect(await creationAuditCount()).toBe(auditBaseline);
  }
  async function counter() {
    const rows = await appHandle.pool.query<{ next_value: string }>(
      "select next_value from core.display_counters where workspace_id=$1 and entity_type='survey'",
      [WORKSPACE_ID],
    );
    return Number(rows.rows[0]?.next_value ?? 1000);
  }

  it.each(['admin', 'developer'] as const)(
    'returns exact authorized catalog previews to %s',
    async (role) => {
      const response = await catalog(role === 'admin' ? adminCookie : developerCookie);
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-cache');
      expect(surveyTemplatesResponseSchema.parse(response.json())).toEqual({
        items: expectedStarters,
      });
      await expectNoWrites();
    },
  );

  it.each(
    expectedStarters.flatMap((starter) =>
      ['admin', 'developer'].map((role) => ({ starter, role })),
    ),
  )(
    '$role creates a persisted $starter.template_id draft with fresh questions and ID-only audits',
    async ({ starter, role }) => {
      const response = await post(
        role === 'admin' ? adminCookie : developerCookie,
        body({
          type: starter.type,
          starting_point: {
            kind: 'builtin',
            template_id: starter.template_id,
            version: starter.version,
          },
        }),
      );
      expect(response.statusCode).toBe(201);
      const created = surveyDtoSchema.parse(response.json());
      expect(created).toMatchObject({
        status: 'draft',
        type: starter.type,
        title: 'New operator title',
        description: 'New context',
        primary_managed_system_id: systemId,
        responses_identity_protected: false,
        operator_actor_id: role === 'admin' ? adminId : developerId,
        created_by: role === 'admin' ? adminId : developerId,
        opened_at: null,
        closed_at: null,
      });
      expect(response.json()).not.toHaveProperty('questions');
      const detail = await app.inject({
        method: 'GET',
        url: `/surveys/${created.id}`,
        headers: headers(role === 'admin' ? adminCookie : developerCookie),
      });
      expect(detail.statusCode).toBe(200);
      const questions = surveyDetailDtoSchema.parse(detail.json()).questions;
      expect(new Set(questions.map((question) => question.id)).size).toBe(2);
      expect(questions).toEqual(
        starter.questions.map(({ key: _key, ...question }) => ({
          options: null,
          rating_min: null,
          rating_max: null,
          rating_low_label: null,
          rating_high_label: null,
          ...question,
          id: expect.any(String),
          survey_id: created.id,
          branch_depth: 0,
          branch_parent_question_id: null,
          branch_trigger_option_key: null,
        })),
      );
      const audit = await migrateHandle.pool.query<{
        event_type: string;
        subject_id: string;
        detail: Record<string, unknown>;
      }>("select event_type,subject_id,detail from core.audit_log where detail->>'survey_id'=$1", [
        created.id,
      ]);
      expect(audit.rows).toHaveLength(3);
      expect(audit.rows.find((row) => row.event_type === 'survey_created')?.detail).toMatchObject({
        starting_point: { kind: 'builtin', template_id: starter.template_id, version: 1 },
        question_count: 2,
        operator_resolution: 'creator',
      });
      expect(
        audit.rows
          .filter((row) => row.event_type === 'survey_question_created')
          .map((row) => row.subject_id)
          .sort(),
      ).toEqual(questions.map((question) => question.id).sort());
      for (const row of audit.rows) {
        const schema =
          row.event_type === 'survey_created'
            ? AUDIT_EVENT_DETAIL_SCHEMAS.survey_created
            : AUDIT_EVENT_DETAIL_SCHEMAS.survey_question_created;
        expect(schema.parse(row.detail)).toEqual(row.detail);
        expect(JSON.stringify(row.detail)).not.toContain(starter.questions[0]?.prompt);
      }
    },
  );

  it.each(['user', 'admin-denied', 'developer-unscoped'] as const)(
    'denies both catalog and creation for %s',
    async (role) => {
      let cookie = userCookie;
      if (role === 'admin-denied') {
        await denyCapability(appHandle, WORKSPACE_ID, adminId, 'survey.manage', systemId, adminId);
        cookie = adminCookie;
      } else if (role === 'developer-unscoped') {
        const otherId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(prefix), 'Unscoped MS');
        systemIds.push(otherId);
        systemId = otherId;
        cookie = developerCookie;
      }
      const read = await catalog(cookie);
      const create = await post(cookie, body());
      for (const response of [read, create]) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ code: 'permission.denied' });
      }
      await expectNoWrites();
    },
  );

  it.each(['missing', 'foreign', 'archived'] as const)(
    'rejects %s systems at both routes without writes',
    async (kind) => {
      let target: string = randomUUID();
      if (kind === 'archived') {
        target = systemId;
        await migrateHandle.pool.query(
          'update core.managed_systems set archived_at=now() where id=$1',
          [target],
        );
      } else if (kind === 'foreign') {
        const workspaceId = randomUUID();
        foreignWorkspaceIds.push(workspaceId);
        await migrateHandle.pool.query('insert into core.workspaces(id,name) values($1,$2)', [
          workspaceId,
          'Foreign starter WS',
        ]);
        target = await insertMsDirectly(
          migrateHandle,
          workspaceId,
          uid(prefix),
          'Foreign starter MS',
        );
        systemIds.push(target);
      }
      for (const response of [
        await catalog(adminCookie, `managed_system_id=${target}`),
        await post(adminCookie, body({ primary_managed_system_id: target })),
      ]) {
        expect(response.statusCode).toBe(kind === 'archived' ? 409 : 404);
        expect(response.json()).toMatchObject({
          code: kind === 'archived' ? 'conflict.parent_archived' : 'not_found.record',
        });
      }
      await expectNoWrites();
    },
  );

  it('rejects an Analytics Area from another system without writes', async () => {
    const otherId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(prefix), 'Other MS');
    systemIds.push(otherId);
    const area = await appHandle.pool.query<{ id: string }>(
      'insert into core.analytics_areas(workspace_id,managed_system_id,slug,name) values($1,$2,$3,$4) returning id',
      [WORKSPACE_ID, otherId, uid(prefix), 'Other area'],
    );
    const response = await post(adminCookie, body({ analytics_area_id: area.rows[0]?.id }));
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }] },
    });
    await expectNoWrites();
  });

  it.each([
    ['missing privacy', { responses_identity_protected: undefined }],
    ['missing system', { primary_managed_system_id: undefined }],
    [
      'unknown template',
      { starting_point: { kind: 'builtin', template_id: 'unknown', version: 1 } },
    ],
    [
      'wrong version',
      { starting_point: { kind: 'builtin', template_id: 'discovery-basic', version: 2 } },
    ],
    ['type mismatch', { type: 'outcome' }],
    ['raw questions', { questions: [{ kind: 'text', prompt: 'Injected' }] }],
    [
      'nested raw questions',
      {
        starting_point: {
          kind: 'builtin',
          template_id: 'discovery-basic',
          version: 1,
          questions: [],
        },
      },
    ],
    [
      'existing source missing token',
      {
        starting_point: {
          kind: 'existing_survey',
          survey_id: randomUUID(),
        },
      },
    ],
  ])('rejects %s without a graph, audit, or idempotency success', async (_name, overrides) => {
    const response = await post(adminCookie, body(overrides));
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'validation.failed' });
    await expectNoWrites();
  });

  it.each([
    '',
    'managed_system_id=all',
    'managed_system_id=bad',
    'managed_system_id=SYSTEM&extra=x',
    'managed_system_id=SYSTEM&managed_system_id=SYSTEM',
  ])('rejects strict catalog query %s', async (query) => {
    const response = await catalog(adminCookie, query.replaceAll('SYSTEM', systemId));
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'validation.failed' });
  });

  it('requires a session and matching Workspace for catalog reads', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: `/surveys/templates?managed_system_id=${systemId}`,
    });
    expect(missing.statusCode).toBe(401);
    const foreignWorkspaceId = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces(id,name) values($1,$2)', [
      foreignWorkspaceId,
      'Foreign session WS',
    ]);
    await migrateHandle.pool.query('update core.sessions set workspace_id=$1 where id=$2', [
      foreignWorkspaceId,
      userCookie,
    ]);
    try {
      const mismatch = await catalog(userCookie);
      expect(mismatch.statusCode).toBe(403);
      expect(mismatch.json()).toMatchObject({ code: 'auth.workspace_mismatch' });
    } finally {
      await migrateHandle.pool.query('update core.sessions set workspace_id=$1 where id=$2', [
        WORKSPACE_ID,
        userCookie,
      ]);
      await deleteRecoveryFixtureParents(migrateHandle, 'delete from core.workspaces where id=$1', [
        foreignWorkspaceId,
      ]);
    }
    await expectNoWrites();
  });

  it('keeps blank creation empty while resolving explicit and configured operators anew', async () => {
    const { starting_point: _startingPoint, ...blank } = body();
    const response = await post(adminCookie, blank);
    expect(response.statusCode).toBe(201);
    const id = response.json<{ id: string }>().id;
    const detail = await app.inject({
      method: 'GET',
      url: `/surveys/${id}`,
      headers: headers(adminCookie),
    });
    expect(surveyDetailDtoSchema.parse(detail.json()).questions).toEqual([]);
    await appHandle.pool.query(
      'update core.managed_systems set default_survey_operator_actor_id=$1 where id=$2',
      [developerId, systemId],
    );
    const configured = await post(adminCookie, body());
    const explicit = await post(adminCookie, body({ operator_actor_id: adminId }));
    expect(configured.statusCode).toBe(201);
    expect(explicit.statusCode).toBe(201);
    expect(configured.json()).toMatchObject({ operator_actor_id: developerId });
    expect(explicit.json()).toMatchObject({ operator_actor_id: adminId });
  });

  it('replays one atomic graph, audit set and counter increment; changed body conflicts', async () => {
    const key = randomUUID();
    const payload = body();
    const before = await counter();
    const first = await post(adminCookie, payload, key);
    expect(first.statusCode).toBe(201);
    const firstId = first.json<{ id: string }>().id;
    const replay = await post(adminCookie, payload, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(await counter()).toBe(before + 1);
    const conflict = await post(
      adminCookie,
      body({
        starting_point: { kind: 'builtin', template_id: 'validation-basic', version: 1 },
        type: 'validation',
      }),
      key,
    );
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'conflict.idempotency_key_reuse' });
    const rows = await migrateHandle.pool.query(
      `select
       (select count(*)::int from survey.surveys where primary_managed_system_id=$1) as surveys,
       (select count(*)::int from survey.survey_questions where survey_id=$2::uuid) as questions,
       (select count(*)::int from core.audit_log where detail->>'survey_id'=$2::text) as audits`,
      [systemId, firstId],
    );
    expect(rows.rows).toEqual([{ surveys: 1, questions: 2, audits: 3 }]);
    const next = await post(adminCookie, payload);
    expect(next.statusCode).toBe(201);
    expect(next.json<{ display_id: string }>().display_id).not.toBe(
      first.json<{ display_id: string }>().display_id,
    );
    const ids = await appHandle.pool.query<{ id: string }>(
      'select id from survey.survey_questions where survey_id=any($1::uuid[])',
      [[firstId, next.json<{ id: string }>().id]],
    );
    expect(new Set(ids.rows.map((row) => row.id)).size).toBe(4);
  });

  it('rolls back a second-question real constraint failure and can retry the same key', async () => {
    const constraint = `it_starter_${randomUUID().replaceAll('-', '')}`;
    const key = randomUUID();
    const before = await counter();
    // NOT VALID leaves historical rows alone; fail only this workspace's starter second question.
    await migrateHandle.pool.query(
      `alter table survey.survey_questions add constraint ${constraint}
       check (workspace_id <> '${WORKSPACE_ID}'::uuid or prompt <> '업무에서 가장 불편한 점은 무엇인가요?') not valid`,
    );
    try {
      const failed = await post(adminCookie, body(), key);
      expect(failed.statusCode).toBe(500);
      await expectNoWrites();
      expect(await counter()).toBe(before);
    } finally {
      await migrateHandle.pool.query(
        `alter table survey.survey_questions drop constraint ${constraint}`,
      );
    }
    const retry = await post(adminCookie, body(), key);
    expect(retry.statusCode).toBe(201);
    const detail = await app.inject({
      method: 'GET',
      url: `/surveys/${retry.json<{ id: string }>().id}`,
      headers: headers(adminCookie),
    });
    expect(surveyDetailDtoSchema.parse(detail.json()).questions).toHaveLength(2);
    expect(await counter()).toBe(before + 1);
  });
});
