// Integration tests for GET /permission-requests/mine (issue #5).

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

describe.skipIf(!runIntegration)('GET /permission-requests/mine', () => {
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
    await dbHandle.pool.query('delete from permission.permission_requests');
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
  });

  it("returns the caller's pending row; excludes other actors' rows", async () => {
    // Seed two rows: one for mock-user-1, one for mock-admin-1.
    const actorRows = await dbHandle.pool.query<{ external_id: string; id: string }>(
      'select external_id, id from core.actors where workspace_id = $1',
      [WORKSPACE_ID],
    );
    const userActor = actorRows.rows.find((r) => r.external_id === 'mock-user-1');
    const adminActor = actorRows.rows.find((r) => r.external_id === 'mock-admin-1');
    if (!userActor || !adminActor) throw new Error('seeded actors missing');

    await dbHandle.pool.query(
      `insert into permission.permission_requests
        (workspace_id, requester_actor_id, requested_capability, reason, status)
       values
        ($1, $2, 'workspace.admin', 'user wants admin', 'pending'),
        ($1, $3, 'workspace.read', 'admin extra', 'pending')`,
      [WORKSPACE_ID, userActor.id, adminActor.id],
    );

    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/permission-requests/mine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].requested_capability).toBe('workspace.admin');
    expect(body.requests[0].status).toBe('pending');
  });

  it('returns empty array when actor has none', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/permission-requests/mine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().requests).toEqual([]);
  });

  it('includes needs_more_info; excludes approved/rejected/expired/revoked', async () => {
    const userActor = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const uid = userActor.rows[0]?.id;
    if (!uid) throw new Error('mock-user-1 missing');
    // Different scope tuples to avoid the partial-unique collision: the
    // partial index only fires on rows in (pending,needs_more_info), so the
    // approved/rejected/expired/revoked rows can repeat the capability.
    // For the two active rows we pick different source_action_id values so
    // the COALESCE tuple differs.
    await dbHandle.pool.query(
      `insert into permission.permission_requests
        (workspace_id, requester_actor_id, requested_capability, reason, status, source_action_id)
       values
        ($1, $2, 'workspace.admin', 'p', 'pending', 'a1'),
        ($1, $2, 'workspace.admin', 'n', 'needs_more_info', 'a2'),
        ($1, $2, 'workspace.admin', 'a', 'approved', null),
        ($1, $2, 'workspace.admin', 'r', 'rejected', null),
        ($1, $2, 'workspace.admin', 'e', 'expired', null),
        ($1, $2, 'workspace.admin', 'v', 'revoked', null)`,
      [WORKSPACE_ID, uid],
    );

    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/permission-requests/mine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const statuses = body.requests.map((r: { status: string }) => r.status).sort();
    expect(statuses).toEqual(['needs_more_info', 'pending']);
  });
});
