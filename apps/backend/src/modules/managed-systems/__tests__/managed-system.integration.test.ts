// Integration tests for the Managed System write path (Slice 2 #10).
//
// Covers: create, duplicate slug, immutable slug, archive (with cascade
// to empty AA set), audit row presence, permission gate, idempotency
// replay, list filter, GET requires session only.

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { recordResponsibilityDefaultFailure } from '../default-diagnostics.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

type FieldDetail = { path: string[]; code: string };

function expectFields(body: { detail?: { fields?: FieldDetail[] } }, fields: FieldDetail[]): void {
  expect(body.detail?.fields).toEqual(fields);
}

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
  let ops: DbHandle;
  const activeTeamId = randomUUID();
  const archivedTeamId = randomUUID();
  const foreignTeamId = randomUUID();
  const foreignWorkspaceId = randomUUID();
  const foreignActorId = randomUUID();
  const systemActorId = randomUUID();
  const developerActorId = randomUUID();
  const developerExternalId = `56d-dev-${developerActorId}`;
  const scopedGrantId = randomUUID();
  const deniedAdminActorId = randomUUID();
  const deniedAdminExternalId = `56d-admin-${deniedAdminActorId}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    await ops.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      foreignWorkspaceId,
      '56-D foreign',
    ]);
    await ops.pool.query(
      `insert into core.teams (id, workspace_id, name, archived_at) values
      ($1, $4, '56-D active', null), ($2, $4, '56-D archived', now()), ($3, $5, '56-D foreign', null)`,
      [activeTeamId, archivedTeamId, foreignTeamId, WORKSPACE_ID, foreignWorkspaceId],
    );
    await ops.pool.query(
      `insert into core.actors (id, workspace_id, external_id, email, display_name, role_level, actor_type)
      values ($1::uuid, $3, $1::uuid::text, 'foreign-56d@example.test', 'Foreign', 'admin', 'internal_member'),
      ($2::uuid, $4, $2::uuid::text, 'system-56d@example.test', 'System', 'admin', 'system')`,
      [foreignActorId, systemActorId, foreignWorkspaceId, WORKSPACE_ID],
    );
    await ops.pool.query(
      `insert into core.actors (id, workspace_id, external_id, email, display_name, role_level, actor_type)
      values ($1, $3, $4, $4 || '@example.test', 'Scoped Developer', 'developer', 'internal_member'),
      ($2, $3, $5, $5 || '@example.test', 'Denied Admin', 'admin', 'internal_member')`,
      [
        developerActorId,
        deniedAdminActorId,
        WORKSPACE_ID,
        developerExternalId,
        deniedAdminExternalId,
      ],
    );
    await ops.pool.query(
      `insert into permission.permission_grants (id, workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
      select $1, $2, $3, 'finding.manage', m.id, $4 from core.managed_systems m
      where m.workspace_id = $2 and m.slug = 'tableau' and m.archived_at is null`,
      [scopedGrantId, WORKSPACE_ID, developerActorId, deniedAdminActorId],
    );
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    // Test-owned rows leak across suites otherwise: the seed-idempotency
    // suite (`db/__tests__/seed.integration.test.ts`) asserts only the
    // two seeded MSs exist, so any `it-*` MS this suite left active will
    // break it under parallel-file runs.
    await dbHandle.pool.query(
      `delete from core.analytics_areas
        where managed_system_id in (
          select id from core.managed_systems where slug like 'it-%'
        )`,
    );
    await ops.pool.query(
      `delete from core.responsibility_default_failures where managed_system_id in (select id from core.managed_systems where slug like 'it-%')`,
    );
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'it-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    if (MIGRATE_URL) {
      const ops = createDb(MIGRATE_URL);
      await ops.pool.query(
        `delete from core.audit_log where event_type in ('managed_system_registered','managed_system_updated','managed_system_archived')`,
      );
      await ops.close();
    }
    await ops.pool.query('delete from core.teams where id = any($1::uuid[])', [
      [activeTeamId, archivedTeamId, foreignTeamId],
    ]);
    await ops.pool.query('delete from permission.permission_grants where id = $1', [scopedGrantId]);
    await ops.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
      [developerActorId, deniedAdminActorId],
    ]);
    await ops.pool.query('delete from core.actors where id = any($1::uuid[])', [
      [foreignActorId, systemActorId, developerActorId, deniedAdminActorId],
    ]);
    await ops.pool.query('delete from core.workspaces where id = $1', [foreignWorkspaceId]);
    await ops.close();
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
    await ops.pool.query(
      `delete from core.responsibility_default_failures where managed_system_id in (select id from core.managed_systems where slug like 'it-%')`,
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

    const audit = await ops.pool.query(
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

  it('non-admin POST → 403 permission.denied; no row, no audit row, no idempotency key (review H5)', async () => {
    // Review H5: a capability gate that fired AFTER writing audit_log
    // would corrupt the immutable log. Assert the denial leaves no row
    // anywhere: domain table, audit_log, and idempotency_keys.
    const cookie = await loginAs(app, 'mock-user-1');
    const key = randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: { slug: 'it-bigquery', name: 'BigQuery' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
    const count = await dbHandle.pool.query(
      `select count(*)::int as n from core.managed_systems where slug = 'it-bigquery'`,
    );
    expect(count.rows[0]?.n).toBe(0);
    const audit = await ops.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'managed_system_registered' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    expect(audit.rows[0]?.n).toBe(0);
    const idem = await dbHandle.pool.query(
      'select count(*)::int as n from core.idempotency_keys where key = $1',
      [key],
    );
    expect(idem.rows[0]?.n).toBe(0);
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
    const body = dup.json<{ code: string; detail?: { fields?: FieldDetail[] } }>();
    expect(body.code).toBe('conflict.duplicate_slug');
    expectFields(body, [{ path: ['slug'], code: 'duplicate_slug' }]);
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
    const body = res.json<{
      code: string;
      detail?: { fields?: FieldDetail[]; pattern?: string };
    }>();
    expect(body.code).toBe('validation.failed');
    expectFields(body, [{ path: ['slug'], code: 'invalid_slug_format' }]);
    expect(body.detail?.pattern).toBeUndefined();
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
    const audit = await ops.pool.query(
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
    const body = res.json<{ code: string; detail?: { fields?: FieldDetail[] } }>();
    expect(body.code).toBe('validation.immutable_field');
    expectFields(body, [{ path: ['slug'], code: 'immutable_field' }]);
    const audit = await ops.pool.query(
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
    const audit = await ops.pool.query(
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
    const audit = await ops.pool.query(
      `select detail from core.audit_log where event_type = 'managed_system_updated' and subject_id = $1`,
      [id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toEqual({
      managed_system_id: id,
      changes: { name: { from: 'before', to: 'after' } },
      configuration_changed_at: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
      ),
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
    const audit = await ops.pool.query(
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

  // ── review-followup tests ───────────────────────────────────────────

  it('Idempotency-Key reuse with different body → 409 conflict.idempotency_key_reuse (review C2)', async () => {
    // ADR-0015:71-90 mandates 409 when the same key is replayed with a
    // different request hash. The existing replay test (line 160) only
    // covers same-key + same-body.
    const cookie = await loginAs(app, 'mock-admin-1');
    const key = randomUUID();
    const first = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: { slug: 'it-idem-mismatch', name: 'first body' },
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
      payload: { slug: 'it-idem-mismatch', name: 'different body' },
    });
    expect(second.statusCode).toBe(409);
    const body = second.json<{ code: string; detail?: { fields?: FieldDetail[] } }>();
    expect(body.code).toBe('conflict.idempotency_key_reuse');
    expectFields(body, [{ path: ['headers', 'idempotency-key'], code: 'idempotency_key_reuse' }]);
  });

  it('archive of non-existent MS → 404 not_found.record (review H1)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'POST',
      url: `/managed-systems/${randomUUID()}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  it('PATCH of non-existent MS → 404 not_found.record (review H1)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${randomUUID()}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { name: 'whatever' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  it('POST with both default_owner_actor_id and default_owner_team_id → 422 validation.failed (review H4)', async () => {
    // ADR-0018:36 CHECK rejects "both non-null"; the service layer's
    // pre-DB validation (managed-system-service.ts:143-149) should give
    // a friendly 422 instead of letting the DB CHECK bubble to 500.
    const cookie = await loginAs(app, 'mock-admin-1');
    const adminActor = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    expect(adminActor.rowCount).toBe(1);
    const teamRow = await dbHandle.pool.query<{ id: string }>(
      'select id from core.teams where id = $1',
      [activeTeamId],
    );
    expect(teamRow.rowCount).toBe(1);
    const res = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: {
        slug: 'it-xor',
        name: 'XOR',
        default_owner_actor_id: adminActor.rows[0]?.id,
        default_owner_team_id: teamRow.rows[0]?.id,
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json<{ code: string; detail?: { fields?: FieldDetail[] } }>();
    expect(body.code).toBe('validation.failed');
    expectFields(body, [
      { path: ['default_owner_actor_id'], code: 'mutually_exclusive' },
      { path: ['default_owner_team_id'], code: 'mutually_exclusive' },
    ]);
  });

  it('PATCH that would leave both default_owner_* set → 422 validation.failed (review H4)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const adminActor = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const teamRow = await dbHandle.pool.query<{ id: string }>(
      'select id from core.teams where id = $1',
      [activeTeamId],
    );
    expect(teamRow.rowCount).toBe(1);
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: {
        slug: 'it-xor-patch',
        name: 'XOR PATCH',
        default_owner_actor_id: adminActor.rows[0]?.id,
      },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      // PATCH adds team without clearing actor → both non-null
      payload: { default_owner_team_id: teamRow.rows[0]?.id },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json<{ code: string; detail?: { fields?: FieldDetail[] } }>();
    expect(body.code).toBe('validation.failed');
    expectFields(body, [
      { path: ['default_owner_actor_id'], code: 'mutually_exclusive' },
      { path: ['default_owner_team_id'], code: 'mutually_exclusive' },
    ]);
  });

  it('PATCH on an archived MS → 409 conflict.record_archived (ADR-0019 Section A)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-arch-patch', name: 'Archived target' },
    });
    const id = created.json().id;
    await app.inject({
      method: 'POST',
      url: `/managed-systems/${id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { name: 'renamed after archive' },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json<{ code: string; detail?: { fields?: FieldDetail[] } }>();
    expect(body.code).toBe('conflict.record_archived');
    expectFields(body, [{ path: ['id'], code: 'record_archived' }]);
    const audit = await ops.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'managed_system_updated' and subject_id = $1`,
      [id],
    );
    expect(audit.rows[0]?.n).toBe(0);
  });

  it('slug reuse after archive succeeds via service path (review L2)', async () => {
    // ADR-0017:63 "Slug reuse after archive is permitted". The partial
    // unique index already proves this at the DB layer; this test covers
    // the service path so a future "check slug independent of archive
    // state" regression is caught.
    const cookie = await loginAs(app, 'mock-admin-1');
    const slug = 'it-reuse';
    const first = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug, name: 'first' },
    });
    expect(first.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: `/managed-systems/${first.json().id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug, name: 'second after archive' },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().id).not.toBe(first.json().id);
  });

  it.each(['owner', 'reviewer'] as const)(
    '56-D %s default validates targets and effective PATCH XOR atomically',
    async (kind) => {
      const cookie = await loginAs(app, 'mock-admin-1');
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
      const actorKey = `default_${kind}_actor_id`;
      const teamKey = `default_${kind}_team_id`;
      const admin = await dbHandle.pool.query<{ id: string }>(
        "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
        [WORKSPACE_ID],
      );
      const adminId = admin.rows[0]?.id;
      const user = await dbHandle.pool.query<{ id: string }>(
        "select id from core.actors where workspace_id = $1 and external_id = 'mock-user-1'",
        [WORKSPACE_ID],
      );
      expect(user.rowCount).toBe(1);
      const created = await app.inject({
        method: 'POST',
        url: '/managed-systems',
        headers,
        payload: { slug: `it-56d-${kind}`, name: 'Responsibility', [actorKey]: adminId },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()[actorKey]).toBe(adminId);
      expect(created.json()[teamKey]).toBeNull();
      const id = created.json().id;
      const snapshot = await ops.pool.query(
        'select detail from core.audit_log where subject_id = $1 and event_type = $2',
        [id, 'managed_system_registered'],
      );
      expect(snapshot.rows[0]?.detail).toMatchObject({
        [actorKey]: adminId,
        [teamKey]: null,
        default_reviewer_actor_id: kind === 'reviewer' ? adminId : null,
        default_reviewer_team_id: null,
      });
      const surveyBefore = await dbHandle.pool.query(
        'select default_survey_operator_actor_id from core.managed_systems where id = $1',
        [id],
      );
      for (const payload of [
        { [teamKey]: activeTeamId },
        { [actorKey]: null, [teamKey]: archivedTeamId },
        { [actorKey]: null, [teamKey]: foreignTeamId },
        { [actorKey]: foreignActorId },
        { [actorKey]: systemActorId },
        { [actorKey]: user.rows[0]?.id },
      ]) {
        const rejected = await app.inject({
          method: 'PATCH',
          url: `/managed-systems/${id}`,
          headers,
          payload,
        });
        expect(rejected.statusCode).toBe(422);
        expect(rejected.json().code).toBe('validation.failed');
        const current = await app.inject({
          method: 'GET',
          url: `/managed-systems?slug=it-56d-${kind}`,
          headers,
        });
        expect(current.json().items[0]).toEqual(created.json());
        const audits = await ops.pool.query(
          'select id from core.audit_log where subject_id = $1 and event_type = $2',
          [id, 'managed_system_updated'],
        );
        expect(audits.rowCount).toBe(0);
      }
      const replace = await app.inject({
        method: 'PATCH',
        url: `/managed-systems/${id}`,
        headers,
        payload: { [actorKey]: null, [teamKey]: activeTeamId },
      });
      expect(replace.statusCode).toBe(200);
      expect(replace.json()[actorKey]).toBeNull();
      expect(replace.json()[teamKey]).toBe(activeTeamId);
      const audit = await ops.pool.query(
        'select detail from core.audit_log where subject_id = $1 and event_type = $2',
        [id, 'managed_system_updated'],
      );
      expect(audit.rows[0]?.detail.changes).toEqual({
        [actorKey]: { from: adminId, to: null },
        [teamKey]: { from: null, to: activeTeamId },
      });
      const clear = await app.inject({
        method: 'PATCH',
        url: `/managed-systems/${id}`,
        headers,
        payload: { [actorKey]: null, [teamKey]: null },
      });
      expect(clear.statusCode).toBe(200);
      expect(clear.json()[teamKey]).toBeNull();
      const surveyAfter = await dbHandle.pool.query(
        'select default_survey_operator_actor_id from core.managed_systems where id = $1',
        [id],
      );
      expect(surveyAfter.rows).toEqual(surveyBefore.rows);
    },
  );

  it.each(['owner', 'reviewer'] as const)(
    '56-D %s POST rejects XOR and foreign/ineligible targets without writes',
    async (kind) => {
      const cookie = await loginAs(app, 'mock-admin-1');
      const user = await dbHandle.pool.query<{ id: string }>(
        "select id from core.actors where workspace_id = $1 and external_id = 'mock-user-1'",
        [WORKSPACE_ID],
      );
      expect(user.rowCount).toBe(1);
      for (const pair of [
        { [`default_${kind}_actor_id`]: systemActorId, [`default_${kind}_team_id`]: activeTeamId },
        { [`default_${kind}_actor_id`]: foreignActorId },
        { [`default_${kind}_actor_id`]: systemActorId },
        { [`default_${kind}_actor_id`]: user.rows[0]?.id },
        { [`default_${kind}_team_id`]: archivedTeamId },
        { [`default_${kind}_team_id`]: foreignTeamId },
      ]) {
        const result = await app.inject({
          method: 'POST',
          url: '/managed-systems',
          headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
          payload: { slug: 'it-rejected-56d', name: 'Rejected', ...pair },
        });
        expect(result.statusCode).toBe(422);
        expect(result.json().code).toBe('validation.failed');
      }
      const rows = await dbHandle.pool.query(
        "select id from core.managed_systems where slug = 'it-rejected-56d'",
      );
      expect(rows.rowCount).toBe(0);
    },
  );

  it.each(['mock-user-1', developerExternalId])(
    '56-D %s cannot edit defaults or read diagnostics; session list stays readable',
    async (externalId) => {
      const cookie = await loginAs(app, externalId);
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
      const list = await app.inject({ method: 'GET', url: '/managed-systems', headers });
      expect(list.statusCode).toBe(200);
      const id = list.json().items[0].id;
      const denied = await app.inject({
        method: 'PATCH',
        url: `/managed-systems/${id}`,
        headers,
        payload: { default_reviewer_team_id: activeTeamId },
      });
      expect(denied.statusCode).toBe(403);
      const diagnostics = await app.inject({
        method: 'GET',
        url: '/managed-systems/default-diagnostics',
        headers,
      });
      expect(diagnostics.statusCode).toBe(403);
    },
  );

  it('diagnostic audit projection preserves failures after unrelated configuration edits', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers,
      payload: { slug: 'it-diagnostics-unrelated', name: 'Diagnostics unrelated' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    await dbHandle.db.transaction((tx) =>
      recordResponsibilityDefaultFailure(tx, {
        workspace_id: WORKSPACE_ID,
        managed_system_id: id,
        workflow: 'voc',
        responsibility: 'owner',
        rule: 'managed_system_owner',
        category: 'missing',
      }),
    );
    const updated = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers,
      payload: { name: 'Renamed diagnostics' },
    });
    expect(updated.statusCode).toBe(200);
    const read = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().items).toContainEqual(
      expect.objectContaining({
        managed_system_id: id,
        responsibility: 'owner',
        origin: 'creation_failure',
        count: 1,
      }),
    );
  });

  it('56-D Admin diagnostics reads safe failures, rejects denied Admin, and refetch reflects edits', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers,
      payload: { slug: 'it-diagnostics', name: 'Diagnostics', default_owner_team_id: activeTeamId },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    await dbHandle.db.transaction(async (tx) => {
      await recordResponsibilityDefaultFailure(tx, {
        workspace_id: WORKSPACE_ID,
        managed_system_id: id,
        workflow: 'task_request',
        responsibility: 'reviewer',
        rule: 'managed_system_reviewer',
        category: 'ineligible_actor',
      });
    });
    const read = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().items).toContainEqual(
      expect.objectContaining({
        managed_system_id: id,
        workflow: 'task_request',
        responsibility: 'reviewer',
        category: 'ineligible_actor',
        origin: 'creation_failure',
        count: 1,
      }),
    );
    expect(JSON.stringify(read.json())).not.toContain('candidate');
    expect(JSON.stringify(read.json())).not.toContain('email');
    const updated = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers,
      payload: { default_reviewer_team_id: activeTeamId },
    });
    expect(updated.statusCode).toBe(200);
    const refetched = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(
      refetched
        .json()
        .items.filter((item: { managed_system_id: string }) => item.managed_system_id === id),
    ).toEqual([]);
    const deniedCookie = await loginAs(app, deniedAdminExternalId);
    const deniedHeaders = { cookie: `${SESSION_COOKIE_NAME}=${deniedCookie}` };
    const denyId = randomUUID();
    await ops.pool.query(
      `insert into permission.permission_denies (id, workspace_id, actor_id, capability, reason, created_by_actor_id)
      values ($1, $2, $3, 'workspace.admin', '56-D denial', $3)`,
      [denyId, WORKSPACE_ID, deniedAdminActorId],
    );
    try {
      const deniedRead = await app.inject({
        method: 'GET',
        url: '/managed-systems/default-diagnostics',
        headers: deniedHeaders,
      });
      expect(deniedRead.statusCode).toBe(403);
      const deniedEdit = await app.inject({
        method: 'PATCH',
        url: `/managed-systems/${id}`,
        headers: deniedHeaders,
        payload: { default_reviewer_team_id: null },
      });
      expect(deniedEdit.statusCode).toBe(403);
    } finally {
      await ops.pool.query('delete from permission.permission_denies where id = $1', [denyId]);
    }
  });

  it('56-D failure input rolls back with its caller transaction', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers,
      payload: {
        slug: 'it-diagnostic-rollback',
        name: 'Rollback',
        default_owner_team_id: activeTeamId,
        default_reviewer_team_id: activeTeamId,
      },
    });
    const id = created.json().id;
    await expect(
      dbHandle.db.transaction(async (tx) => {
        await recordResponsibilityDefaultFailure(tx, {
          workspace_id: WORKSPACE_ID,
          managed_system_id: id,
          workflow: 'task',
          responsibility: 'owner',
          rule: 'analytics_area_owner',
          category: 'archived_team',
        });
        throw new Error('source rollback');
      }),
    ).rejects.toThrow('source rollback');
    const read = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(
      read
        .json()
        .items.filter((item: { managed_system_id: string }) => item.managed_system_id === id),
    ).toEqual([]);
  });

  it('56-D current configuration warnings disclose safe reasons for archived teams and revoked Actor eligibility', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers,
      payload: { slug: 'it-stale-default', name: 'Stale', default_owner_team_id: activeTeamId },
    });
    const id = created.json().id;
    await ops.pool.query(
      `update core.managed_systems set default_owner_team_id = $2,
      default_reviewer_actor_id = $3 where id = $1`,
      [id, archivedTeamId, developerActorId],
    );
    const read = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(read.statusCode).toBe(200);
    const warnings = read
      .json()
      .items.filter((item: { managed_system_id: string }) => item.managed_system_id === id);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          responsibility: 'owner',
          category: 'archived_team',
          origin: 'configuration',
        }),
        expect.objectContaining({
          responsibility: 'reviewer',
          category: 'ineligible_actor',
          origin: 'configuration',
        }),
      ]),
    );
    expect(JSON.stringify(warnings)).not.toContain(archivedTeamId);
    expect(JSON.stringify(warnings)).not.toContain(developerActorId);
  });
  it.each(['valid_owner', 'empty', 'owner_not_reviewer_eligible'] as const)(
    'FIX1 reviewer diagnostics follows effective fallback: %s',
    async (variant) => {
      const cookie = await loginAs(app, 'mock-admin-1');
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
      const created = await app.inject({
        method: 'POST',
        url: '/managed-systems',
        headers,
        payload: {
          slug: 'it-fallback',
          name: 'Fallback',
          ...(variant === 'valid_owner' ? { default_owner_team_id: activeTeamId } : {}),
        },
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;
      if (variant === 'owner_not_reviewer_eligible') {
        await ops.pool.query(
          'update core.managed_systems set default_owner_actor_id = $2 where id = $1',
          [id, developerActorId],
        );
      }
      const read = await app.inject({
        method: 'GET',
        url: '/managed-systems/default-diagnostics',
        headers,
      });
      expect(read.statusCode).toBe(200);
      const reviewerWarnings = read
        .json()
        .items.filter(
          (item: { managed_system_id: string; responsibility: string; origin: string }) =>
            item.managed_system_id === id &&
            item.responsibility === 'reviewer' &&
            item.origin === 'configuration',
        );
      expect(reviewerWarnings).toEqual(
        variant === 'valid_owner' ? [] : [expect.objectContaining({ category: 'missing' })],
      );
    },
  );

  it('FIX1 a source transaction begun before an edit observes the later locked configuration', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers,
      payload: { slug: 'it-lock-order', name: 'Lock order', default_owner_team_id: activeTeamId },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    let started!: () => void;
    let resume!: () => void;
    const barrier = new Promise<void>((resolve) => {
      started = resolve;
    });
    const release = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const source = dbHandle.db.transaction(async (tx) => {
      await tx.execute(sql`select now()`);
      started();
      await release;
      await recordResponsibilityDefaultFailure(tx, {
        workspace_id: WORKSPACE_ID,
        managed_system_id: id,
        workflow: 'task_request',
        responsibility: 'reviewer',
        rule: 'managed_system_reviewer',
        category: 'ineligible_actor',
      });
    });
    try {
      await barrier;
      const edit = await app.inject({
        method: 'PATCH',
        url: `/managed-systems/${id}`,
        headers,
        payload: { default_reviewer_team_id: activeTeamId },
      });
      expect(edit.statusCode).toBe(200);
    } finally {
      resume();
      await source;
    }
    const read = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().items).toContainEqual(
      expect.objectContaining({ managed_system_id: id, origin: 'creation_failure', count: 1 }),
    );
    const edit = await app.inject({
      method: 'PATCH',
      url: `/managed-systems/${id}`,
      headers,
      payload: { default_reviewer_team_id: null },
    });
    expect(edit.statusCode).toBe(200);
    const superseded = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(
      superseded
        .json()
        .items.filter(
          (item: { managed_system_id: string; origin: string }) =>
            item.managed_system_id === id && item.origin === 'creation_failure',
        ),
    ).toEqual([]);
  });

  it('FIX1 registry candidates use destination eligibility and preserve a revoked current Actor', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const tableau = await dbHandle.pool.query<{ id: string }>(
      "select id from core.managed_systems where workspace_id = $1 and slug = 'tableau' and archived_at is null",
      [WORKSPACE_ID],
    );
    const systemId = tableau.rows[0]?.id;
    if (!systemId) throw new Error('Tableau seed missing');
    const candidates = await app.inject({
      method: 'GET',
      url: `/managed-systems/default-candidates?managed_system_id=${systemId}`,
      headers,
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().reviewers).toContainEqual({
      id: developerActorId,
      display_name: 'Scoped Developer',
      eligible: true,
    });
    expect(candidates.json().owners).toContainEqual({
      id: developerActorId,
      display_name: 'Scoped Developer',
      eligible: true,
    });
    expect(JSON.stringify(candidates.json())).not.toContain('email');
    const registration = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-candidates',
      headers,
    });
    expect(registration.statusCode).toBe(200);
    expect(
      registration.json().owners.some((actor: { id: string }) => actor.id === developerActorId),
    ).toBe(false);
    expect(
      registration.json().reviewers.some((actor: { id: string }) => actor.id === developerActorId),
    ).toBe(false);
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers,
      payload: { slug: 'it-candidates', name: 'Candidates' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    await ops.pool.query(
      'update core.managed_systems set default_reviewer_actor_id = $2 where id = $1',
      [id, developerActorId],
    );
    const grantId = randomUUID();
    await ops.pool.query(
      "insert into permission.permission_grants (id, workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, $3, 'voc.triage', $4, $5)",
      [grantId, WORKSPACE_ID, developerActorId, id, deniedAdminActorId],
    );
    try {
      const read = await app.inject({
        method: 'GET',
        url: `/managed-systems/default-candidates?managed_system_id=${id}`,
        headers,
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().owners).toContainEqual({
        id: developerActorId,
        display_name: 'Scoped Developer',
        eligible: true,
      });
      expect(read.json().reviewers).toContainEqual({
        id: developerActorId,
        display_name: 'Scoped Developer',
        eligible: false,
      });
      expect(read.json().owners.some((actor: { id: string }) => actor.id === systemActorId)).toBe(
        false,
      );
      await ops.pool.query(
        'update core.managed_systems set default_owner_actor_id = $2, default_reviewer_actor_id = null where id = $1',
        [id, developerActorId],
      );
      const diagnostics = await app.inject({
        method: 'GET',
        url: '/managed-systems/default-diagnostics',
        headers,
      });
      expect(diagnostics.statusCode).toBe(200);
      expect(
        diagnostics
          .json()
          .items.filter((item: { managed_system_id: string }) => item.managed_system_id === id),
      ).toEqual([expect.objectContaining({ responsibility: 'reviewer', category: 'missing' })]);
      const deniedCookie = await loginAs(app, developerExternalId);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/managed-systems/default-candidates',
            headers: { cookie: `${SESSION_COOKIE_NAME}=${deniedCookie}` },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/managed-systems/default-candidates?managed_system_id=${randomUUID()}`,
            headers,
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await ops.pool.query('delete from permission.permission_grants where id = $1', [grantId]);
    }
  });

  it('FIX1 an edit transaction begun before a failure supersedes it when it locks later', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const key = randomUUID();
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const created = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers,
      payload: {
        slug: 'it-edit-lock-order',
        name: 'Edit lock order',
        default_owner_team_id: activeTeamId,
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const blocker = await dbHandle.pool.connect();
    let edit: PromiseLike<Awaited<ReturnType<typeof app.inject>>> | undefined;
    try {
      await blocker.query('begin');
      const pid = (await blocker.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]
        ?.pid;
      if (!pid) throw new Error('Blocker PID missing');
      // KEY SHARE blocks the edit's registry FOR UPDATE inside its already-begun route
      // transaction, while the failure seam's FOR SHARE is compatible and proceeds.
      await blocker.query('select 1 from core.managed_systems where id = $1 for key share', [id]);
      edit = app
        .inject({
          method: 'PATCH',
          url: `/managed-systems/${id}`,
          headers: { ...headers, 'idempotency-key': key },
          payload: { default_reviewer_team_id: activeTeamId },
        })
        .then((result) => result);
      const deadline = Date.now() + 3000;
      let waiting = false;
      while (Date.now() < deadline) {
        const observed = await dbHandle.pool.query(
          'select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))',
          [pid],
        );
        if (observed.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await dbHandle.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '2s'`);
        await recordResponsibilityDefaultFailure(tx, {
          workspace_id: WORKSPACE_ID,
          managed_system_id: id,
          workflow: 'task_request',
          responsibility: 'reviewer',
          rule: 'managed_system_reviewer',
          category: 'ineligible_actor',
        });
      });
    } finally {
      await blocker.query('rollback');
      blocker.release();
      if (edit) await edit;
    }
    if (!edit) throw new Error('Edit was not started');
    expect((await edit).statusCode).toBe(200);
    const read = await app.inject({
      method: 'GET',
      url: '/managed-systems/default-diagnostics',
      headers,
    });
    expect(read.statusCode).toBe(200);
    expect(
      read
        .json()
        .items.filter((item: { managed_system_id: string }) => item.managed_system_id === id),
    ).toEqual([]);
  });
});
