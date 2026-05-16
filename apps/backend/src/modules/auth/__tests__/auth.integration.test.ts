// Integration tests for Slice 1 #3. Same skip-pattern as
// `db/__tests__/role-grants.integration.test.ts` — the suite runs only when
// the dev Postgres is up with both roles, the workspace seed in place, and
// WORKSPACE_ID exported. On bare developer machines it cleanly skips.
//
// Tests follow the issue body acceptance list verbatim:
//   1. login → /me → logout → /me (cookie round-trip)
//   2. revoked session row rejected
//   3. expired session row rejected
//   4. GET /auth/mock-login in NODE_ENV=production → 404
//   5. cross-workspace session → 403 auth.workspace_mismatch

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

describe.skipIf(!runIntegration)('Slice 1 #3 auth integration', () => {
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

  // Keep the sessions table clean between tests so revoked/expired fixtures
  // don't leak. We only delete rows we created in this suite — actors and
  // workspaces are left alone.
  beforeEach(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
    await dbHandle.pool.query(`delete from core.rate_limits`);
  });

  it('round-trip: login → /me → logout → /me 401', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/mock-login',
      headers: { 'user-agent': 'integration-test' },
      payload: { external_id: 'mock-admin-1' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = extractSessionCookie(login.headers['set-cookie']);
    expect(cookie).toBeTruthy();
    const body = login.json();
    expect(body.actor.external_id).toBe('mock-admin-1');
    expect(body.actor.role_level).toBe('admin');
    expect(body.workspace_id).toBe(WORKSPACE_ID);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().actor.external_id).toBe('mock-admin-1');

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(logout.statusCode).toBe(204);

    const meAfter = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(meAfter.statusCode).toBe(401);
    expect(meAfter.json().code).toBe('auth.session_invalid');
  });

  it('revoked session row → 401 auth.session_invalid', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/mock-login',
      headers: { 'user-agent': 'integration-test' },
      payload: { external_id: 'mock-user-1' },
    });
    const cookie = extractSessionCookie(login.headers['set-cookie']);
    expect(cookie).toBeTruthy();

    await dbHandle.pool.query('update core.sessions set revoked_at = now() where id = $1', [
      cookie,
    ]);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(me.statusCode).toBe(401);
    expect(me.json().code).toBe('auth.session_invalid');
  });

  it('expired session row → 401 auth.session_invalid', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/mock-login',
      headers: { 'user-agent': 'integration-test' },
      payload: { external_id: 'mock-user-1' },
    });
    const cookie = extractSessionCookie(login.headers['set-cookie']);
    expect(cookie).toBeTruthy();

    await dbHandle.pool.query(
      `update core.sessions set expires_at = now() - interval '1 second' where id = $1`,
      [cookie],
    );

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(me.statusCode).toBe(401);
    expect(me.json().code).toBe('auth.session_invalid');
  });

  it('cross-workspace session → 403 auth.workspace_mismatch', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/mock-login',
      headers: { 'user-agent': 'integration-test' },
      payload: { external_id: 'mock-user-1' },
    });
    const cookie = extractSessionCookie(login.headers['set-cookie']);
    expect(cookie).toBeTruthy();

    // Plant a foreign workspace UUID directly on the session row. The actor
    // is still real; only the workspace_id on the session is rewritten —
    // exactly the threat requireWorkspace is meant to catch.
    const foreignWorkspace = '99999999-9999-9999-9999-999999999999';
    // Workspaces table has FK from sessions.workspace_id, so we have to
    // insert the foreign workspace first.
    await dbHandle.pool.query(
      `insert into core.workspaces (id, name) values ($1, 'foreign') on conflict do nothing`,
      [foreignWorkspace],
    );
    await dbHandle.pool.query('update core.sessions set workspace_id = $1 where id = $2', [
      foreignWorkspace,
      cookie,
    ]);

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(me.statusCode).toBe(403);
    expect(me.json().code).toBe('auth.workspace_mismatch');

    // Cleanup: revoke the planted session and drop the foreign workspace so
    // FK constraints stay clean for the next test run.
    await dbHandle.pool.query('delete from core.sessions where id = $1', [cookie]);
    await dbHandle.pool.query('delete from core.workspaces where id = $1', [foreignWorkspace]);
  });
});

describe.skipIf(!runIntegration)('Slice 1 #3 production guard', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    // The production guard is read inside buildServer; we have to spin a
    // fresh app instance with NODE_ENV=production for this test.
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    process.env.NODE_ENV = prev ?? 'test';
  });

  beforeEach(async () => {
    await dbHandle.pool.query(`delete from core.rate_limits`);
  });

  afterAll(async () => {
    await app?.close();
    await dbHandle?.close();
  });

  it('GET /auth/mock-login returns 404 in production', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/mock-login' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  it('POST /auth/mock-login returns 404 in production', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/mock-login',
      payload: { external_id: 'mock-admin-1' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });
});
