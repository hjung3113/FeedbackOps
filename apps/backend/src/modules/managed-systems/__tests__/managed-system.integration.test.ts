// Integration tests for the Managed System write path (Slice 2 #10).
//
// Covers: create, duplicate slug, immutable slug, archive (with cascade
// to empty AA set), audit row presence, permission gate, idempotency
// replay, list filter, GET requires session only.

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

describe.skipIf(!runIntegration)('Managed Systems write path', () => {
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
    // Test-owned MSs (slug prefix `it-`) and their AAs.
    await dbHandle.pool.query(
      `delete from core.analytics_areas
        where managed_system_id in (
          select id from core.managed_systems where slug like 'it-%'
        )`,
    );
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'it-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
    if (MIGRATE_URL) {
      const ops = createDb(MIGRATE_URL);
      await ops.pool.query(
        `delete from core.audit_log where event_type in ('managed_system_registered','managed_system_updated','managed_system_archived')`,
      );
      await ops.close();
    }
  });

  // ── create ─────────────────────────────────────────────────────────
  it('admin POST → 201 + audit_log managed_system_registered row', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-snowflake', name: 'Snowflake' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.slug).toBe('it-snowflake');
    expect(body.name).toBe('Snowflake');
    expect(body.archived_at).toBeNull();

    const audit = await dbHandle.pool.query(
      `select event_type, subject_id, detail from core.audit_log
        where workspace_id = $1 and event_type = 'managed_system_registered'`,
      [WORKSPACE_ID],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.subject_id).toBe(body.id);
    expect(audit.rows[0]?.detail).toMatchObject({
      slug: 'it-snowflake',
      name: 'Snowflake',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
    });
  });

  it('non-admin POST → 403 permission.denied; no row inserted', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-bigquery', name: 'BigQuery' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
    const count = await dbHandle.pool.query(
      `select count(*)::int as n from core.managed_systems where slug = 'it-bigquery'`,
    );
    expect(count.rows[0]?.n).toBe(0);
  });

  it('duplicate slug → 409 conflict.duplicate_slug', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-dup', name: 'first' },
    });
    const dup = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-dup', name: 'second' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('conflict.duplicate_slug');
  });

  it('invalid slug shape → 422 validation.failed', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'IT-BadCase', name: 'no' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  it('Idempotency-Key replay → same response, only one row + one audit row', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const key = randomUUID();
    const payload = { slug: 'it-idem', name: 'Idempotent' };
    const first = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    const count = await dbHandle.pool.query(
      `select count(*)::int as n from core.managed_systems where slug = 'it-idem'`,
    );
    expect(count.rows[0]?.n).toBe(1);
    const audit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'managed_system_registered' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    expect(audit.rows[0]?.n).toBe(1);
  });

  // ── update ─────────────────────────────────────────────────────────
  it('PATCH with slug in body → 422 validation.immutable_field; no audit row', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-immut', name: 'old' },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-immut-renamed' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.immutable_field');
    const audit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'managed_system_updated'`,
    );
    expect(audit.rows[0]?.n).toBe(0);
  });

  it('PATCH that changes nothing → 200, no audit row written', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-noop', name: 'same' },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { name: 'same' },
    });
    expect(res.statusCode).toBe(200);
    const audit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'managed_system_updated'`,
    );
    expect(audit.rows[0]?.n).toBe(0);
  });

  it('PATCH name change → 200, audit row with changes diff', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-rename', name: 'before' },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { name: 'after' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('after');
    const audit = await dbHandle.pool.query(
      `select detail from core.audit_log where event_type = 'managed_system_updated' and subject_id = $1`,
      [id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toEqual({
      managed_system_id: id,
      changes: { name: { from: 'before', to: 'after' } },
    });
  });

  // ── archive ────────────────────────────────────────────────────────
  it('archive sets archived_at + emits audit; second archive is a no-op (one audit row total)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-arch', name: 'Archivable' },
    });
    const id = created.json().id;
    const first = await app.inject({
      method: 'POST',
      url: `/managed-systems/${id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.archived_at).not.toBeNull();
    expect(body.cascaded_analytics_area_ids).toEqual([]);

    const second = await app.inject({
      method: 'POST',
      url: `/managed-systems/${id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(second.statusCode).toBe(200);
    const audit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'managed_system_archived' and subject_id = $1`,
      [id],
    );
    expect(audit.rows[0]?.n).toBe(1);
  });

  // ── list ───────────────────────────────────────────────────────────
  it('GET /managed-systems requires session only; user role can list', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    // seed shipped 2 active MSs (Tableau + Power BI).
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('GET filters archived rows by default; include_archived=true shows them', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-listarch', name: 'hidden' },
    });
    const id = created.json().id;
    await app.inject({
      method: 'POST',
      url: `/managed-systems/${id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    const def = await app.inject({
      method: 'GET',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(def.json().items.find((m: { id: string }) => m.id === id)).toBeUndefined();
    const inc = await app.inject({
      method: 'GET',
      url: '/managed-systems?include_archived=true',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(inc.json().items.find((m: { id: string }) => m.id === id)).toBeDefined();
  });
});
