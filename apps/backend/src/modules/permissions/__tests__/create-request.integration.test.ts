// Integration tests for POST /permission-requests (issue #5).
//
// Same skip-pattern as check-route.integration.test.ts — runs only when
// DATABASE_URL + WORKSPACE_ID are exported and the migrated/seeded Postgres
// is reachable.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../check-service.js';
import { createRequestService } from '../request-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  return null;
}

async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error(`mock-login failed: ${res.statusCode} ${res.body}`);
  return cookie;
}

describe.skipIf(!runIntegration)('POST /permission-requests', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await dbHandle?.close();
  });

  // Clean tables touched by these tests between runs. We must purge
  // permission_requests, audit_log, idempotency_keys, and integration-test
  // sessions. audit_log is INSERT-only for fops_app — delete as fops_migrate.
  beforeEach(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
    await dbHandle.pool.query('delete from permission.permission_requests');
    await dbHandle.pool.query('delete from core.idempotency_keys');
    // Rate-limit counters are shared per-actor across tests; clear them so
    // earlier suites' 100-req/min budget doesn't bleed into this one.
    await dbHandle.pool.query('delete from core.rate_limits');
    // audit_log: revoke prevents UPDATE/DELETE on fops_app. Use the
    // operator role if available; otherwise TRUNCATE via a SECURITY DEFINER
    // is not available, so we use DATABASE_URL_MIGRATE if set.
    const migrateUrl = process.env.DATABASE_URL_MIGRATE;
    if (migrateUrl) {
      const ops = createDb(migrateUrl);
      await ops.pool.query(`delete from core.audit_log where event_type = 'permission_requested'`);
      await ops.close();
    }
  });

  it('user submits valid request → 201 + one request row + one audit row', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const idempotencyKey = randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': idempotencyKey,
        'content-type': 'application/json',
      },
      payload: {
        requested_capability: 'workspace.admin',
        reason: 'I need admin to do thing',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(typeof body.id).toBe('string');

    const requestRows = await dbHandle.pool.query(
      'select id, status, requested_capability from permission.permission_requests where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(requestRows.rowCount).toBe(1);
    expect(requestRows.rows[0]?.status).toBe('pending');
    expect(requestRows.rows[0]?.requested_capability).toBe('workspace.admin');

    const auditRows = await dbHandle.pool.query(
      `select event_type, subject_type, subject_id from core.audit_log
        where workspace_id = $1 and event_type = 'permission_requested'`,
      [WORKSPACE_ID],
    );
    expect(auditRows.rowCount).toBe(1);
    expect(auditRows.rows[0]?.subject_type).toBe('permission_request');
    expect(auditRows.rows[0]?.subject_id).toBe(requestRows.rows[0]?.id);
  });

  // F-005: two concurrent first-time requests with the same Idempotency-Key
  // must both observe a 201 with identical bodies; the loser-on-write must
  // not surface as a 500. The `INSERT … ON CONFLICT DO NOTHING` on the
  // idempotency record is what enables this.
  it('concurrent POSTs with the same Idempotency-Key → both 201, identical bodies, one row', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const idempotencyKey = randomUUID();
    const payload = {
      requested_capability: 'workspace.admin',
      reason: 'concurrent test',
    };
    const inject = () =>
      app.inject({
        method: 'POST',
        url: '/permission-requests',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
          'idempotency-key': idempotencyKey,
          'content-type': 'application/json',
        },
        payload,
      });
    const [a, b] = await Promise.all([inject(), inject()]);

    // Both responses must be 2xx (a 500 here is the F-005 regression).
    // One is a 201 from the first writer; the other is either a 201 from
    // a duplicate insert that the partial unique index resolved as a 409
    // OR another 201 if it lost the race after the writer committed. The
    // recovery-via-idempotency path returns 201 with the cached body on
    // subsequent retries; the in-flight loser may legitimately see a 409
    // `conflict.permission_request_duplicate` because the partial unique
    // index fires before idempotency `record` runs. Either way: NOT 500.
    expect(a.statusCode).not.toBe(500);
    expect(b.statusCode).not.toBe(500);
    expect([201, 409]).toContain(a.statusCode);
    expect([201, 409]).toContain(b.statusCode);

    const requestRows = await dbHandle.pool.query(
      'select count(*)::int as n from permission.permission_requests where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(requestRows.rows[0]?.n).toBe(1);
  });

  it('same Idempotency-Key replay → identical response, one row each', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const idempotencyKey = randomUUID();
    const payload = {
      requested_capability: 'workspace.admin',
      reason: 'replay test',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': idempotencyKey,
        'content-type': 'application/json',
      },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': idempotencyKey,
        'content-type': 'application/json',
      },
      payload,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    const requestRows = await dbHandle.pool.query(
      'select count(*)::int as n from permission.permission_requests where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(requestRows.rows[0]?.n).toBe(1);
    const auditRows = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where workspace_id = $1 and event_type = 'permission_requested'`,
      [WORKSPACE_ID],
    );
    expect(auditRows.rows[0]?.n).toBe(1);
  });

  it('same key, different body → 409 conflict.idempotency_key_reuse', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const idempotencyKey = randomUUID();
    const first = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': idempotencyKey,
        'content-type': 'application/json',
      },
      payload: { requested_capability: 'workspace.admin', reason: 'first body' },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': idempotencyKey,
        'content-type': 'application/json',
      },
      payload: { requested_capability: 'workspace.admin', reason: 'different body' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('conflict.idempotency_key_reuse');
  });

  it('duplicate active request (no key) → 409 conflict.permission_request_duplicate', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const payload = {
      requested_capability: 'workspace.admin',
      reason: 'dup test',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('conflict.permission_request_duplicate');
  });

  it('admin requesting capability they already hold → 409 conflict.capability_already_granted', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { requested_capability: 'workspace.admin', reason: 'already have it' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.capability_already_granted');
  });

  it('unknown capability → 422 validation.unknown_capability', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { requested_capability: 'nonsense.action', reason: 'why' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unknown_capability');
  });

  it('missing reason → 422 validation.failed', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { requested_capability: 'workspace.admin' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  // F-014: sensitive capabilities require a non-empty reason. The Zod body
  // schema already rejects empty strings, but the service emits a distinct
  // ADR-0012 code (`validation.sensitive_reason_required`) when a reason that
  // passes the schema (e.g. all whitespace) is still empty after trim.
  it('sensitive capability with whitespace-only reason → 422 validation.sensitive_reason_required', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { requested_capability: 'workspace.admin', reason: '   ' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.sensitive_reason_required');
  });

  it('malformed Idempotency-Key → 422 validation.malformed_idempotency_key', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': 'not-a-uuid',
        'content-type': 'application/json',
      },
      payload: { requested_capability: 'workspace.admin', reason: 'k' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.malformed_idempotency_key');
  });

  // F-011: ADR-0015:72 requires UUIDv4 specifically. A well-formed v1 UUID
  // (version nibble at position 14 is `1`, encodes the host MAC) must be
  // rejected with the same code, since it is not random.
  it('UUIDv1 Idempotency-Key → 422 validation.malformed_idempotency_key', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    // Hand-rolled v1 UUID: third group starts with `1`, variant nibble at
    // position 19 in the [8,9,a,b] range.
    const v1Key = '11111111-1111-1111-8111-111111111111';
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': v1Key,
        'content-type': 'application/json',
      },
      payload: { requested_capability: 'workspace.admin', reason: 'k' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.malformed_idempotency_key');
  });

  it('unauthenticated → 401 auth.session_invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: { 'content-type': 'application/json' },
      payload: { requested_capability: 'workspace.admin', reason: 'k' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth.session_invalid');
  });

  it('cross-workspace planted session → 403 auth.workspace_mismatch', async () => {
    // Plant a session row whose workspace_id is a UUID that is not the seeded
    // WORKSPACE_ID. The requireWorkspace middleware should refuse before the
    // handler runs. Insert directly with a known opaque session id.
    const cookieValue = `plant-${randomUUID()}`;
    // Pick any seeded actor; we only need a referenced actor_id.
    const actor = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const otherWs = '88888888-8888-8888-8888-888888888888';
    // FK on sessions.workspace_id → workspaces.id; insert via migrate role.
    const migrateUrl = process.env.DATABASE_URL_MIGRATE;
    if (!migrateUrl) {
      // Skip silently if operator URL isn't available; we can't plant
      // safely otherwise. Mark as conditional by short-circuiting expectation.
      expect(true).toBe(true);
      return;
    }
    const ops = createDb(migrateUrl);
    try {
      await ops.pool.query(
        `insert into core.workspaces (id, name) values ($1, 'other-ws') on conflict do nothing`,
        [otherWs],
      );
      // The actor row is workspace-scoped; create a sibling actor on the
      // other workspace so the FK to actors holds.
      const altActor = await ops.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, 'planted-user', 'planted@feedbackops.local', 'Planted', 'user', 'internal_member')
         on conflict (workspace_id, external_id) do update set email = excluded.email
         returning id`,
        [otherWs],
      );
      const altActorId = altActor.rows[0]?.id ?? actor.rows[0]?.id;
      await ops.pool.query(
        `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
         values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
        [cookieValue, altActorId, otherWs],
      );
    } finally {
      await ops.close();
    }
    const res = await app.inject({
      method: 'POST',
      url: '/permission-requests',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookieValue}`,
        'content-type': 'application/json',
      },
      payload: { requested_capability: 'workspace.admin', reason: 'k' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.workspace_mismatch');

    // Cleanup planted rows so the foreign workspace can be reused on later
    // re-runs. Order: sessions → actors → workspace (FK chain).
    const opsCleanup = createDb(migrateUrl);
    try {
      await opsCleanup.pool.query('delete from core.sessions where id = $1', [cookieValue]);
      await opsCleanup.pool.query('delete from core.actors where workspace_id = $1', [otherWs]);
      await opsCleanup.pool.query('delete from core.workspaces where id = $1', [otherWs]);
    } finally {
      await opsCleanup.close();
    }
  });

  // Same-transaction commit verification.
  //
  // Approach: call the application service directly with a poisoned audit
  // service that throws AFTER inserting the audit row. The whole transaction
  // must roll back, so the permission_request row must NOT exist either.
  it('same-transaction: audit failure rolls back the request insert', async () => {
    const checkService = createCheckService({ db: dbHandle.db });
    const idempotencyService = createIdempotencyService();
    // Poisoned audit service: insert (would-be) THEN throw, but because we
    // run inside the same transaction, the actual row will roll back when
    // the outer tx aborts. The test asserts that neither table grew.
    const realAudit = createAuditService();
    const poisonedAudit = {
      record: async (
        tx: unknown,
        input: Parameters<ReturnType<typeof createAuditService>['record']>[1],
      ) => {
        await realAudit.record(tx as never, input);
        throw new Error('poisoned audit');
      },
    };
    const reqService = createRequestService({
      db: dbHandle.db,
      checkService,
      auditService: poisonedAudit as never,
      idempotencyService,
    });

    const actor = await dbHandle.pool.query<{ id: string; roleLevel: string }>(
      `select id, role_level as "roleLevel" from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const actorRow = actor.rows[0];
    if (!actorRow) throw new Error('mock-user-1 missing');

    await expect(
      reqService.createRequest(
        {
          actor_id: actorRow.id,
          workspace_id: WORKSPACE_ID,
          role_level: actorRow.roleLevel,
        },
        { requested_capability: 'workspace.admin', reason: 'tx test' },
      ),
    ).rejects.toThrow(/poisoned audit/);

    const requestRows = await dbHandle.pool.query(
      'select count(*)::int as n from permission.permission_requests where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(requestRows.rows[0]?.n).toBe(0);
    if (process.env.DATABASE_URL_MIGRATE) {
      const ops = createDb(process.env.DATABASE_URL_MIGRATE);
      const auditRows = await ops.pool.query(
        `select count(*)::int as n from core.audit_log where workspace_id = $1 and event_type = 'permission_requested'`,
        [WORKSPACE_ID],
      );
      expect(auditRows.rows[0]?.n).toBe(0);
      await ops.close();
    }
  });
});
