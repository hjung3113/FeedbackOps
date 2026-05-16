// Integration tests for GET /me/permissions/check (issue #4 acceptance).
//
// Same skip-pattern as modules/auth/__tests__/auth.integration.test.ts.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

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

describe.skipIf(!runIntegration)('GET /me/permissions/check', () => {
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

  beforeEach(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
    await dbHandle.pool.query(`delete from core.rate_limits`);
    // Earlier suites may have left pending permission_requests rows that
    // flip this suite's `request_access` expectation to `pending_request`.
    await dbHandle.pool.query(`delete from permission.permission_requests`);
  });

  it('admin + workspace.admin → state=approved', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('approved');
    expect(body.decision).toEqual({ allow: true, via: 'role' });
  });

  it('user + workspace.admin → state=request_access', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('request_access');
    expect(body.decision.allow).toBe(false);
    expect(body.decision.reason).toBe('no_grant');
    expect(body.decision.requestable).toEqual([{ workspace_id: WORKSPACE_ID }]);
  });

  it('user + workspace.read → state=approved', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.read',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toBe('approved');
  });

  it('unauthenticated → 401 auth.session_invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth.session_invalid');
  });

  // F-004: open-request lookup matches the requested managed_system_id
  // (or null) tuple, not capability alone. A user with a workspace-scoped
  // pending request should still see `request_access` when probing a
  // different MS scope.
  it('user with workspace-scoped pending request → MS-scoped probe still shows request_access', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    // Seed a pending workspace-level (null MS) request directly via SQL so
    // we don't rely on the POST path (under separate test).
    const actor = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const actorId = actor.rows[0]?.id;
    if (!actorId) throw new Error('mock-user-1 missing');
    await dbHandle.pool.query(
      `insert into permission.permission_requests
         (workspace_id, requester_actor_id, requested_capability, requested_managed_system_id, reason, status)
       values ($1, $2, 'workspace.admin', null, 'seed test', 'pending')`,
      [WORKSPACE_ID, actorId],
    );
    // Probing the same capability scoped to a CONCRETE MS id should NOT see
    // the workspace-level open request — F-004 fix asserts this.
    const otherMs = '22222222-2222-2222-2222-222222222222';
    const res = await app.inject({
      method: 'GET',
      url: `/me/permissions/check?capability=workspace.admin&managed_system_id=${otherMs}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toBe('request_access');

    // Whereas a workspace-level (no MS) probe SHOULD match → pending_request.
    const res2 = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=workspace.admin',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().state).toBe('pending_request');
  });

  it('unknown capability → validation.unknown_capability envelope', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: '/me/permissions/check?capability=nonsense.action',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    // ADR-0012 prefix table maps validation.* → 422. The envelope code is
    // the load-bearing assertion; the status follows the locked table.
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unknown_capability');
  });
});
