import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Capability, isSensitiveCapability } from '@fops/shared';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TEST_PREFIX = `permission-submit-more-info-${randomUUID()}`;

type Actor = { id: string; externalId: string };
type RequestRow = {
  id: string;
  workspace_id: string;
  requester_actor_id: string;
  requested_capability: string;
  requested_managed_system_id: string | null;
  requested_object_type: string | null;
  requested_object_id: string | null;
  reason: string;
  requested_expiration: Date | null;
  source_object_type: string | null;
  source_object_id: string | null;
  source_action_id: string | null;
  return_route_intent: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};
type AuditRow = {
  actor_id: string;
  event_type: string;
  subject_type: string;
  subject_id: string;
  summary: string;
  detail: Record<string, unknown>;
};
type CapturedState = { row: RequestRow; submissionAuditCount: number };

describe.skipIf(!runIntegration)('POST /permission-requests/:id/submit-more-info', () => {
  let db: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  const requestIds: string[] = [];
  const managedSystemIds: string[] = [];
  const secondaryWorkspaceIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await db?.close();
    await migrateDb?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (actorIds.length > 0) {
      await migrateDb.pool.query(
        'delete from permission.permission_grants where actor_id = any($1::uuid[])',
        [actorIds],
      );
      await migrateDb.pool.query(
        'delete from permission.permission_denies where actor_id = any($1::uuid[])',
        [actorIds],
      );
      await migrateDb.pool.query(
        'delete from permission.permission_requests where id = any($1::uuid[]) or requester_actor_id = any($2::uuid[])',
        [requestIds, actorIds],
      );
      if (managedSystemIds.length > 0) {
        await migrateDb.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [
          managedSystemIds,
        ]);
      }
      await migrateDb.pool.query('delete from core.idempotency_keys where actor_id = any($1::uuid[])', [
        actorIds,
      ]);
      await migrateDb.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        actorIds,
      ]);
      await migrateDb.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
        actorIds,
      ]);
      await migrateDb.pool.query(
        'delete from core.audit_log where subject_id = any($1::uuid[]) or actor_id = any($2::uuid[])',
        [requestIds, actorIds],
      );
      await migrateDb.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    } else if (managedSystemIds.length > 0) {
      await migrateDb.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [
        managedSystemIds,
      ]);
    }
    if (secondaryWorkspaceIds.length > 0) {
      await migrateDb.pool.query('delete from core.workspaces where id = any($1::uuid[])', [
        secondaryWorkspaceIds,
      ]);
    }
  }

  async function createActor(roleLevel = 'developer', workspaceId = WORKSPACE_ID): Promise<Actor> {
    const externalId = `${TEST_PREFIX}-${randomUUID()}`;
    const inserted = await migrateDb.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, $4, 'internal_member') returning id`,
      [workspaceId, externalId, `${externalId}@example.test`, roleLevel],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('test actor seed returned no id');
    actorIds.push(id);
    return { id, externalId };
  }

  // Sessions are seeded via SQL (same shape as create-request.integration.test.ts)
  // so this suite does not spend the shared mock-login rate-limit bucket.
  async function loginAs(actor: Actor, workspaceId = WORKSPACE_ID): Promise<string> {
    const sessionId = randomUUID();
    await migrateDb.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [sessionId, actor.id, workspaceId],
    );
    return sessionId;
  }

  async function createLoggedInActor(roleLevel = 'developer'): Promise<Actor & { cookie: string }> {
    const actor = await createActor(roleLevel);
    return { ...actor, cookie: await loginAs(actor) };
  }

  async function createWorkspace(): Promise<string> {
    const inserted = await migrateDb.pool.query<{ id: string }>(
      'insert into core.workspaces (name) values ($1) returning id',
      [`${TEST_PREFIX}-${randomUUID()}`],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('test workspace seed returned no id');
    secondaryWorkspaceIds.push(id);
    return id;
  }

  async function createManagedSystem(workspaceId = WORKSPACE_ID): Promise<string> {
    const inserted = await migrateDb.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, 'Permission supplement integration test') returning id`,
      [workspaceId, `${TEST_PREFIX}-${randomUUID()}`],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('test managed system seed returned no id');
    managedSystemIds.push(id);
    return id;
  }

  async function seedRequest(
    requesterActorId: string,
    input: {
      workspaceId?: string;
      capability?: string;
      status?: string;
      managedSystemId?: string | null;
      objectType?: string | null;
      objectId?: string | null;
      reason?: string;
      expiration?: string | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await migrateDb.pool.query(
      `insert into permission.permission_requests
        (id, workspace_id, requester_actor_id, requested_capability,
         requested_managed_system_id, requested_object_type, requested_object_id,
         reason, requested_expiration, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               now() - interval '1 minute', now() - interval '1 minute')`,
      [
        id,
        input.workspaceId ?? WORKSPACE_ID,
        requesterActorId,
        input.capability ?? 'voc.triage',
        input.managedSystemId ?? null,
        input.objectType ?? null,
        input.objectId ?? null,
        input.reason ?? `stored reason ${id}`,
        input.expiration ?? null,
        input.status ?? 'needs_more_info',
      ],
    );
    requestIds.push(id);
    return id;
  }

  async function seedDecisionHistory(requestId: string, requesterId: string, adminId: string) {
    const request = await readRequest(requestId);
    await migrateDb.pool.query(
      `insert into core.audit_log
        (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail, created_at)
       values
        ($1, $2, 'permission_requested', 'permission_request', $3,
         $4, $5::jsonb, now() - interval '3 minutes'),
        ($1, $6, 'permission_needs_more_info', 'permission_request', $3,
         'Permission request need more info', $7::jsonb, now() - interval '2 minutes')`,
      [
        request.workspace_id,
        requesterId,
        requestId,
        `Permission requested: ${request.requested_capability}`,
        JSON.stringify({
          capability: request.requested_capability,
          managed_system_id: request.requested_managed_system_id,
          reason: request.reason,
          sensitive: request.requested_capability === 'workspace.admin',
          source_object_type: null,
          source_object_id: null,
          source_action_id: null,
        }),
        adminId,
        JSON.stringify({
          capability: request.requested_capability,
          managed_system_id: request.requested_managed_system_id,
          requester_actor_id: requesterId,
          note: 'Please provide the missing scope details.',
        }),
      ],
    );
  }

  async function readRequest(id: string): Promise<RequestRow> {
    const result = await db.pool.query<RequestRow>(
      'select * from permission.permission_requests where id = $1',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`permission request not found: ${id}`);
    return row;
  }

  function submit(id: string, cookie: string, body: Record<string, unknown> = {}, key?: string) {
    return app.inject({
      method: 'POST',
      url: `/permission-requests/${id}/submit-more-info`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      payload: body,
    });
  }

  async function submissionAuditCount(requestId: string): Promise<number> {
    const result = await db.pool.query<{ count: number }>(
      `select count(*)::int as count from core.audit_log
        where subject_id = $1 and event_type = 'permission_more_info_submitted'`,
      [requestId],
    );
    return result.rows[0]?.count ?? 0;
  }

  async function captureState(requestId: string): Promise<CapturedState> {
    return {
      row: await readRequest(requestId),
      submissionAuditCount: await submissionAuditCount(requestId),
    };
  }

  async function expectRejectedUnchanged(
    requestId: string,
    before: CapturedState,
    response: Awaited<ReturnType<typeof submit>>,
    status: number,
    code: string,
  ) {
    expect(response.statusCode).toBe(status);
    expect(response.json<{ code: string }>().code).toBe(code);
    expect(await readRequest(requestId)).toEqual(before.row);
    expect(await submissionAuditCount(requestId)).toBe(before.submissionAuditCount);
  }

  async function assertSuccess(
    requestId: string,
    actorId: string,
    cookie: string,
    body: Record<string, unknown> = {},
    key?: string,
  ) {
    const before = await readRequest(requestId);
    const beforeAuditCount = await submissionAuditCount(requestId);
    const response = await submit(requestId, cookie, body, key);
    expect(response.statusCode).toBe(200);
    const result = response.json<{ id: string; status: string; updated_at: string }>();
    expect(result).toEqual({
      id: requestId,
      status: 'pending',
      updated_at: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(result.updated_at))).toBe(false);

    const after = await readRequest(requestId);
    expect(after.status).toBe('pending');
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(new Date(result.updated_at).getTime()).toBe(after.updated_at.getTime());
    expect(await submissionAuditCount(requestId)).toBe(beforeAuditCount + 1);

    const auditRows = await db.pool.query<AuditRow>(
      `select actor_id, event_type, subject_type, subject_id, summary, detail
         from core.audit_log
        where subject_id = $1 and event_type = 'permission_more_info_submitted'`,
      [requestId],
    );
    expect(auditRows.rowCount).toBe(1);
    const audit = auditRows.rows[0];
    expect(audit).toBeDefined();
    expect(audit).toMatchObject({
      actor_id: actorId,
      event_type: 'permission_more_info_submitted',
      subject_type: 'permission_request',
      subject_id: requestId,
      summary: 'Permission request more info submitted',
    });
    expect(audit?.detail).toEqual({
      capability: after.requested_capability,
      managed_system_id: after.requested_managed_system_id,
      requester_actor_id: actorId,
      reason: after.reason,
      sensitive: isSensitiveCapability(after.requested_capability as Capability),
      requested_object_type: after.requested_object_type,
      requested_object_id: after.requested_object_id,
      requested_expiration: after.requested_expiration?.toISOString() ?? null,
      previous: {
        reason: before.reason,
        managed_system_id: before.requested_managed_system_id,
        requested_object_type: before.requested_object_type,
        requested_object_id: before.requested_object_id,
        requested_expiration: before.requested_expiration?.toISOString() ?? null,
      },
    });
    return { response, result, before, after };
  }

  it('omitting every field keeps the stored values and submits the request', async () => {
    const actor = await createLoggedInActor();
    const managedSystemId = await createManagedSystem();
    const objectId = randomUUID();
    const requestId = await seedRequest(actor.id, {
      managedSystemId,
      objectType: 'finding',
      objectId,
      expiration: '2030-01-01T00:00:00.000Z',
      reason: 'stored create-time reason',
    });
    const { after } = await assertSuccess(requestId, actor.id, actor.cookie);
    expect(after).toMatchObject({
      requested_managed_system_id: managedSystemId,
      requested_object_type: 'finding',
      requested_object_id: objectId,
      reason: 'stored create-time reason',
    });
    expect(after.requested_expiration?.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('trims a submitted reason and audits the stored pre-image', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id, { reason: ' create reason ' });
    const { after } = await assertSuccess(requestId, actor.id, actor.cookie, { reason: '  more  ' });
    expect(after.reason).toBe('more');
  });

  it('null clears each nullable scope and expiration field', async () => {
    const actor = await createLoggedInActor();
    const managedSystemId = await createManagedSystem();
    const objectId = randomUUID();
    const requestId = await seedRequest(actor.id, {
      managedSystemId,
      objectType: 'finding',
      objectId,
      expiration: '2030-01-01T00:00:00.000Z',
    });
    const { after } = await assertSuccess(requestId, actor.id, actor.cookie, {
      requested_managed_system_id: null,
      requested_object_type: null,
      requested_object_id: null,
      requested_expiration: null,
    });
    expect(after).toMatchObject({
      requested_managed_system_id: null,
      requested_object_type: null,
      requested_object_id: null,
      requested_expiration: null,
    });
  });

  it('rejects reason null without changing the row or writing an audit event', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id);
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, { reason: null });
    await expectRejectedUnchanged(requestId, before, response, 422, 'validation.failed');
  });

  it('rejects unknown body keys because the body schema is strict', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id);
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, { requested_capability: 'workspace.admin' });
    await expectRejectedUnchanged(requestId, before, response, 422, 'validation.failed');
  });

  it('rejects a non-UUID request id with validation.failed', async () => {
    const actor = await createLoggedInActor();
    const response = await submit('not-a-uuid', actor.cookie);
    expect(response.statusCode).toBe(422);
    const error = response.json<{ code: string; detail: { fields: Array<{ path: unknown[] }> } }>();
    expect(error.code).toBe('validation.failed');
    expect(error.detail.fields).toContainEqual(expect.objectContaining({ path: ['id'] }));
  });

  it('rejects a malformed Idempotency-Key', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id);
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, {}, 'not-a-uuid');
    await expectRejectedUnchanged(
      requestId,
      before,
      response,
      422,
      'validation.malformed_idempotency_key',
    );
  });

  it('returns the same 404 for a non-owner in the caller workspace', async () => {
    const caller = await createLoggedInActor();
    const owner = await createActor();
    const requestId = await seedRequest(owner.id);
    const before = await captureState(requestId);
    const response = await submit(requestId, caller.cookie);
    await expectRejectedUnchanged(requestId, before, response, 404, 'not_found.record');
  });

  it('returns the same 404 for a request in another workspace', async () => {
    const caller = await createLoggedInActor();
    const otherWorkspaceId = await createWorkspace();
    const requestId = await seedRequest(caller.id, { workspaceId: otherWorkspaceId });
    const before = await captureState(requestId);
    const response = await submit(requestId, caller.cookie);
    await expectRejectedUnchanged(requestId, before, response, 404, 'not_found.record');
  });

  it.each(['pending', 'approved'])('rejects a %s request as stale', async (status) => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id, { status });
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie);
    await expectRejectedUnchanged(requestId, before, response, 409, 'conflict.stale_write');
  });

  it('rejects a stored capability that is no longer in the vocabulary', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id, { capability: 'unknown.capability' });
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie);
    await expectRejectedUnchanged(requestId, before, response, 422, 'validation.unknown_capability');
  });

  it('rejects whitespace reason for a non-sensitive capability with reason field details', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id, { capability: 'voc.triage' });
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, { reason: ' ' });
    await expectRejectedUnchanged(requestId, before, response, 422, 'validation.failed');
    expect(response.json<{ detail: { fields: unknown[] } }>().detail.fields).toEqual([
      { path: ['reason'], code: 'too_small' },
    ]);
  });

  it('does not recheck capability when the stored scope is unchanged', async () => {
    const actor = await createLoggedInActor();
    const managedSystemId = await createManagedSystem();
    const requestId = await seedRequest(actor.id, { managedSystemId });
    await migrateDb.pool.query(
      `insert into permission.permission_grants
        (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'voc.triage', $3, $4)`,
      [WORKSPACE_ID, actor.id, managedSystemId, actor.id],
    );

    await assertSuccess(requestId, actor.id, actor.cookie, { reason: 'more detail' });
  });

  it('rejects an omitted reason when the stored reason is whitespace only', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id, { reason: '   ' });
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, {});
    await expectRejectedUnchanged(requestId, before, response, 422, 'validation.failed');
    expect(response.json<{ detail: { fields: unknown[] } }>().detail.fields).toEqual([
      { path: ['reason'], code: 'too_small' },
    ]);
  });

  it('uses the sensitive reason error for whitespace on a sensitive capability', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id, {
      capability: 'workspace.admin',
      reason: 'existing reason',
    });
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, { reason: ' ' });
    await expectRejectedUnchanged(
      requestId,
      before,
      response,
      422,
      'validation.sensitive_reason_required',
    );
  });

  it.each(['unknown', 'foreign-workspace'])(
    'rejects a %s managed system id before update',
    async (systemKind) => {
      const actor = await createLoggedInActor();
      let managedSystemId: string;
      if (systemKind === 'foreign-workspace') {
        const foreignWorkspaceId = await createWorkspace();
        managedSystemId = await createManagedSystem(foreignWorkspaceId);
      } else {
        managedSystemId = randomUUID();
      }
      const requestId = await seedRequest(actor.id);
      const before = await captureState(requestId);
      const response = await submit(requestId, actor.cookie, {
        requested_managed_system_id: managedSystemId,
      });
      await expectRejectedUnchanged(requestId, before, response, 422, 'validation.failed');
      expect(response.json<{ detail: { fields: unknown[] } }>().detail.fields).toEqual([
        { path: ['requested_managed_system_id'], code: 'custom' },
      ]);
    },
  );

  it('rejects a changed scope that is already granted', async () => {
    const actor = await createLoggedInActor();
    const originalSystem = await createManagedSystem();
    const grantedSystem = await createManagedSystem();
    const requestId = await seedRequest(actor.id, { managedSystemId: originalSystem });
    await migrateDb.pool.query(
      `insert into permission.permission_grants
        (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'voc.triage', $3, $4)`,
      [WORKSPACE_ID, actor.id, grantedSystem, actor.id],
    );
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, {
      requested_managed_system_id: grantedSystem,
    });
    await expectRejectedUnchanged(
      requestId,
      before,
      response,
      409,
      'conflict.capability_already_granted',
    );
  });

  it('maps an active request scope collision to permission_request_duplicate', async () => {
    const actor = await createLoggedInActor();
    const originalSystem = await createManagedSystem();
    const duplicateSystem = await createManagedSystem();
    const requestId = await seedRequest(actor.id, { managedSystemId: originalSystem });
    await seedRequest(actor.id, {
      managedSystemId: duplicateSystem,
      status: 'pending',
    });
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, {
      requested_managed_system_id: duplicateSystem,
    });
    await expectRejectedUnchanged(
      requestId,
      before,
      response,
      409,
      'conflict.permission_request_duplicate',
    );
  });

  it('replays a successful idempotent submission without locking the pending row first', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id);
    const key = randomUUID();
    const first = await assertSuccess(requestId, actor.id, actor.cookie, {}, key);
    const replay = await submit(requestId, actor.cookie, {}, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.result);
    expect(await submissionAuditCount(requestId)).toBe(1);
  });

  it('rejects reusing the same key with a different body and keeps the first result', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id);
    const key = randomUUID();
    await assertSuccess(requestId, actor.id, actor.cookie, { reason: 'first reason' }, key);
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie, { reason: 'different reason' }, key);
    await expectRejectedUnchanged(
      requestId,
      before,
      response,
      409,
      'conflict.idempotency_key_reuse',
    );
  });

  it('rejects a second successful transition when no idempotency key was sent', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id);
    await assertSuccess(requestId, actor.id, actor.cookie);
    const before = await captureState(requestId);
    const response = await submit(requestId, actor.cookie);
    await expectRejectedUnchanged(requestId, before, response, 409, 'conflict.stale_write');
  });

  it('supplement then approve grants the supplemented scope and expiration in audit order', async () => {
    const requester = await createLoggedInActor();
    const admin = await createLoggedInActor('admin');
    const originalSystem = await createManagedSystem();
    const supplementedSystem = await createManagedSystem();
    const requestId = await seedRequest(requester.id, {
      managedSystemId: originalSystem,
      expiration: '2030-01-01T00:00:00.000Z',
    });
    await seedDecisionHistory(requestId, requester.id, admin.id);
    await assertSuccess(requestId, requester.id, requester.cookie, {
      requested_managed_system_id: supplementedSystem,
      requested_expiration: '2031-05-06T07:08:09.000Z',
    });

    const approval = await app.inject({
      method: 'POST',
      url: `/permissions/requests/${requestId}/approve`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}`,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(approval.statusCode).toBe(200);

    const grants = await db.pool.query<{
      managed_system_id: string | null;
      expires_at: Date | null;
    }>(
      `select managed_system_id, expires_at from permission.permission_grants
        where workspace_id = $1 and actor_id = $2 and capability = 'voc.triage'`,
      [WORKSPACE_ID, requester.id],
    );
    expect(grants.rowCount).toBe(1);
    expect(grants.rows[0]).toMatchObject({
      managed_system_id: supplementedSystem,
      expires_at: new Date('2031-05-06T07:08:09.000Z'),
    });

    const events = await db.pool.query<{ event_type: string }>(
      'select event_type from core.audit_log where subject_id = $1 order by created_at, id',
      [requestId],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual([
      'permission_requested',
      'permission_needs_more_info',
      'permission_more_info_submitted',
      'permission_approved',
    ]);
  });

  it('approve then supplement leaves the approved row and grant unchanged', async () => {
    const requester = await createLoggedInActor();
    const admin = await createLoggedInActor('admin');
    const originalSystem = await createManagedSystem();
    const requestId = await seedRequest(requester.id, { managedSystemId: originalSystem });
    await seedDecisionHistory(requestId, requester.id, admin.id);
    const approval = await app.inject({
      method: 'POST',
      url: `/permissions/requests/${requestId}/approve`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}`,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(approval.statusCode).toBe(200);
    const before = await captureState(requestId);
    const grantsBefore = await db.pool.query(
      `select * from permission.permission_grants
        where workspace_id = $1 and actor_id = $2 and capability = 'voc.triage'`,
      [WORKSPACE_ID, requester.id],
    );
    const response = await submit(requestId, requester.cookie, {
      requested_managed_system_id: null,
    });
    await expectRejectedUnchanged(requestId, before, response, 409, 'conflict.stale_write');
    const grantsAfter = await db.pool.query(
      `select * from permission.permission_grants
        where workspace_id = $1 and actor_id = $2 and capability = 'voc.triage'`,
      [WORKSPACE_ID, requester.id],
    );
    expect(grantsAfter.rows).toEqual(grantsBefore.rows);
    expect(await submissionAuditCount(requestId)).toBe(0);
  });

  it('allows an Admin to submit more information on their own request', async () => {
    const requester = await createLoggedInActor('admin');
    const requestId = await seedRequest(requester.id, {
      capability: 'workspace.admin',
      reason: 'existing sensitive reason',
    });
    await assertSuccess(requestId, requester.id, requester.cookie);
  });

  it('does not let an Admin submit more information for another requester', async () => {
    const admin = await createLoggedInActor('admin');
    const requester = await createActor();
    const requestId = await seedRequest(requester.id);
    const before = await captureState(requestId);
    const response = await submit(requestId, admin.cookie);
    await expectRejectedUnchanged(requestId, before, response, 404, 'not_found.record');
  });
});
