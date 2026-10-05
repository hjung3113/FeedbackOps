import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionDenyAdminItemSchema,
  permissionGrantAdminItemSchema,
  revokePermissionResultSchema,
} from '@fops/shared';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { seedSecondWorkspace } from '../../../test-support/seed-second-workspace.js';
import { createRecordingNotificationDispatcher } from '../../notifications/port.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const USER_AGENT = 'permission-revoke-integration-test';
const OTHER_USER_AGENT = 'permission-revoke-reference-test';

const COMMANDS = [
  {
    name: 'grant revoke',
    kind: 'grant',
    route: '/permissions/grants',
    eventType: 'permission_revoked',
    subjectType: 'permission_grant',
  },
  {
    name: 'deny lift',
    kind: 'deny',
    route: '/permissions/denies',
    eventType: 'permission_deny_revoked',
    subjectType: 'permission_deny',
  },
] as const;

type Command = (typeof COMMANDS)[number];

function sessionCookie(setCookie: string | string[] | undefined): string {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const value = values
    .find((entry) => entry)
    ?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (!value) throw new Error('mock login did not set a session cookie');
  return value;
}

async function loginAs(
  app: FastifyInstance,
  externalId: string,
  userAgent = USER_AGENT,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': userAgent },
    payload: { external_id: externalId },
  });
  return sessionCookie(response.headers['set-cookie']);
}

