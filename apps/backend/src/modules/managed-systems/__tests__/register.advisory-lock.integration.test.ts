// Concurrent same-(actor, key) register race (S-001, Slice 3 prologue Task 3).
//
// Two concurrent first-time retries with the same `(actor_id,
// idempotency_key, body)` must both resolve to 201 with the same id and
// leave exactly one row in core.managed_systems. Before the
// `pg_advisory_xact_lock(hashtext(actor_id), hashtext(key))` mitigation,
// the loser collides on the slug unique index and surfaces 409
// `conflict.duplicate_slug` (or, depending on which insert raced through
// first, the matching record-already-exists path).
//
// Mirrors the skip-pattern + login helper in
// `managed-system.integration.test.ts`.
//
// See ADR-0015 "Race surface" amendment.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
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

describe.skipIf(!runIntegration)('registerManagedSystem concurrent same-key retry (S-001)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'race-ms-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    if (MIGRATE_URL) {
      const ops = createDb(MIGRATE_URL);
      await ops.pool.query(
        `delete from core.audit_log where event_type = 'managed_system_registered'`,
      );
      await ops.close();
    }
    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'race-ms-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
    if (MIGRATE_URL) {
      const ops = createDb(MIGRATE_URL);
      await ops.pool.query(
        `delete from core.audit_log where event_type = 'managed_system_registered'`,
      );
      await ops.close();
    }
  });

  it('two concurrent retries with the same (actor, key) both replay the winning response', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const slug = `race-ms-${randomUUID().slice(0, 8)}`;
    const idempotencyKey = randomUUID();
    const payload = { slug, name: `Race MS ${slug}` };

    const headers = {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    } as const;

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/managed-systems', headers, payload }),
      app.inject({ method: 'POST', url: '/managed-systems', headers, payload }),
    ]);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstBody = first.json();
    const secondBody = second.json();
    expect(firstBody.id).toBe(secondBody.id);
    expect(firstBody.slug).toBe(slug);

    const rows = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.managed_systems where workspace_id = $1 and slug = $2`,
      [WORKSPACE_ID, slug],
    );
    expect(rows.rows[0]?.n).toBe(1);

    const audit = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.audit_log
        where event_type = 'managed_system_registered' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    expect(audit.rows[0]?.n).toBe(1);
  });
});
