// GET /vocs smoke integration tests — Slice 3 #15 C3 wiring verification.
//
// Three lightweight cases prove the routes are wired correctly:
//   1. GET /vocs?view=inbox  → 200 + empty items array (no VOCs seeded).
//   2. GET /vocs/:id         → 404 for non-existent UUID.
//   3. GET /vocs/:id/conversation without cursor → 422 validation error.
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without these the suite is skipped
// (same gate as create-voc.integration.test.ts).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

// ── helpers ──────────────────────────────────────────────────────────────────
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

describe.skipIf(!runIntegration)('GET /vocs smoke (#15 C3)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
  });

  afterAll(async () => {
    // Minimal cleanup: only sessions from this test run.
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
    await dbHandle.pool.query('delete from core.rate_limits');
    await app?.close();
    await dbHandle?.close();
  });

  it('GET /vocs?view=inbox → 200 with empty items (no VOCs seeded)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: unknown[]; page: { has_more: boolean } }>();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toMatchObject({ has_more: false });
  });

  it('GET /vocs/:id → 404 for non-existent UUID', async () => {
    const nonExistentId = randomUUID();
    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${nonExistentId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('not_found.record');
  });

  it('GET /vocs/:id/conversation without cursor → 404 for non-existent VOC (cursor is optional now)', async () => {
    const nonExistentId = randomUUID();
    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${nonExistentId}/conversation`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    // PLAN-22 §Bug-2: cursor is OPTIONAL — first-page call must NOT be a 422.
    // For a non-existent VOC the access-matrix check raises 404 first.
    expect(res.statusCode).toBe(404);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('not_found.record');
  });
});
