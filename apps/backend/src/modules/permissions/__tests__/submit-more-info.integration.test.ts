import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  revision: number;
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

  // The new stale-review cases send several sensitive-tier decisions; reset the
  // per-actor buckets so earlier cases cannot push them into 429.
  beforeEach(async () => {
    await migrateDb.pool.query('delete from core.rate_limits');
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
      await migrateDb.pool.query(
        'delete from core.idempotency_keys where actor_id = any($1::uuid[])',
        [actorIds],
      );
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
        input.managedSystemId !== undefined
          ? input.managedSystemId
          : input.capability === 'survey.export' ||
              input.capability === 'workspace.admin' ||
              input.capability === 'unknown.capability'
            ? null
            : await createManagedSystem(),
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
      payload: { expected_revision: 1, ...body },
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
      revision: before.revision + 1,
      updated_at: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(result.updated_at))).toBe(false);

    const after = await readRequest(requestId);
    expect(after.revision).toBe(before.revision + 1);
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
      previous_revision: before.revision,
      revision: after.revision,
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
    const requestId = await seedRequest(actor.id, {
      managedSystemId,
      expiration: '2030-01-01T00:00:00.000Z',
      reason: 'stored create-time reason',
    });
    const { after } = await assertSuccess(requestId, actor.id, actor.cookie);
    expect(after).toMatchObject({
      requested_managed_system_id: managedSystemId,
      requested_object_type: null,
      requested_object_id: null,
      reason: 'stored create-time reason',
    });
    expect(after.requested_expiration?.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('trims a submitted reason and audits the stored pre-image', async () => {
    const actor = await createLoggedInActor();
    const requestId = await seedRequest(actor.id, { reason: ' create reason ' });
    const { after } = await assertSuccess(requestId, actor.id, actor.cookie, {
      reason: '  more  ',
    });
    expect(after.reason).toBe('more');
  });

  it('null clears supported workspace export scope and expiration', async () => {
    const actor = await createLoggedInActor();
    const managedSystemId = await createManagedSystem();
    const requestId = await seedRequest(actor.id, {
      managedSystemId,
      capability: 'survey.export',
      expiration: '2030-01-01T00:00:00.000Z',
    });
    const { after } = await assertSuccess(requestId, actor.id, actor.cookie, {
      requested_managed_system_id: null,
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
    const response = await submit(requestId, actor.cookie, {
      requested_capability: 'workspace.admin',
    });
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
    await expectRejectedUnchanged(
      requestId,
      before,
      response,
      422,
      'validation.unknown_capability',
    );
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
      payload: { expected_revision: 2 },
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
      payload: { expected_revision: 1 },
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
      capability: 'survey.export',
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
  function mutate(
    id: string,
    cookie: string,
    action:
      | 'edit'
      | 'cancel'
      | 'submit-more-info'
      | 'approve'
      | 'reject'
      | 'deny'
      | 'need-more-info',
    payload: Record<string, unknown>,
    key?: string,
  ) {
    return app.inject({
      method: action === 'edit' ? 'PATCH' : 'POST',
      url:
        action === 'edit'
          ? `/permission-requests/${id}`
          : ['cancel', 'submit-more-info'].includes(action)
            ? `/permission-requests/${id}/${action}`
            : `/permissions/requests/${id}/${action}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        ...(key ? { 'idempotency-key': key } : {}),
      },
      payload,
    });
  }

  async function allEffects(id: string, ...actors: string[]) {
    return {
      row: await readRequest(id),
      audits: (
        await db.pool.query('select * from core.audit_log where subject_id = $1 order by id', [id])
      ).rows,
      grants: (
        await db.pool.query(
          'select * from permission.permission_grants where actor_id = any($1::uuid[]) order by id',
          [actors],
        )
      ).rows,
      denies: (
        await db.pool.query(
          'select * from permission.permission_denies where actor_id = any($1::uuid[]) order by id',
          [actors],
        )
      ).rows,
      keys: (
        await db.pool.query(
          'select * from core.idempotency_keys where actor_id = any($1::uuid[]) order by key',
          [actors],
        )
      ).rows,
    };
  }

  it.each(['edit', 'cancel'] as const)(
    '%s preserves uniform owner/workspace 404, even for an Admin',
    async (action) => {
      const caller = await createLoggedInActor('admin');
      const owner = await createLoggedInActor();
      const foreignWorkspace = await createWorkspace();
      const ownWorkspaceId = await seedRequest(owner.id, { status: 'pending' });
      const foreignId = await seedRequest(owner.id, {
        workspaceId: foreignWorkspace,
        status: 'pending',
        capability: 'survey.export',
      });
      for (const id of [ownWorkspaceId, foreignId, randomUUID()]) {
        const response = await mutate(
          id,
          caller.cookie,
          action,
          { expected_revision: 1 },
          randomUUID(),
        );
        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({ code: 'not_found.record' });
        expect(response.json()).not.toHaveProperty('detail.current_revision');
      }
      expect((await readRequest(ownWorkspaceId)).revision).toBe(1);
      expect((await readRequest(foreignId)).revision).toBe(1);
    },
  );

  it.each(['pending', 'needs_more_info'])(
    'withdraws %s once, preserves history, and frees the exact open slot',
    async (status) => {
      const actor = await createLoggedInActor();
      const system = await createManagedSystem();
      const id = await seedRequest(actor.id, { managedSystemId: system, status });
      const key = randomUUID();
      const body = { expected_revision: 1, reason: '  obsolete ask  ' };
      const before = await allEffects(id, actor.id);
      const response = await mutate(id, actor.cookie, 'cancel', body, key);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id, status: 'cancelled', revision: 2 });
      const after = await allEffects(id, actor.id);
      expect(after.grants).toEqual(before.grants);
      expect(after.denies).toEqual(before.denies);
      expect(after.audits).toHaveLength(before.audits.length + 1);
      expect(after.audits.at(-1)).toMatchObject({
        event_type: 'permission_request_cancelled',
        detail: {
          previous_status: status,
          previous_revision: 1,
          revision: 2,
          reason: 'obsolete ask',
        },
      });
      expect((await mutate(id, actor.cookie, 'cancel', body, key)).json()).toEqual(response.json());
      expect(
        (await mutate(id, actor.cookie, 'cancel', { ...body, reason: 'different' }, key)).json(),
      ).toMatchObject({ code: 'conflict.idempotency_key_reuse' });
      const fresh = await app.inject({
        method: 'POST',
        url: '/permission-requests',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${actor.cookie}` },
        payload: {
          requested_capability: 'voc.triage',
          requested_managed_system_id: system,
          reason: 'new need',
        },
      });
      expect(fresh.statusCode).toBe(201);
      expect(fresh.json().id).not.toBe(id);
      expect((await readRequest(id)).status).toBe('cancelled');
    },
  );

  it('edits the same pending ID with immutable provenance and complete pre/post audit', async () => {
    const actor = await createLoggedInActor();
    const id = await seedRequest(actor.id, {
      status: 'pending',
      reason: 'old reason',
      expiration: '2030-01-01T00:00:00.000Z',
    });
    const before = await readRequest(id);
    const system = await createManagedSystem();
    const body = {
      expected_revision: before.revision,
      reason: '  corrected  ',
      requested_managed_system_id: system,
      requested_expiration: null,
    };
    const key = randomUUID();
    const response = await mutate(id, actor.cookie, 'edit', body, key);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id, status: 'pending', revision: 2 });
    const after = await readRequest(id);
    expect(after).toMatchObject({
      requester_actor_id: before.requester_actor_id,
      requested_capability: before.requested_capability,
      source_object_type: before.source_object_type,
      source_object_id: before.source_object_id,
      source_action_id: before.source_action_id,
      return_route_intent: before.return_route_intent,
      reason: 'corrected',
      requested_managed_system_id: system,
      requested_expiration: null,
    });
    const audit = await db.pool.query(
      'select detail from core.audit_log where subject_id = $1 and event_type = $2',
      [id, 'permission_request_updated'],
    );
    expect(audit.rows[0]?.detail).toMatchObject({
      previous_revision: 1,
      revision: 2,
      previous: {
        reason: 'old reason',
        managed_system_id: before.requested_managed_system_id,
        requested_expiration: '2030-01-01T00:00:00.000Z',
      },
      resulting: { reason: 'corrected', managed_system_id: system, requested_expiration: null },
    });
    const state = await allEffects(id, actor.id);
    expect((await mutate(id, actor.cookie, 'edit', body, key)).json()).toEqual(response.json());
    expect(
      (await mutate(id, actor.cookie, 'edit', { ...body, reason: 'different' }, key)).json(),
    ).toMatchObject({ code: 'conflict.idempotency_key_reuse' });
    expect(await allEffects(id, actor.id)).toEqual(state);
  });

  it.each(['edit', 'submit-more-info'] as const)(
    '%s first invalidates every previously reviewed Admin action',
    async (mutation) => {
      const requester = await createLoggedInActor();
      for (const action of ['approve', 'reject', 'deny', 'need-more-info'] as const) {
        const admin = await createLoggedInActor('admin');
        const id = await seedRequest(requester.id, {
          status: mutation === 'edit' ? 'pending' : 'needs_more_info',
        });
        const r = (await readRequest(id)).revision;
        const changed = await mutate(id, requester.cookie, mutation, {
          expected_revision: r,
          reason: 'review these new values',
        });
        expect(changed.statusCode).toBe(200);
        expect(changed.json().revision).toBe(r + 1);
        const before = await allEffects(id, requester.id, admin.id);
        const body =
          action === 'need-more-info' ? { note: 'question' } : { reason: 'decision reason' };
        const stale = await mutate(
          id,
          admin.cookie,
          action,
          { expected_revision: r, ...body },
          randomUUID(),
        );
        expect(stale.statusCode).toBe(409);
        expect(stale.json()).toMatchObject({
          code: 'conflict.stale_write',
          detail: { current_revision: r + 1 },
        });
        expect(await allEffects(id, requester.id, admin.id)).toEqual(before);
        const fresh = await mutate(
          id,
          admin.cookie,
          action,
          { expected_revision: r + 1, ...body },
          randomUUID(),
        );
        expect(fresh.statusCode).toBe(200);
        expect(fresh.json().revision).toBe(r + 2);
      }
    },
  );

  it('repeated need-more-info advances revision while status remains unchanged', async () => {
    const requester = await createLoggedInActor();
    const admin = await createLoggedInActor('admin');
    const id = await seedRequest(requester.id);
    const r = (await readRequest(id)).revision;
    expect(
      (
        await mutate(id, admin.cookie, 'need-more-info', { expected_revision: r, note: 'first' })
      ).json(),
    ).toMatchObject({ status: 'needs_more_info', revision: r + 1 });
    const before = await allEffects(id, requester.id, admin.id);
    expect(
      (await mutate(id, admin.cookie, 'approve', { expected_revision: r })).json(),
    ).toMatchObject({ code: 'conflict.stale_write', detail: { current_revision: r + 1 } });
    expect(await allEffects(id, requester.id, admin.id)).toEqual(before);
    expect(
      (
        await mutate(id, admin.cookie, 'need-more-info', {
          expected_revision: r + 1,
          note: 'second',
        })
      ).json(),
    ).toMatchObject({ status: 'needs_more_info', revision: r + 2 });
  });

  it.each(['approve', 'cancel'] as const)(
    '%s first makes later edit and supplement stale without writes',
    async (winner) => {
      const requester = await createLoggedInActor();
      const admin = await createLoggedInActor('admin');
      const id = await seedRequest(requester.id, { status: 'pending' });
      const r = (await readRequest(id)).revision;
      expect(
        (
          await mutate(id, winner === 'cancel' ? requester.cookie : admin.cookie, winner, {
            expected_revision: r,
          })
        ).statusCode,
      ).toBe(200);
      const before = await allEffects(id, requester.id, admin.id);
      for (const action of ['edit', 'submit-more-info'] as const) {
        const result = await mutate(
          id,
          requester.cookie,
          action,
          { expected_revision: r, reason: 'too late' },
          randomUUID(),
        );
        expect(result.statusCode).toBe(409);
        expect(result.json()).toMatchObject({ detail: { current_revision: r + 1 } });
        expect(await allEffects(id, requester.id, admin.id)).toEqual(before);
      }
    },
  );

  it.each(['edit', 'submit-more-info', 'approve'] as const)(
    '%s rejects planted legacy object scope without stripping history',
    async (action) => {
      const requester = await createLoggedInActor();
      const admin = await createLoggedInActor('admin');
      const id = await seedRequest(requester.id, {
        status: action === 'submit-more-info' ? 'needs_more_info' : 'pending',
        objectType: 'finding',
        objectId: randomUUID(),
      });
      const before = await allEffects(id, requester.id, admin.id);
      const result = await mutate(
        id,
        action === 'approve' ? admin.cookie : requester.cookie,
        action,
        { expected_revision: 1 },
      );
      expect(result.statusCode).toBe(422);
      expect(await allEffects(id, requester.id, admin.id)).toEqual(before);
      expect(
        (await mutate(id, requester.cookie, 'cancel', { expected_revision: 1 })).statusCode,
      ).toBe(200);
      expect((await readRequest(id)).requested_object_id).toBe(before.row.requested_object_id);
    },
  );

  it.each(['edit', 'submit-more-info'] as const)(
    '%s rejects archived scope, expired duration, and immutable keys without writes',
    async (action) => {
      const requester = await createLoggedInActor();
      const id = await seedRequest(requester.id, {
        status: action === 'edit' ? 'pending' : 'needs_more_info',
      });
      const archived = await createManagedSystem();
      await migrateDb.pool.query(
        'update core.managed_systems set archived_at = now() where id = $1',
        [archived],
      );
      for (const body of [
        { requested_managed_system_id: archived },
        { requested_managed_system_id: null },
        { requested_expiration: '2020-01-01T00:00:00.000Z' },
        { requested_capability: 'survey.export' },
        { source_action_id: 'changed' },
        { requested_object_id: null },
      ]) {
        const before = await allEffects(id, requester.id);
        expect(
          (
            await mutate(
              id,
              requester.cookie,
              action,
              { expected_revision: 1, ...body },
              randomUUID(),
            )
          ).statusCode,
        ).toBe(422);
        expect(await allEffects(id, requester.id)).toEqual(before);
      }
    },
  );

  it.each([
    'edit',
    'cancel',
    'submit-more-info',
    'approve',
    'reject',
    'deny',
    'need-more-info',
  ] as const)('%s validates missing/invalid revision before mutation', async (action) => {
    const requester = await createLoggedInActor();
    const admin = await createLoggedInActor('admin');
    const id = await seedRequest(requester.id, {
      status: action === 'edit' ? 'pending' : 'needs_more_info',
    });
    const before = await allEffects(id, requester.id, admin.id);
    for (const expected_revision of [undefined, 0, -1, 1.5, '1']) {
      const result = await mutate(
        id,
        ['edit', 'cancel', 'submit-more-info'].includes(action) ? requester.cookie : admin.cookie,
        action,
        {
          ...(expected_revision === undefined ? {} : { expected_revision }),
          reason: 'reason',
          note: 'question',
        },
      );
      expect(result.statusCode).toBe(422);
      expect(result.json().detail.fields).toContainEqual(
        expect.objectContaining({ path: ['expected_revision'] }),
      );
    }
    expect(await allEffects(id, requester.id, admin.id)).toEqual(before);
  });

  it.each(['edit', 'cancel', 'submit-more-info', 'approve', 'deny'] as const)(
    '%s audit failure rolls back request, access, audit, and idempotency writes',
    async (action) => {
      const requester = await createLoggedInActor();
      const admin = await createLoggedInActor('admin');
      const id = await seedRequest(requester.id, {
        status: action === 'submit-more-info' ? 'needs_more_info' : 'pending',
      });
      const before = await allEffects(id, requester.id, admin.id);
      // Scoped failure injection follows the existing Task audit rollback pattern.
      // Only this request fails; unrelated suites' audit writes are unaffected.
      await migrateDb.pool.query(`
      create function core.fail_w1080_audit() returns trigger language plpgsql as $$
      begin
        if NEW.subject_id = '${id}'::uuid then raise exception 'forced W1080 audit failure'; end if;
        return NEW;
      end; $$;
      create trigger fail_w1080_audit before insert on core.audit_log
      for each row execute function core.fail_w1080_audit();
    `);
      try {
        const result = await mutate(
          id,
          ['approve', 'deny'].includes(action) ? admin.cookie : requester.cookie,
          action,
          { expected_revision: 1, reason: 'audit rollback' },
          randomUUID(),
        );
        expect(result.statusCode).toBe(500);
        expect(await allEffects(id, requester.id, admin.id)).toEqual(before);
      } finally {
        await migrateDb.pool.query(
          'drop trigger fail_w1080_audit on core.audit_log; drop function core.fail_w1080_audit();',
        );
      }
    },
  );

  it.each(['edit', 'submit-more-info'] as const)(
    '%s rejects exact scope collision and already-held scope atomically',
    async (action) => {
      const requester = await createLoggedInActor();
      const original = await createManagedSystem();
      const duplicate = await createManagedSystem();
      const granted = await createManagedSystem();
      const id = await seedRequest(requester.id, {
        status: action === 'edit' ? 'pending' : 'needs_more_info',
        managedSystemId: original,
      });
      await seedRequest(requester.id, { status: 'pending', managedSystemId: duplicate });
      await migrateDb.pool.query(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'voc.triage', $3, $2)`,
        [WORKSPACE_ID, requester.id, granted],
      );
      const before = await allEffects(id, requester.id);
      for (const [scope, code] of [
        [duplicate, 'conflict.permission_request_duplicate'],
        [granted, 'conflict.capability_already_granted'],
      ]) {
        const result = await mutate(
          id,
          requester.cookie,
          action,
          { expected_revision: 1, requested_managed_system_id: scope },
          randomUUID(),
        );
        expect(result.statusCode).toBe(409);
        expect(result.json().code).toBe(code);
        expect(await allEffects(id, requester.id)).toEqual(before);
      }
    },
  );

  it('concurrent edit and approval serialize one winning revision', async () => {
    const requester = await createLoggedInActor();
    const admin = await createLoggedInActor('admin');
    const id = await seedRequest(requester.id, { status: 'pending', reason: 'original' });
    const r = (await readRequest(id)).revision;
    const results = await Promise.all([
      mutate(
        id,
        requester.cookie,
        'edit',
        { expected_revision: r, reason: 'changed' },
        randomUUID(),
      ),
      mutate(id, admin.cookie, 'approve', { expected_revision: r }, randomUUID()),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.statusCode === 409)?.json()).toMatchObject({
      code: 'conflict.stale_write',
      detail: { current_revision: r + 1 },
    });
    const state = await allEffects(id, requester.id, admin.id);
    expect(state.row.revision).toBe(r + 1);
    expect(state.audits).toHaveLength(1);
    expect(state.keys).toHaveLength(1);
    expect(state.grants).toHaveLength(state.row.status === 'approved' ? 1 : 0);
    expect(state.denies).toHaveLength(0);
  });

  it('Admin capability gate still precedes replay of a successful decision', async () => {
    const requester = await createLoggedInActor();
    const admin = await createLoggedInActor('admin');
    const id = await seedRequest(requester.id, { status: 'pending' });
    const key = randomUUID();
    const body = { expected_revision: 1, reason: 'reject' };
    expect((await mutate(id, admin.cookie, 'reject', body, key)).statusCode).toBe(200);
    await migrateDb.pool.query(
      `insert into permission.permission_denies (workspace_id, actor_id, capability, reason, created_by_actor_id) values ($1, $2, 'workspace.admin', 'admin access removed', $2)`,
      [WORKSPACE_ID, admin.id],
    );
    const before = await allEffects(id, requester.id, admin.id);
    const replay = await mutate(id, admin.cookie, 'reject', body, key);
    expect(replay.statusCode).toBe(403);
    expect(replay.json()).toMatchObject({ code: 'permission.denied' });
    expect(await allEffects(id, requester.id, admin.id)).toEqual(before);
  });
  it('keeps legacy object history visible to its owner and permits rejection', async () => {
    const requester = await createLoggedInActor();
    const admin = await createLoggedInActor('admin');
    const objectId = randomUUID();
    const id = await seedRequest(requester.id, {
      status: 'pending',
      objectType: 'finding',
      objectId,
    });
    const mine = await app.inject({
      method: 'GET',
      url: '/permission-requests/mine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${requester.cookie}` },
    });
    expect(mine.json().requests).toContainEqual(
      expect.objectContaining({
        id,
        requested_object_type: 'finding',
        requested_object_id: objectId,
        revision: 1,
      }),
    );
    expect(
      (
        await mutate(id, admin.cookie, 'reject', {
          expected_revision: 1,
          reason: 'unsupported legacy scope',
        })
      ).statusCode,
    ).toBe(200);
    const state = await allEffects(id, requester.id, admin.id);
    expect(state.row).toMatchObject({
      status: 'rejected',
      revision: 2,
      requested_object_type: 'finding',
      requested_object_id: objectId,
    });
    expect(state.grants).toEqual([]);
    expect(state.denies).toEqual([]);
  });
});
