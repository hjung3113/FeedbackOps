import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  permissionRequestAdminDetailSchema,
  permissionRequestOwnerDetailSchema,
} from '@fops/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import * as coreSchema from '../../../db/schema/core.js';
import * as permissionSchema from '../../../db/schema/permission.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import {
  denyCapability,
  grantCapability,
  insertPermissionRequestRow,
  revokeDeny,
  seedPermissionSelectedReadScale,
} from '../../../test-support/permissions-fixtures.js';
import { insertTaskRow } from '../../../test-support/task-fixtures.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { createRecordingNotificationDispatcher } from '../../notifications/index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = `selected-read-${randomUUID()}`;

describe.skipIf(!runIntegration)('selected Permission request reads (ADR-0066)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  const queries: { sql: string; params: unknown[] }[] = [];
  const dispatcher = createRecordingNotificationDispatcher();
  const actorIds: string[] = [];
  const msIds: string[] = [];
  const workspaceIds: string[] = [];
  let user: { id: string; cookie: string };
  let admin: { id: string; cookie: string };
  let ms: string;
  let sibling: string;

  // Limiter keys are `<workspace>:<actor>`; the shared Admin's decision bursts would
  // otherwise trip the sensitive tier across cases.
  const resetRateLimits = () =>
    migrate.pool.query(
      "delete from core.rate_limits where split_part(key, ':', 2) = any($1::text[])",
      [actorIds],
    );

  beforeEach(async () => {
    await resetRateLimits();
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    db.db = drizzle(db.pool, {
      schema: { ...coreSchema, ...permissionSchema },
      logger: {
        logQuery(sql, params) {
          queries.push({ sql, params });
        },
      },
    });
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({
      config: loadConfig(),
      dbHandle: db,
      notificationDispatcher: dispatcher,
    });
    await app.ready();
    user = await actor('user');
    admin = await actor('admin');
    ms = await system();
    sibling = await system();
  });

  afterAll(async () => {
    try {
      await migrate.pool.query(
        'delete from survey.survey_response_answers where workspace_id = $1 and survey_id in (select id from survey.surveys where operator_actor_id = any($2::uuid[]))',
        [WORKSPACE_ID, actorIds],
      );
      await migrate.pool.query(
        'delete from survey.survey_responses where respondent_actor_id = any($1::uuid[])',
        [actorIds],
      );
      await migrate.pool.query(
        'delete from survey.survey_questions where survey_id in (select id from survey.surveys where operator_actor_id = any($1::uuid[]))',
        [actorIds],
      );
      await migrate.pool.query(
        'delete from survey.surveys where operator_actor_id = any($1::uuid[])',
        [actorIds],
      );
      await migrate.pool.query(
        'delete from task.tasks where primary_managed_system_id = any($1::uuid[])',
        [msIds],
      );
      await migrate.pool.query(
        'delete from voc.vocs where primary_managed_system_id = any($1::uuid[])',
        [msIds],
      );
      for (const table of ['permission_grants', 'permission_denies', 'permission_requests']) {
        const column = table === 'permission_requests' ? 'requester_actor_id' : 'actor_id';
        await migrate.pool.query(
          `delete from permission.${table} where ${column} = any($1::uuid[])`,
          [actorIds],
        );
      }
      await migrate.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [
        actorIds,
      ]);
      await migrate.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
        actorIds,
      ]);
      await resetRateLimits();
      await migrate.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
      await migrate.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [
        msIds,
      ]);
      await migrate.pool.query('delete from core.workspaces where id = any($1::uuid[])', [
        workspaceIds,
      ]);
    } finally {
      await app?.close();
      await db?.close();
      await migrate?.close();
    }
  });

  async function actor(roleLevel: 'user' | 'admin' | 'developer', workspaceId = WORKSPACE_ID) {
    const externalId = `${PREFIX}-${randomUUID()}`;
    const { id } = await insertActorRow(migrate, {
      workspaceId,
      externalId,
      roleLevel,
      displayName: '검토 대상',
      email: `private-${externalId}@example.test`,
    });
    actorIds.push(id);
    const cookie = randomUUID();
    await migrate.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at)
       values ($1, $2, $3, now() + interval '1 hour', now(), now())`,
      [cookie, id, workspaceId],
    );
    return { id, cookie };
  }

  async function system(workspaceId = WORKSPACE_ID) {
    const id = await insertMsDirectly(
      migrate,
      workspaceId,
      `${PREFIX}-${randomUUID()}`,
      'Review scope',
    );
    msIds.push(id);
    return id;
  }

  function get(url: string, who = admin) {
    return app.inject({
      method: 'GET',
      url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${who.cookie}` },
    });
  }

  async function request(
    options: {
      owner?: string;
      capability?: string;
      scope?: string | null;
      workspace?: string;
      status?: 'pending' | 'needs_more_info' | 'approved' | 'rejected' | 'expired' | 'revoked';
    } = {},
  ) {
    return insertPermissionRequestRow(migrate, {
      workspaceId: options.workspace ?? WORKSPACE_ID,
      requesterActorId:
        options.owner ?? (await actor('user', options.workspace ?? WORKSPACE_ID)).id,
      requestedCapability: options.capability ?? 'voc.read',
      requestedManagedSystemId: options.scope === undefined ? ms : options.scope,
      reason: '선택한 요청 검토',
      status: options.status ?? 'pending',
    });
  }

  it('owner receives current request and editable actions without Admin internals', async () => {
    const { id } = await request({ owner: user.id });
    const response = await get(`/permission-requests/${id}`, user);
    expect(response.statusCode).toBe(200);
    const detail = permissionRequestOwnerDetailSchema.parse(response.json());
    expect(detail).toMatchObject({
      id,
      revision: 1,
      requested_managed_system_id: ms,
      latest_admin_question: null,
      allowed_actions: ['edit', 'withdraw'],
    });
    expect(detail.editable_scope_candidates).toContainEqual({ managed_system_id: ms });
    expect(response.body).not.toMatch(/risk_indicators|matching_denies|private@example|test-deny/);
  });

  it('Admin receives explained four signals, display name, Role Level and current revision', async () => {
    const requester = await actor('developer');
    const { id } = await request({ owner: requester.id, capability: 'survey.export', scope: null });
    const denyId = await denyCapability(
      migrate,
      WORKSPACE_ID,
      requester.id,
      'survey.export',
      ms,
      admin.id,
    );
    await migrate.pool.query(
      'update permission.permission_requests set revision = 3 where id = $1',
      [id],
    );
    const response = await get(`/permissions/requests/${id}`);
    expect(response.statusCode).toBe(200);
    const detail = permissionRequestAdminDetailSchema.parse(response.json());
    expect(detail).toMatchObject({
      id,
      revision: 3,
      requester: { display_name: '검토 대상', role_level: 'developer' },
    });
    expect(detail.risk_indicators).toEqual([
      { code: 'sensitive_capability', evidence: { capability: 'survey.export' } },
      { code: 'workspace_scope', evidence: { managed_system_id: null } },
      { code: 'no_expiration', evidence: { requested_expiration: null } },
      { code: 'active_deny', evidence: { denies: [{ id: denyId, managed_system_id: ms }] } },
    ]);
    expect(response.body).not.toMatch(/private@example|test-deny/);
  });

  it.each([
    ['legacy workspace VOC', 'voc.read', 'workspace', false, false],
    ['workspace Survey export', 'survey.export', 'workspace', true, false],
    ['narrowed Survey export', 'survey.export', 'workspace', true, true],
    ['system VOC', 'voc.read', 'system', true, false],
  ] as const)(
    '%s advertises only executable Admin decisions',
    async (_label, capability, scopeKind, supported, narrow) => {
      const scope = scopeKind === 'workspace' ? null : ms;
      const { id } = await request({ capability, scope });
      const response = await get(`/permissions/requests/${id}`);
      expect(response.statusCode).toBe(200);
      const detail = permissionRequestAdminDetailSchema.parse(response.json());
      expect(detail.allowed_actions).toEqual(
        supported
          ? ['approve', 'reject', 'need_more_info', 'deny']
          : ['reject', 'need_more_info', 'deny'],
      );
      if (supported) {
        expect(detail.approval_scope_candidates).toContainEqual({ managed_system_id: scope });
        if (narrow)
          expect(detail.approval_scope_candidates).toContainEqual({ managed_system_id: ms });
      } else {
        expect(detail.approval_scope_candidates).toEqual([]);
        const approval = await app.inject({
          method: 'POST',
          url: `/permissions/requests/${id}/approve`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}` },
          payload: { expected_revision: detail.revision, granted_managed_system_id: ms },
        });
        expect(approval.statusCode).toBe(422);
        expect(approval.json()).toMatchObject({ code: 'validation.failed' });
      }

      // Each decision gets its own requester/request so terminal states and grants cannot interfere.
      for (const action of detail.allowed_actions) {
        const target = await request({ capability, scope });
        const selected = await get(`/permissions/requests/${target.id}`);
        expect(selected.statusCode).toBe(200);
        const current = permissionRequestAdminDetailSchema.parse(selected.json());
        expect(current.allowed_actions).toEqual(detail.allowed_actions);
        const decision = await app.inject({
          method: 'POST',
          url: `/permissions/requests/${target.id}/${action === 'need_more_info' ? 'need-more-info' : action}`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}` },
          payload: {
            expected_revision: current.revision,
            ...(action === 'need_more_info' ? { note: '추가 확인 요청' } : { reason: '검토 완료' }),
            ...(action === 'approve' ? { granted_managed_system_id: narrow ? ms : scope } : {}),
          },
        });
        expect(decision.statusCode).toBe(200);
        expect(decision.json()).toMatchObject({
          id: target.id,
          revision: current.revision + 1,
          status:
            action === 'approve'
              ? 'approved'
              : action === 'need_more_info'
                ? 'needs_more_info'
                : 'rejected',
          ...(action === 'approve'
            ? { requested_managed_system_id: scope, granted_managed_system_id: narrow ? ms : scope }
            : {}),
        });
      }

      if (!supported) {
        const owner = await actor('user');
        const target = await request({ owner: owner.id, capability, scope });
        const selected = await get(`/permission-requests/${target.id}`, owner);
        expect(selected.statusCode).toBe(200);
        const current = permissionRequestOwnerDetailSchema.parse(selected.json());
        expect(current.allowed_actions).toContain('withdraw');
        const withdrawal = await app.inject({
          method: 'POST',
          url: `/permission-requests/${target.id}/cancel`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${owner.cookie}` },
          payload: { expected_revision: current.revision },
        });
        expect(withdrawal.statusCode).toBe(200);
        expect(withdrawal.json()).toMatchObject({ id: target.id, status: 'cancelled' });
      }
    },
  );

  it('requester detail omits risk and deny internals even when all four signals exist', async () => {
    const owner = await actor('user');
    const { id } = await request({ owner: owner.id, capability: 'survey.export', scope: null });
    await denyCapability(migrate, WORKSPACE_ID, owner.id, 'survey.export', ms, admin.id);
    const response = await get(`/permission-requests/${id}`, owner);
    expect(response.statusCode).toBe(200);
    expect(permissionRequestOwnerDetailSchema.parse(response.json()).id).toBe(id);
    expect(response.body).not.toMatch(
      /risk_indicators|matching_denies|effective_access|test-deny|private@example/,
    );
  });

  it('capability 403 precedes selected-request reads, including unknown IDs', async () => {
    const { id } = await request({ capability: 'legacy.unrecognized' });
    for (const selectedId of [id, randomUUID()]) {
      queries.length = 0;
      const response = await get(`/permissions/requests/${selectedId}`, user);
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('permission.denied');
      expect(queries.filter((query) => /permission_requests/.test(query.sql))).toEqual([]);
    }
  });

  it.each(['user', 'admin'] as const)(
    'owner detail rejects a different %s with 404',
    async (role) => {
      const { id } = await request();
      const other = await actor(role);
      const response = await get(`/permission-requests/${id}`, other);
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('not_found.record');
    },
  );

  it('Admin requester may read only their own owner detail', async () => {
    const { id } = await request({ owner: admin.id });
    const response = await get(`/permission-requests/${id}`, admin);
    expect(response.statusCode).toBe(200);
    expect(permissionRequestOwnerDetailSchema.parse(response.json()).id).toBe(id);
  });

  it.each(['/permission-requests', '/permissions/requests'])(
    '%s selected unknown/foreign IDs are 404 in both workspaces',
    async (path) => {
      const foreignWorkspace = randomUUID();
      await migrate.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
        foreignWorkspace,
        PREFIX,
      ]);
      workspaceIds.push(foreignWorkspace);
      const localActor = await actor('admin');
      const local = await request({
        owner: localActor.id,
        capability: 'workspace.read',
        scope: null,
      });
      const foreignActor = await actor('admin', foreignWorkspace);
      const foreign = await request({
        workspace: foreignWorkspace,
        owner: foreignActor.id,
        capability: 'workspace.read',
        scope: null,
      });
      for (const id of [foreign.id, randomUUID()]) {
        const response = await get(`${path}/${id}`);
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe('not_found.record');
      }
      const otherApp = await buildServer({
        config: { ...loadConfig(), WORKSPACE_ID: foreignWorkspace },
        dbHandle: db,
      });
      try {
        await otherApp.ready();
        const response = await otherApp.inject({
          method: 'GET',
          url: `${path}/${local.id}`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${foreignActor.cookie}` },
        });
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe('not_found.record');
      } finally {
        await otherApp.close();
      }
    },
  );

  it.each([
    ['pending', ['edit', 'withdraw']],
    ['needs_more_info', ['supplement', 'withdraw']],
    ['approved', []],
    ['rejected', []],
    ['cancelled', []],
    ['expired', []],
    ['revoked', []],
  ] as const)(
    '%s exposes status-based actions and terminal empty actions in both reads',
    async (status, actions) => {
      const owner = await actor('user');
      const { id } = await request({ owner: owner.id });
      await migrate.pool.query(
        'update permission.permission_requests set status = $2 where id = $1',
        [id, status],
      );
      const ownerResponse = await get(`/permission-requests/${id}`, owner);
      expect(ownerResponse.statusCode).toBe(200);
      expect(
        permissionRequestOwnerDetailSchema.parse(ownerResponse.json()).allowed_actions,
      ).toEqual(actions);
      const adminResponse = await get(`/permissions/requests/${id}`);
      expect(adminResponse.statusCode).toBe(200);
      const adminActions = permissionRequestAdminDetailSchema.parse(
        adminResponse.json(),
      ).allowed_actions;
      expect(adminActions).toEqual(
        actions.length === 0 ? [] : ['approve', 'reject', 'need_more_info', 'deny'],
      );
    },
  );

  it('selected question excludes newer unrelated audit detail and unauthorized requesters', async () => {
    const owner = await actor('user');
    const stranger = await actor('user');
    const { id } = await request({ owner: owner.id, status: 'needs_more_info' });
    await migrate.pool.query(
      `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail)
       values ($1,$2,'permission_needs_more_info','permission_request',$3,'Question','{"note":"allowed question"}'::jsonb)`,
      [WORKSPACE_ID, admin.id, id],
    );
    await migrate.pool.query(
      `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail, created_at)
       values ($1,$2,'permission_approved','permission_request',$3,'Other event','{"note":"private unrelated detail"}'::jsonb,now() + interval '1 second')`,
      [WORKSPACE_ID, admin.id, id],
    );
    const visible = await get(`/permission-requests/${id}`, owner);
    expect(visible.statusCode).toBe(200);
    expect(visible.json().latest_admin_question.note).toBe('allowed question');
    expect(visible.body).not.toContain('private unrelated detail');
    expect((await get(`/permission-requests/${id}`, stranger)).statusCode).toBe(404);
  });

  it('owner receives the latest nullable Admin question and immutable source/return intent', async () => {
    const owner = await actor('user');
    const { id } = await request({ owner: owner.id, status: 'needs_more_info' });
    const sourceId = randomUUID();
    await migrate.pool.query(
      `update permission.permission_requests set revision = 7, source_object_type = 'survey_response', source_object_id = $2, source_action_id = 'read', return_route_intent = '/home' where id = $1`,
      [id, sourceId],
    );
    for (const [note, timestamp] of [
      ['older question', '2026-01-01T00:00:00Z'],
      ['current question', '2026-01-02T00:00:00Z'],
    ]) {
      await migrate.pool.query(
        `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail, created_at) values ($1, $2, 'permission_needs_more_info', 'permission_request', $3, 'Question', $4::jsonb, $5)`,
        [WORKSPACE_ID, admin.id, id, JSON.stringify({ note }), timestamp],
      );
    }
    const response = await get(`/permission-requests/${id}`, owner);
    expect(response.statusCode).toBe(200);
    expect(permissionRequestOwnerDetailSchema.parse(response.json())).toMatchObject({
      revision: 7,
      source_object_id: sourceId,
      source_action_id: 'read',
      return_route_intent: '/home',
      source_summary: null,
      latest_admin_question: { note: 'current question', created_at: '2026-01-02T00:00:00.000Z' },
    });
  });

  it.each([
    ['workspace ask / system deny', null, 'same', true],
    ['system ask / workspace deny', 'system', 'workspace', true],
    ['system ask / same deny', 'system', 'same', true],
    ['system ask / sibling deny', 'system', 'sibling', false],
    ['system ask / revoked deny', 'system', 'revoked', false],
    ['workspace ask / revoked deny', null, 'revoked', false],
    ['system ask / other Actor deny', 'system', 'actor', false],
    ['system ask / other capability deny', 'system', 'capability', false],
    ['workspace ask / foreign workspace deny', null, 'foreign', false],
  ] as const)(
    '%s overlap evidence is independent of effective authorization',
    async (_name, requestedScope, denyKind, matches) => {
      const owner = await actor('user');
      const { id } = await request({
        owner: owner.id,
        capability: 'survey.export',
        scope: requestedScope === null ? null : ms,
      });
      let workspace = WORKSPACE_ID;
      if (denyKind === 'foreign') {
        workspace = randomUUID();
        await migrate.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
          workspace,
          PREFIX,
        ]);
        workspaceIds.push(workspace);
      }
      const denyId = await denyCapability(
        migrate,
        workspace,
        denyKind === 'actor' ? admin.id : owner.id,
        denyKind === 'capability' ? 'voc.read' : 'survey.export',
        denyKind === 'workspace' || denyKind === 'foreign'
          ? null
          : denyKind === 'sibling'
            ? sibling
            : ms,
        admin.id,
      );
      if (denyKind === 'revoked') await revokeDeny(migrate, denyId, admin.id);
      const response = await get(`/permissions/requests/${id}`);
      expect(response.statusCode).toBe(200);
      const detail = permissionRequestAdminDetailSchema.parse(response.json());
      expect(detail.matching_denies).toEqual(
        matches ? [{ id: denyId, managed_system_id: denyKind === 'workspace' ? null : ms }] : [],
      );
      expect(detail.risk_indicators.some((signal) => signal.code === 'active_deny')).toBe(matches);
      if (requestedScope === null && denyKind === 'same')
        expect(detail.effective_access.decision).toMatchObject({
          allow: false,
          reason: 'no_grant',
        });
    },
  );

  it('effective granted scope/expiry reflect the current access decision', async () => {
    const owner = await actor('user');
    const { id } = await request({ owner: owner.id });
    const grantId = await grantCapability(
      migrate,
      WORKSPACE_ID,
      owner.id,
      'voc.read',
      ms,
      admin.id,
    );
    const expiration = '2100-01-01T00:00:00.000Z';
    await migrate.pool.query(
      'update permission.permission_grants set expires_at = $2 where id = $1',
      [grantId, expiration],
    );
    const response = await get(`/permissions/requests/${id}`);
    expect(response.statusCode).toBe(200);
    expect(permissionRequestAdminDetailSchema.parse(response.json()).effective_access).toEqual({
      decision: { allow: true, via: 'managed_system_scope', grant_id: grantId },
      scope: { kind: 'scoped', managed_system_ids: [ms] },
      expires_at: expiration,
      granted_managed_system_id: ms,
    });
  });

  it('module Admin bypass stays authoritative while deny overlap still signals', async () => {
    const owner = await actor('admin');
    const { id } = await request({ owner: owner.id, capability: 'finding.read' });
    await denyCapability(migrate, WORKSPACE_ID, owner.id, 'finding.read', ms, admin.id);
    const response = await get(`/permissions/requests/${id}`);
    expect(response.statusCode).toBe(200);
    const detail = permissionRequestAdminDetailSchema.parse(response.json());
    expect(detail.effective_access.decision).toEqual({ allow: true, via: 'role' });
    expect(detail.effective_access.scope).toEqual({ kind: 'all' });
    expect(detail.risk_indicators.map((signal) => signal.code)).toContain('active_deny');
  });

  it('successful zero signals use supported non-sensitive system capability and future expiry', async () => {
    const { id } = await request();
    await migrate.pool.query(
      'update permission.permission_requests set requested_expiration = $2 where id = $1',
      [id, '2100-01-01T00:00:00.000Z'],
    );
    const response = await get(`/permissions/requests/${id}`);
    expect(response.statusCode).toBe(200);
    expect(permissionRequestAdminDetailSchema.parse(response.json()).risk_indicators).toEqual([]);
  });

  it('reachable historical unknown capability fails selected calculation with 500 and no success payload', async () => {
    // capability is a text column without a closed CHECK: this row is reachable via historical data.
    const { id } = await request({ capability: 'legacy.unrecognized' });
    queries.length = 0;
    const response = await get(`/permissions/requests/${id}`);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: 'internal.unexpected',
      message: 'internal server error',
    });
    expect(response.json()).not.toHaveProperty('risk_indicators');
    expect(queries.some((query) => /permission_requests/.test(query.sql))).toBe(true);
    expect(
      queries.some(
        (query) => /display_name/.test(query.sql) && /from "core"\."actors"/.test(query.sql),
      ),
    ).toBe(true);
  });

  it.each(['/permission-requests', '/permissions/requests'])(
    '%s collection preserves revision/expiry and never calculates per-row risk',
    async (path) => {
      const { id } = await request({ capability: 'legacy.unrecognized' });
      const expiration = '2100-01-01T00:00:00.000Z';
      await migrate.pool.query(
        'update permission.permission_requests set revision = 4, requested_expiration = $2 where id = $1',
        [id, expiration],
      );
      queries.length = 0;
      const response = await get(path);
      expect(response.statusCode).toBe(200);
      expect(response.json().requests).toContainEqual(
        expect.objectContaining({ id, revision: 4, requested_expiration: expiration }),
      );
      expect(response.body).not.toMatch(/risk_indicators|effective_access|matching_denies/);
      expect(
        queries.filter((query) =>
          /from "core"\."actors"|managed_systems|voc\.vocs|task\.tasks/.test(query.sql),
        ),
      ).toEqual([]);
      const recipientQueries = queries.filter((query) =>
        /permission_grants|permission_denies/.test(query.sql),
      );
      // Only the caller's workspace.admin gate runs; no requester context is queried.
      expect(
        recipientQueries.every(
          (query) => query.params.includes(admin.id) && query.params.includes('workspace.admin'),
        ),
      ).toBe(true);
    },
  );

  it('mine retains shipped revision, expiry and return fields without risk internals', async () => {
    const owner = await actor('user');
    const { id } = await request({ owner: owner.id });
    await migrate.pool.query(
      `update permission.permission_requests set revision = 5, requested_expiration = $2, return_route_intent = '/home' where id = $1`,
      [id, '2100-01-01T00:00:00.000Z'],
    );
    const response = await get('/permission-requests/mine', owner);
    expect(response.statusCode).toBe(200);
    expect(response.json().requests).toContainEqual(
      expect.objectContaining({
        id,
        revision: 5,
        requested_expiration: '2100-01-01T00:00:00.000Z',
        return_route_intent: '/home',
      }),
    );
    expect(response.body).not.toMatch(/risk_indicators|matching_denies|private@example/);
  });

  it('narrowing candidates stay within requested scope and self authority reflects policy', async () => {
    const owner = await actor('user');
    const workspaceRequest = await request({
      owner: owner.id,
      capability: 'survey.export',
      scope: null,
    });
    const broad = permissionRequestAdminDetailSchema.parse(
      (await get(`/permissions/requests/${workspaceRequest.id}`)).json(),
    );
    expect(broad.approval_scope_candidates).toEqual(
      expect.arrayContaining([
        { managed_system_id: null },
        { managed_system_id: ms },
        { managed_system_id: sibling },
      ]),
    );
    const systemRequest = await request({ owner: owner.id, capability: 'voc.read', scope: ms });
    const narrow = permissionRequestAdminDetailSchema.parse(
      (await get(`/permissions/requests/${systemRequest.id}`)).json(),
    );
    expect(narrow.approval_scope_candidates).toEqual([{ managed_system_id: ms }]);
    expect(narrow.administrative_authority).toMatchObject({
      capability: 'workspace.admin',
      allowed: true,
      is_requester: false,
      self_approval_required: false,
    });
    const self = await request({ owner: admin.id, capability: 'survey.export', scope: null });
    const policy = await migrate.pool.query(
      'select permission_self_approval from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    try {
      await migrate.pool.query(
        `insert into core.workspace_settings (workspace_id, permission_self_approval) values ($1, 'forbidden') on conflict (workspace_id) do update set permission_self_approval = 'forbidden'`,
        [WORKSPACE_ID],
      );
      const response = await get(`/permissions/requests/${self.id}`);
      expect(response.statusCode).toBe(200);
      const detail = permissionRequestAdminDetailSchema.parse(response.json());
      expect(detail.administrative_authority).toMatchObject({
        is_requester: true,
        permission_self_approval: 'forbidden',
        self_approval_required: false,
      });
      expect(detail.allowed_actions).not.toContain('approve');
    } finally {
      if (policy.rows[0])
        await migrate.pool.query(
          'update core.workspace_settings set permission_self_approval = $2 where workspace_id = $1',
          [WORKSPACE_ID, policy.rows[0].permission_self_approval],
        );
      else
        await migrate.pool.query('delete from core.workspace_settings where workspace_id = $1', [
          WORKSPACE_ID,
        ]);
    }
  });

  it('restricted real Survey response sources stay opaque for owner and Admin without personal capability', async () => {
    const owner = await actor('user');
    const surveyId = randomUUID();
    const responseId = randomUUID();
    const questionId = randomUUID();
    await migrate.pool.query(
      `insert into survey.surveys (id, workspace_id, display_id, type, title, primary_managed_system_id, operator_actor_id, created_by, responses_identity_protected) values ($1, $2, $3, 'discovery', 'PRIVATE SURVEY TITLE', $4, $5, $5, true)`,
      [surveyId, WORKSPACE_ID, `${PREFIX}-survey`, ms, admin.id],
    );
    await migrate.pool.query(
      `insert into survey.survey_questions (id, workspace_id, survey_id, kind, prompt, sort_order) values ($1, $2, $3, 'text', 'PRIVATE QUESTION', 0)`,
      [questionId, WORKSPACE_ID, surveyId],
    );
    await migrate.pool.query(
      'insert into survey.survey_responses (id, workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at) values ($1, $2, $3, $4, true, now())',
      [responseId, WORKSPACE_ID, surveyId, owner.id],
    );
    await migrate.pool.query(
      `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value) values ($1, $2, $3, $4, 'text', $5::jsonb)`,
      [
        WORKSPACE_ID,
        surveyId,
        responseId,
        questionId,
        JSON.stringify({ text: 'PRIVATE RAW ANSWER' }),
      ],
    );
    const { id } = await request({ owner: owner.id, capability: 'survey.read_personal_responses' });
    await migrate.pool.query(
      `update permission.permission_requests set source_object_type = 'survey_response', source_object_id = $2 where id = $1`,
      [id, responseId],
    );
    for (const [path, reader] of [
      ['/permission-requests', owner],
      ['/permissions/requests', admin],
    ] as const) {
      queries.length = 0;
      const response = await get(`${path}/${id}`, reader);
      expect(response.statusCode).toBe(200);
      expect(response.json().source_summary).toBeNull();
      expect(response.body).not.toMatch(/PRIVATE|private@example|answer_value|respondent_actor_id/);
      expect(queries.filter((query) => /survey\.|"survey"/.test(query.sql))).toEqual([]);
    }
  });

  it.each(['voc', 'task'] as const)(
    '%s source summary uses owner authorization and a metadata allowlist',
    async (type) => {
      const owner = await actor('user');
      const otherReporter = await actor('user');
      const source =
        type === 'voc'
          ? await insertVocDirectly(
              migrate,
              WORKSPACE_ID,
              ms,
              otherReporter.id,
              'PRIVATE SOURCE TITLE',
            )
          : await insertTaskRow(migrate, {
              workspaceId: WORKSPACE_ID,
              primaryManagedSystemId: ms,
              title: 'PRIVATE SOURCE TITLE',
              createdBy: otherReporter.id,
            });
      const { id } = await request({ owner: owner.id });
      await migrate.pool.query(
        'update permission.permission_requests set source_object_type = $2, source_object_id = $3 where id = $1',
        [id, type, source.id],
      );
      const ownerResponse = await get(`/permission-requests/${id}`, owner);
      expect(ownerResponse.statusCode).toBe(200);
      expect(ownerResponse.json().source_summary).toBeNull();
      const adminResponse = await get(`/permissions/requests/${id}`);
      expect(adminResponse.statusCode).toBe(200);
      expect(adminResponse.json().source_summary).toMatchObject({ type, id: source.id });
      expect(Object.keys(adminResponse.json().source_summary).sort()).toEqual([
        'display_id',
        'id',
        'status',
        'type',
      ]);
      expect(adminResponse.body).not.toContain('PRIVATE SOURCE TITLE');
      // Source workspace ownership is independent of request scope, even for an existing source.
      const foreignWorkspace = randomUUID();
      await migrate.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
        foreignWorkspace,
        PREFIX,
      ]);
      workspaceIds.push(foreignWorkspace);
      const foreignActor = await actor('admin', foreignWorkspace);
      const foreignSystem = await system(foreignWorkspace);
      const foreignSource =
        type === 'voc'
          ? await insertVocDirectly(
              migrate,
              foreignWorkspace,
              foreignSystem,
              foreignActor.id,
              'PRIVATE FOREIGN SOURCE',
            )
          : await insertTaskRow(migrate, {
              workspaceId: foreignWorkspace,
              primaryManagedSystemId: foreignSystem,
              createdBy: foreignActor.id,
              title: 'PRIVATE FOREIGN SOURCE',
            });
      await migrate.pool.query(
        'update permission.permission_requests set source_object_id = $2 where id = $1',
        [id, foreignSource.id],
      );
      expect((await get(`/permissions/requests/${id}`)).json().source_summary).toBeNull();
    },
  );

  it('Task metadata follows the shipped elevated finding.manage gate, not a provider read shortcut', async () => {
    const source = await insertTaskRow(migrate, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      createdBy: admin.id,
    });
    for (const role of ['user', 'developer'] as const) {
      const reader = await actor(role);
      const { id } = await request({ owner: reader.id });
      await migrate.pool.query(
        "update permission.permission_requests set source_object_type = 'task', source_object_id = $2 where id = $1",
        [id, source.id],
      );
      await grantCapability(migrate, WORKSPACE_ID, reader.id, 'finding.read', ms, admin.id);
      const blocked = await get(`/permission-requests/${id}`, reader);
      expect(blocked.statusCode).toBe(200);
      expect(blocked.json().source_summary).toBeNull();
      await grantCapability(migrate, WORKSPACE_ID, reader.id, 'finding.manage', ms, admin.id);
      const withManage = await get(`/permission-requests/${id}`, reader);
      expect(withManage.statusCode).toBe(200);
      expect(withManage.json().source_summary).toEqual(
        role === 'developer'
          ? { type: 'task', id: source.id, display_id: source.display_id, status: 'backlog' }
          : null,
      );
    }
  });

  it('selected reads have no business writes, audits, links, notifications, queue or default-owner effects', async () => {
    const owner = await actor('user');
    const { id } = await request({ owner: owner.id });
    async function snapshot() {
      const result = await migrate.pool.query(
        `select
        (select jsonb_agg(to_jsonb(r) order by r.id) from permission.permission_requests r where r.id = $1) as request,
        (select count(*) from permission.permission_grants where actor_id = $2) as grants,
        (select count(*) from permission.permission_denies where actor_id = $2) as denies,
        (select count(*) from core.audit_log where subject_id = $1) as audits,
        (select count(*) from core.entity_links where source_id = $1 or target_id = $1) as links,
        (select count(*) from core.notifications where subject_id = $1) as notifications,
        (select jsonb_agg(to_jsonb(s) order by s.id) from core.managed_systems s where id = $3) as defaults`,
        [id, owner.id, ms],
      );
      return result.rows[0];
    }
    const before = await snapshot();
    const jobs = [...dispatcher.jobs];
    queries.length = 0;
    expect((await get(`/permission-requests/${id}`, owner)).statusCode).toBe(200);
    expect((await get(`/permissions/requests/${id}`)).statusCode).toBe(200);
    expect(await snapshot()).toEqual(before);
    expect(dispatcher.jobs).toEqual(jobs);
    const businessWrites = queries.filter(
      (query) =>
        /^(insert|update|delete)/i.test(query.sql.trim()) &&
        !/"core"\."(sessions|rate_limits)"/.test(query.sql),
    );
    expect(businessWrites).toEqual([]);
  });

  it('measures selected read with 5k VOC and 5k Task using indexed point reads', async () => {
    const scaleMs = await system();
    const owner = await actor('user');
    const { id } = await request({ owner: owner.id, scope: scaleMs });
    const smallVoc = await insertVocDirectly(
      migrate,
      WORKSPACE_ID,
      scaleMs,
      owner.id,
      'Baseline VOC',
    );
    await migrate.pool.query(
      `update permission.permission_requests set source_object_type = 'voc', source_object_id = $2 where id = $1`,
      [id, smallVoc.id],
    );
    queries.length = 0;
    expect((await get(`/permissions/requests/${id}`)).statusCode).toBe(200);
    const baselineQueries = queries.length;
    // Keep population exactly 5k in each source table.
    await migrate.pool.query('delete from voc.vocs where id = $1', [smallVoc.id]);
    const population = await seedPermissionSelectedReadScale(migrate, {
      workspaceId: WORKSPACE_ID,
      managedSystemId: scaleMs,
      actorId: owner.id,
      prefix: `${PREFIX}-scale`,
    });
    expect(population.vocCount).toBe(5000);
    expect(population.taskCount).toBe(5000);
    for (const path of ['/permission-requests', '/permissions/requests']) {
      queries.length = 0;
      const response = await get(path);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/risk_indicators|matching_denies|effective_access/);
      expect(
        queries.filter((query) =>
          /from "core"\."actors"|managed_systems|voc\.vocs|task\.tasks/.test(query.sql),
        ),
      ).toEqual([]);
      expect(
        queries
          .filter((query) => /permission_grants|permission_denies/.test(query.sql))
          .every(
            (query) => query.params.includes(admin.id) && query.params.includes('workspace.admin'),
          ),
      ).toBe(true);
    }
    await migrate.pool.query('analyze voc.vocs');
    await migrate.pool.query('analyze task.tasks');
    for (const [type, sourceId] of [
      ['voc', population.vocId],
      ['task', population.taskId],
    ]) {
      await migrate.pool.query(
        'update permission.permission_requests set source_object_type = $2, source_object_id = $3 where id = $1',
        [id, type, sourceId],
      );
      const latencies: number[] = [];
      let selectedQueries: typeof queries = [];
      for (let run = 0; run < 5; run++) {
        queries.length = 0;
        const start = performance.now();
        const response = await get(`/permissions/requests/${id}`);
        latencies.push(performance.now() - start);
        expect(response.statusCode).toBe(200);
        expect(response.json().source_summary).toMatchObject({ type, id: sourceId });
        selectedQueries = [...queries];
      }
      if (type === 'voc') expect(selectedQueries.length).toBe(baselineQueries);
      const sourceQueries = selectedQueries.filter((query) =>
        /from (voc\.vocs|task\.tasks)/i.test(query.sql),
      );
      expect(sourceQueries).toHaveLength(1);
      const plans: unknown[] = [];
      for (const query of sourceQueries) {
        const plan = await db.pool.query(
          `explain (analyze, buffers, format json) ${query.sql}`,
          query.params,
        );
        plans.push(plan.rows[0]);
        expect(JSON.stringify(plan.rows)).not.toMatch(/Seq Scan/);
      }
      console.info(
        'W-1081 selected-read measurement',
        JSON.stringify({
          type,
          voc_count: population.vocCount,
          task_count: population.taskCount,
          latency_ms: latencies,
          query_count: selectedQueries.length,
          source_query_count: sourceQueries.length,
          plans,
        }),
      );
    }
  }, 30_000);
});