describe.skipIf(!runIntegration)('Admin permission revocation (ADR-0061)', () => {
  let db: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminId: string;
  let actorId: string;
  let actorCookie: string;
  const notifications = createRecordingNotificationDispatcher();
  const auditSubjectIds: string[] = [];
  const idempotencyKeys: string[] = [];
  const notificationIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({
      config: loadConfig(),
      dbHandle: db,
      notificationDispatcher: notifications,
    });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1', 'permission-revoke-admin-test');
    const admin = await db.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('mock admin missing');
  });

  beforeEach(async () => {
    await migrateDb.pool.query('delete from core.rate_limits');
    notifications.jobs.splice(0);
    const actor = await insertDevActor(db, WORKSPACE_ID, `perm-revoke-${randomUUID()}`);
    actorId = actor.id;
    actorCookie = await loginAs(app, actor.externalId);
  });

  afterEach(async () => {
    if (notificationIds.length > 0) {
      await migrateDb.pool.query('delete from core.notifications where id = any($1::uuid[])', [
        notificationIds.splice(0),
      ]);
    }
    await db.pool.query('delete from core.sessions where created_user_agent_summary = $1', [
      OTHER_USER_AGENT,
    ]);
    if (actorId) {
      const subjectIds = [...auditSubjectIds];
      await db.pool.query(
        'delete from permission.permission_requests where requester_actor_id = $1 or id = any($2::uuid[])',
        [actorId, subjectIds],
      );
      await db.pool.query(
        'delete from permission.permission_denies where actor_id = $1 or id = any($2::uuid[])',
        [actorId, subjectIds],
      );
      await db.pool.query(
        'delete from permission.permission_grants where actor_id = $1 or id = any($2::uuid[])',
        [actorId, subjectIds],
      );
      await db.pool.query('delete from core.sessions where actor_id = $1', [actorId]);
      await migrateDb.pool.query(
        'delete from core.audit_log where subject_id = any($1::uuid[]) or actor_id = $2',
        [auditSubjectIds.splice(0), actorId],
      );
      await db.pool.query('delete from core.actors where id = $1', [actorId]);
    }
    if (idempotencyKeys.length > 0) {
      await db.pool.query(
        'delete from core.idempotency_keys where actor_id = $1 and key = any($2::uuid[])',
        [adminId, idempotencyKeys.splice(0)],
      );
    }
    notifications.jobs.splice(0);
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await migrateDb?.close();
  });

  async function seedGrant(
    input: {
      capability?: string;
      revoked?: boolean;
      expiresAt?: Date | null;
      workspaceId?: string;
      actorId?: string;
      grantedByActorId?: string;
    } = {},
  ): Promise<string> {
    const revokedAt = input.revoked ? new Date() : null;
    const inserted = await db.pool.query<{ id: string }>(
      `insert into permission.permission_grants
        (workspace_id, actor_id, capability, granted_by_actor_id, expires_at,
         revoked_at, revoked_by_actor_id, revoked_reason)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        input.workspaceId ?? WORKSPACE_ID,
        input.actorId ?? actorId,
        input.capability ?? 'finding.read',
        input.grantedByActorId ?? adminId,
        input.expiresAt ?? null,
        revokedAt,
        revokedAt ? adminId : null,
        revokedAt ? 'Already revoked for test.' : null,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('grant seed failed');
    auditSubjectIds.push(id);
    return id;
  }

  async function seedDeny(
    input: {
      capability?: string;
      revoked?: boolean;
      workspaceId?: string;
      actorId?: string;
      createdByActorId?: string;
    } = {},
  ): Promise<string> {
    const revokedAt = input.revoked ? new Date() : null;
    const inserted = await db.pool.query<{ id: string }>(
      `insert into permission.permission_denies
        (workspace_id, actor_id, capability, reason, created_by_actor_id,
         revoked_at, revoked_by_actor_id)
       values ($1, $2, $3, 'Test deny.', $4, $5, $6)
       returning id`,
      [
        input.workspaceId ?? WORKSPACE_ID,
        input.actorId ?? actorId,
        input.capability ?? 'finding.read',
        input.createdByActorId ?? adminId,
        revokedAt,
        revokedAt ? adminId : null,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('deny seed failed');
    auditSubjectIds.push(id);
    return id;
  }

  function revoke(
    command: Command,
    id: string,
    payload: Record<string, unknown> = { reason: 'Administrative access review completed.' },
    cookie = adminCookie,
    idempotencyKey?: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `${command.route}/${id}/revoke`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        ...(idempotencyKey !== undefined ? { 'idempotency-key': idempotencyKey } : {}),
      },
      payload,
    });
  }

  function patchWorkspaceSettings(payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: '/workspace/settings',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
      },
      payload,
    });
  }

  async function expectNoAudit(command: Command, id: string): Promise<void> {
    const rows = await db.pool.query(
      'select 1 from core.audit_log where subject_id = $1 and event_type = $2',
      [id, command.eventType],
    );
    expect(rows.rows).toHaveLength(0);
  }

  async function assertAudit(command: Command, id: string, detail: Record<string, unknown>) {
    const rows = await db.pool.query<{ subject_type: string; detail: Record<string, unknown> }>(
      'select subject_type, detail from core.audit_log where subject_id = $1 and event_type = $2',
      [id, command.eventType],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.subject_type).toBe(command.subjectType);
    expect(rows.rows[0]?.detail).toEqual(detail);
  }

  async function seedGrantNotification(recipientId: string, grantId: string): Promise<void> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into core.notifications
        (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail, correlation_id)
       values ($1, $2, 'permission_grant.revoked', 'permission_grant', $3,
         '권한이 취소되었습니다.', $4::jsonb, $5)
       returning id`,
      [
        WORKSPACE_ID,
        recipientId,
        grantId,
        JSON.stringify({ permission_grant_id: grantId }),
        randomUUID(),
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('grant notification seed failed');
    notificationIds.push(id);
  }

  async function grantNotificationReference(
    cookie: string,
    grantId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const response = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(response.statusCode).toBe(200);
    const item = response
      .json<{ items: Array<{ subject_id: string; subject_ref?: unknown }> }>()
      .items.find((candidate) => candidate.subject_id === grantId);
    return item?.subject_ref as Record<string, unknown> | undefined;
  }

  it('admin revokes a grant, notifies the grantee, and enables a new request', async () => {
    const id = await seedGrant({ capability: 'workspace.admin' });
    const response = await revoke(COMMANDS[0], id);

    expect(response.statusCode).toBe(200);
    const body = revokePermissionResultSchema.parse(response.json());
    expect(body.id).toBe(id);
    const row = await db.pool.query<{
      revoked_at: Date | null;
      revoked_by_actor_id: string | null;
      revoked_reason: string | null;
    }>(
      `select revoked_at, revoked_by_actor_id, revoked_reason
         from permission.permission_grants where id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({
      revoked_at: new Date(body.revoked_at),
      revoked_by_actor_id: adminId,
      revoked_reason: 'Administrative access review completed.',
    });
    await assertAudit(COMMANDS[0], id, {
      grant_id: id,
      capability: 'workspace.admin',
      managed_system_id: null,
      grantee_actor_id: actorId,
      reason: 'Administrative access review completed.',
    });
    expect(notifications.jobs).toHaveLength(1);
    expect(notifications.jobs[0]).toMatchObject({
      actor_id: actorId,
      event_type: 'permission_grant.revoked',
      subject_type: 'permission_grant',
      subject_id: id,
      summary: '권한이 취소되었습니다.',
    });

    const otherActorCookie = await loginAs(app, 'mock-user-1', OTHER_USER_AGENT);
    const otherActor = await db.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-user-1'`,
      [WORKSPACE_ID],
    );
    const otherActorId = otherActor.rows[0]?.id;
    if (!otherActorId) throw new Error('mock user missing');
    await seedGrantNotification(actorId, id);
    await seedGrantNotification(adminId, id);
    await seedGrantNotification(otherActorId, id);
    expect(await grantNotificationReference(actorCookie, id)).toEqual({
      visibility_state: 'allowed',
      display_id: id.slice(0, 8),
      title: 'workspace.admin',
    });
    expect(await grantNotificationReference(adminCookie, id)).toEqual({
      visibility_state: 'allowed',
      display_id: id.slice(0, 8),
      title: 'workspace.admin',
    });
    expect(await grantNotificationReference(otherActorCookie, id)).toEqual({
      visibility_state: 'unavailable',
    });

    const check = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({
      state: 'revoked',
      decision: {
        allow: false,
        reason: 'grant_revoked',
        requestable: [{ workspace_id: WORKSPACE_ID }],
      },
    });

    notifications.jobs.splice(0);
    const request = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${actorCookie}`,
        'content-type': 'application/json',
      },
      payload: { requested_capability: 'workspace.admin', reason: 'I need access again.' },
    });
    expect(request.statusCode).toBe(201);
    const requestId = request.json<{ id: string }>().id;
    auditSubjectIds.push(requestId);
  });

  it('an expired grant is requestable and its new request becomes pending', async () => {
    await seedGrant({
      capability: 'workspace.admin',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const expiredCheck = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(expiredCheck.statusCode).toBe(200);
    expect(expiredCheck.json()).toMatchObject({
      state: 'expired',
      decision: {
        allow: false,
        reason: 'grant_expired',
        requestable: [{ workspace_id: WORKSPACE_ID }],
      },
    });

    const request = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${actorCookie}`,
        'content-type': 'application/json',
      },
      payload: { requested_capability: 'workspace.admin', reason: 'I need access again.' },
    });
    expect(request.statusCode).toBe(201);
    const requestId = request.json<{ id: string }>().id;
    auditSubjectIds.push(requestId);

    const pendingCheck = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(pendingCheck.statusCode).toBe(200);
    expect(pendingCheck.json()).toMatchObject({
      state: 'pending_request',
      decision: {
        allow: false,
        reason: 'grant_expired',
        requestable: [{ workspace_id: WORKSPACE_ID }],
      },
    });
  });

  it('an active explicit deny blocks an expired grant from being requestable', async () => {
    await seedGrant({
      capability: 'workspace.admin',
      expiresAt: new Date(Date.now() - 60_000),
    });
    await seedDeny({ capability: 'workspace.admin' });

    const check = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({
      state: 'blocked_non_requestable',
      decision: { allow: false, reason: 'explicit_deny', requestable: null },
    });
  });

  it('an Admin lifts a deny without notification and the check becomes requestable', async () => {
    const id = await seedDeny({ capability: 'workspace.admin' });
    const blocked = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(blocked.json()).toMatchObject({ state: 'blocked_non_requestable' });

    const response = await revoke(COMMANDS[1], id);
    expect(response.statusCode).toBe(200);
    expect(revokePermissionResultSchema.parse(response.json()).id).toBe(id);
    const row = await db.pool.query<{
      revoked_at: Date | null;
      revoked_by_actor_id: string | null;
    }>('select revoked_at, revoked_by_actor_id from permission.permission_denies where id = $1', [
      id,
    ]);
    expect(row.rows[0]?.revoked_at).toBeInstanceOf(Date);
    expect(row.rows[0]?.revoked_by_actor_id).toBe(adminId);
    await assertAudit(COMMANDS[1], id, {
      deny_id: id,
      capability: 'workspace.admin',
      managed_system_id: null,
      denied_actor_id: actorId,
      reason: 'Administrative access review completed.',
    });
    expect(notifications.jobs).toHaveLength(0);

    const check = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(check.json()).toMatchObject({ state: 'request_access' });
  });

  it.each(['forbidden', 'allowed'] as const)(
    'self deny lift is %s under the workspace self-approval policy',
    async (policy) => {
      const id = await seedDeny({ capability: 'voc.triage', actorId: adminId });
      const settingsRow = await db.pool.query<{
        permission_self_approval: 'allowed' | 'forbidden';
      }>('select permission_self_approval from core.workspace_settings where workspace_id = $1', [
        WORKSPACE_ID,
      ]);
      const hadSettingsRow = settingsRow.rows.length > 0;
      const originalPolicy = settingsRow.rows[0]?.permission_self_approval ?? 'allowed';
      const settingAudits = await db.pool.query<{ id: string }>(
        `select id from core.audit_log
          where workspace_id = $1 and subject_type = 'workspace' and subject_id = $1
            and event_type = 'workspace_settings_updated'`,
        [WORKSPACE_ID],
      );
      const originalAuditIds = new Set(settingAudits.rows.map((row) => row.id));

      try {
        expect(
          (await patchWorkspaceSettings({ permission_self_approval: policy })).statusCode,
        ).toBe(200);

        const response = await revoke(COMMANDS[1], id);
        if (policy === 'forbidden') {
          expect(response.statusCode).toBe(403);
          expect(response.json().code).toBe('permission.denied');
          const row = await db.pool.query<{
            revoked_at: Date | null;
            revoked_by_actor_id: string | null;
          }>(
            'select revoked_at, revoked_by_actor_id from permission.permission_denies where id = $1',
            [id],
          );
          expect(row.rows[0]).toEqual({ revoked_at: null, revoked_by_actor_id: null });
          await expectNoAudit(COMMANDS[1], id);
        } else {
          expect(response.statusCode).toBe(200);
          await assertAudit(COMMANDS[1], id, {
            deny_id: id,
            capability: 'voc.triage',
            managed_system_id: null,
            denied_actor_id: adminId,
            reason: 'Administrative access review completed.',
            self_lift: true,
          });
        }
      } finally {
        expect(
          (await patchWorkspaceSettings({ permission_self_approval: originalPolicy })).statusCode,
        ).toBe(200);
        const updatedAudits = await db.pool.query<{ id: string }>(
          `select id from core.audit_log
            where workspace_id = $1 and subject_type = 'workspace' and subject_id = $1
              and event_type = 'workspace_settings_updated'`,
          [WORKSPACE_ID],
        );
        const testAuditIds = updatedAudits.rows
          .map((row) => row.id)
          .filter((id) => !originalAuditIds.has(id));
        if (testAuditIds.length > 0) {
          await migrateDb.pool.query('delete from core.audit_log where id = any($1::uuid[])', [
            testAuditIds,
          ]);
        }
        if (!hadSettingsRow) {
          await migrateDb.pool.query(
            'delete from core.workspace_settings where workspace_id = $1',
            [WORKSPACE_ID],
          );
        }
      }
    },
  );

  it('an active deny still blocks a capability after its grant is revoked', async () => {
    const grantId = await seedGrant({ capability: 'workspace.admin' });
    await seedDeny({ capability: 'workspace.admin' });
    expect((await revoke(COMMANDS[0], grantId)).statusCode).toBe(200);

    const check = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({
      state: 'blocked_non_requestable',
      decision: { allow: false, reason: 'explicit_deny', requestable: null },
    });
  });

  it.each(COMMANDS)(
    '$name rejects non-admin callers without changing the row or audit log',
    async (command) => {
      const id = command.kind === 'grant' ? await seedGrant() : await seedDeny();
      const workspaceAdminCheck = await app.inject({
        method: 'GET',
        url: '/me/permissions/check?capability=workspace.admin',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
      });
      expect(workspaceAdminCheck.statusCode).toBe(200);
      expect(workspaceAdminCheck.json<{ decision: { allow: boolean } }>().decision.allow).toBe(
        false,
      );

      const response = await revoke(command, id, undefined, actorCookie);
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('permission.denied');
      if (command.kind === 'grant') {
        const row = await db.pool.query<{
          revoked_at: Date | null;
          revoked_by_actor_id: string | null;
          revoked_reason: string | null;
        }>(
          `select revoked_at, revoked_by_actor_id, revoked_reason
           from permission.permission_grants where id = $1`,
          [id],
        );
        expect(row.rows[0]).toEqual({
          revoked_at: null,
          revoked_by_actor_id: null,
          revoked_reason: null,
        });
      } else {
        const row = await db.pool.query<{
          revoked_at: Date | null;
          revoked_by_actor_id: string | null;
        }>(
          `select revoked_at, revoked_by_actor_id
           from permission.permission_denies where id = $1`,
          [id],
        );
        expect(row.rows[0]).toEqual({ revoked_at: null, revoked_by_actor_id: null });
      }
      await expectNoAudit(command, id);
    },
  );

  it.each(
    COMMANDS.flatMap((command) => [
      {
        command,
        label: 'unknown',
        id: randomUUID(),
        expectedStatus: 404,
        expectedCode: 'not_found.record',
      },
      {
        command,
        label: 'malformed',
        id: 'not-a-uuid',
        expectedStatus: 422,
        expectedCode: 'validation.failed',
      },
    ]),
  )(
    '$command.name returns $expectedStatus for a $label id',
    async ({ command, id, expectedStatus, expectedCode }) => {
      const response = await revoke(command, id);
      expect(response.statusCode).toBe(expectedStatus);
      expect(response.json().code).toBe(expectedCode);
      if (expectedStatus === 404) await expectNoAudit(command, id);
    },
  );

  it.each(COMMANDS)('$name returns 404 for a row in another workspace', async (command) => {
    const second = await seedSecondWorkspace(db);
    const id =
      command.kind === 'grant'
        ? await seedGrant({
            workspaceId: second.workspaceId,
            actorId: second.userActorId,
            grantedByActorId: second.adminActorId,
          })
        : await seedDeny({
            workspaceId: second.workspaceId,
            actorId: second.userActorId,
            createdByActorId: second.adminActorId,
          });
    const response = await revoke(command, id);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('not_found.record');
    await expectNoAudit(command, id);
  });

  it.each(COMMANDS)('$name returns 409 for an already-revoked row', async (command) => {
    const id =
      command.kind === 'grant'
        ? await seedGrant({ revoked: true })
        : await seedDeny({ revoked: true });
    const response = await revoke(command, id);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('conflict.permission_not_active');
    await expectNoAudit(command, id);
  });

  it('grant revoke returns 409 when the grant has expired', async () => {
    const id = await seedGrant({ expiresAt: new Date(Date.now() - 60_000) });
    const response = await revoke(COMMANDS[0], id);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('conflict.permission_not_active');
    await expectNoAudit(COMMANDS[0], id);
  });

  it.each(
    COMMANDS.flatMap((command) => [
      { command, label: 'missing', payload: {} },
      { command, label: 'blank', payload: { reason: '   ' } },
    ]),
  )('$command.name returns 422 for a $label reason', async ({ command, payload }) => {
    const id = command.kind === 'grant' ? await seedGrant() : await seedDeny();
    const response = await revoke(command, id, payload);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation.failed');
    await expectNoAudit(command, id);
  });

  it.each(COMMANDS)(
    '$name replays the same idempotent response without a second audit',
    async (command) => {
      const id = command.kind === 'grant' ? await seedGrant() : await seedDeny();
      const key = randomUUID();
      idempotencyKeys.push(key);
      const first = await revoke(command, id, undefined, adminCookie, key);
      const replay = await revoke(command, id, undefined, adminCookie, key);

      expect(first.statusCode).toBe(200);
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toEqual(first.json());
      const audits = await db.pool.query(
        'select 1 from core.audit_log where subject_id = $1 and event_type = $2',
        [id, command.eventType],
      );
      expect(audits.rows).toHaveLength(1);
      expect(notifications.jobs).toHaveLength(command.kind === 'grant' ? 1 : 0);
    },
  );

  it.each(COMMANDS)(
    '$name rejects idempotency-key reuse with a different reason',
    async (command) => {
      const id = command.kind === 'grant' ? await seedGrant() : await seedDeny();
      const key = randomUUID();
      idempotencyKeys.push(key);
      const first = await revoke(
        command,
        id,
        { reason: 'Administrative access review completed.' },
        adminCookie,
        key,
      );
      const reused = await revoke(
        command,
        id,
        { reason: 'A different administrative reason.' },
        adminCookie,
        key,
      );

      expect(first.statusCode).toBe(200);
      expect(reused.statusCode).toBe(409);
      expect(reused.json().code).toBe('conflict.idempotency_key_reuse');
      await assertAudit(command, id, {
        ...(command.kind === 'grant'
          ? {
              grant_id: id,
              capability: 'finding.read',
              managed_system_id: null,
              grantee_actor_id: actorId,
            }
          : {
              deny_id: id,
              capability: 'finding.read',
              managed_system_id: null,
              denied_actor_id: actorId,
            }),
        reason: 'Administrative access review completed.',
      });
    },
  );

  it('grant and deny lists contain active rows only and match the shared item schemas', async () => {
    const activeGrantId = await seedGrant({ capability: 'workspace.admin' });
    const revokedGrantId = await seedGrant({ capability: 'finding.read', revoked: true });
    const expiredGrantId = await seedGrant({
      capability: 'voc.read',
      expiresAt: new Date(Date.now() - 60_000),
    });
    const activeDenyId = await seedDeny({ capability: 'workspace.admin' });
    const revokedDenyId = await seedDeny({ capability: 'finding.read', revoked: true });

    const grants = await app.inject({
      method: 'GET',
      url: '/permissions/grants',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    const denies = await app.inject({
      method: 'GET',
      url: '/permissions/denies',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(grants.statusCode).toBe(200);
    expect(denies.statusCode).toBe(200);
    const grantResponse = listPermissionGrantsResponseSchema.parse(grants.json());
    const denyResponse = listPermissionDeniesResponseSchema.parse(denies.json());
    const grantIds = grantResponse.items.map((item) => item.id);
    const denyIds = denyResponse.items.map((item) => item.id);
    expect(grantIds).toContain(activeGrantId);
    expect(grantIds).not.toContain(revokedGrantId);
    expect(grantIds).not.toContain(expiredGrantId);
    expect(denyIds).toContain(activeDenyId);
    expect(denyIds).not.toContain(revokedDenyId);
    for (const item of grantResponse.items) permissionGrantAdminItemSchema.parse(item);
    for (const item of denyResponse.items) permissionDenyAdminItemSchema.parse(item);
  });

  it.each([
    { route: '/permissions/grants', name: 'grant' },
    { route: '/permissions/denies', name: 'deny' },
  ])('non-admin callers cannot list active $name rows', async ({ route }) => {
    const response = await app.inject({
      method: 'GET',
      url: route,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${actorCookie}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('permission.denied');
  });
});
