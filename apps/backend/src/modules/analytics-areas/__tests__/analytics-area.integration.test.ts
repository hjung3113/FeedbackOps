// Analytics Area write path (Slice 2 #11) + MS archive cascade activation.

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

async function createMs(
  app: FastifyInstance,
  cookie: string,
  slug: string,
  name: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/managed-systems',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: { slug, name },
  });
  if (res.statusCode !== 201) throw new Error(`createMs failed: ${res.statusCode} ${res.body}`);
  return res.json().id;
}

async function createAa(
  app: FastifyInstance,
  cookie: string,
  body: { managed_system_id: string; slug: string; name: string },
) {
  return app.inject({
    method: 'POST',
    url: '/analytics-areas',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: body,
  });
}

describe.skipIf(!runIntegration)('Analytics Areas write path', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    // See managed-system afterAll — prevents `it-*` rows leaking into
    // the seed-idempotency suite under parallel runs.
    await dbHandle.pool.query(
      `delete from core.analytics_areas
        where managed_system_id in (
          select id from core.managed_systems where slug like 'it-%'
        )`,
    );
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'it-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    if (MIGRATE_URL) {
      const ops = createDb(MIGRATE_URL);
      await ops.pool.query(
        `delete from core.audit_log where event_type in ('managed_system_registered','managed_system_updated','managed_system_archived','analytics_area_registered','analytics_area_updated','analytics_area_archived')`,
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
    await dbHandle.pool.query(
      `delete from core.analytics_areas
        where managed_system_id in (select id from core.managed_systems where slug like 'it-%')`,
    );
    await dbHandle.pool.query(`delete from core.analytics_areas where slug like 'it-%'`);
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'it-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
    if (MIGRATE_URL) {
      const ops = createDb(MIGRATE_URL);
      await ops.pool.query(
        `delete from core.audit_log
          where event_type in (
            'managed_system_registered','managed_system_updated','managed_system_archived',
            'analytics_area_registered','analytics_area_updated','analytics_area_archived'
          )`,
      );
      await ops.close();
    }
  });

  // ── create ─────────────────────────────────────────────────────────
  it('admin POST → 201 + analytics_area_registered audit row', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-aa-ms', 'MS');
    const res = await createAa(app, cookie, {
      managed_system_id: msId,
      slug: 'it-aa-1',
      name: 'AA One',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().managed_system_id).toBe(msId);
    const audit = await dbHandle.pool.query(
      `select detail from core.audit_log where event_type = 'analytics_area_registered'`,
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      managed_system_id: msId,
      slug: 'it-aa-1',
      name: 'AA One',
      owner_team_id: null,
    });
  });

  it('non-admin POST → 403 permission.denied', async () => {
    const adminCookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, adminCookie, 'it-aa-ms2', 'MS');
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await createAa(app, cookie, {
      managed_system_id: msId,
      slug: 'it-aa-fail',
      name: 'no',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
  });

  it('create under archived MS → 409 conflict.parent_archived', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-aa-msarch', 'MS');
    await app.inject({
      method: 'POST',
      url: `/managed-systems/${msId}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    const res = await createAa(app, cookie, {
      managed_system_id: msId,
      slug: 'it-aa-blocked',
      name: 'no',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.parent_archived');
  });

  it('duplicate slug under SAME MS → 409 conflict.duplicate_slug; same slug under different MS → 201', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const ms1 = await createMs(app, cookie, 'it-aa-dup1', 'M1');
    const ms2 = await createMs(app, cookie, 'it-aa-dup2', 'M2');
    const first = await createAa(app, cookie, {
      managed_system_id: ms1,
      slug: 'it-permission',
      name: 'pm',
    });
    expect(first.statusCode).toBe(201);
    const dup = await createAa(app, cookie, {
      managed_system_id: ms1,
      slug: 'it-permission',
      name: 'pm2',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('conflict.duplicate_slug');
    // CONTEXT.md:337 — same slug under different MS is permitted.
    const cross = await createAa(app, cookie, {
      managed_system_id: ms2,
      slug: 'it-permission',
      name: 'pm-cross',
    });
    expect(cross.statusCode).toBe(201);
  });

  // ── update ─────────────────────────────────────────────────────────
  it('PATCH slug → 422 validation.immutable_field', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-aa-upd1', 'MS');
    const created = await createAa(app, cookie, {
      managed_system_id: msId,
      slug: 'it-aa-upd',
      name: 'before',
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/analytics-areas/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug: 'it-aa-renamed' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.immutable_field');
  });

  it('PATCH managed_system_id → 422 validation.immutable_field', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const ms1 = await createMs(app, cookie, 'it-aa-mv1', 'M1');
    const ms2 = await createMs(app, cookie, 'it-aa-mv2', 'M2');
    const created = await createAa(app, cookie, {
      managed_system_id: ms1,
      slug: 'it-mv',
      name: 'x',
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/analytics-areas/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { managed_system_id: ms2 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.immutable_field');
  });

  it('PATCH name change → audit row with diff; no-op PATCH → 200 no audit row', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-aa-diff', 'MS');
    const created = await createAa(app, cookie, {
      managed_system_id: msId,
      slug: 'it-aa-diff-s',
      name: 'old',
    });
    const id = created.json().id;
    const noop = await app.inject({
      method: 'PATCH',
      url: `/analytics-areas/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { name: 'old' },
    });
    expect(noop.statusCode).toBe(200);
    const noopAudit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'analytics_area_updated'`,
    );
    expect(noopAudit.rows[0]?.n).toBe(0);

    const res = await app.inject({
      method: 'PATCH',
      url: `/analytics-areas/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { name: 'new' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('new');
    const audit = await dbHandle.pool.query(
      `select detail from core.audit_log where event_type = 'analytics_area_updated' and subject_id = $1`,
      [id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toEqual({
      analytics_area_id: id,
      changes: { name: { from: 'old', to: 'new' } },
    });
  });

  // ── standalone archive ─────────────────────────────────────────────
  it('standalone archive → audit row with cascade_source_managed_system_id null', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-aa-sa', 'MS');
    const created = await createAa(app, cookie, {
      managed_system_id: msId,
      slug: 'it-aa-sa-s',
      name: 'x',
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'POST',
      url: `/analytics-areas/${id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().archived_at).not.toBeNull();
    const audit = await dbHandle.pool.query(
      `select detail from core.audit_log where event_type = 'analytics_area_archived' and subject_id = $1`,
      [id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toEqual({
      analytics_area_id: id,
      cascade_source_managed_system_id: null,
    });
    // Re-archive is a no-op (no second audit row).
    const second = await app.inject({
      method: 'POST',
      url: `/analytics-areas/${id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(second.statusCode).toBe(200);
    const auditAfter = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'analytics_area_archived' and subject_id = $1`,
      [id],
    );
    expect(auditAfter.rows[0]?.n).toBe(1);
  });

  // ── cascade ─────────────────────────────────────────────────────────
  it('archive MS with 3 active AAs → 1 MS audit row + 3 AA archive rows with cascade_source set', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-aa-csmig', 'CascadeMS');
    const aaIds: string[] = [];
    for (const slug of ['it-c-1', 'it-c-2', 'it-c-3']) {
      const r = await createAa(app, cookie, {
        managed_system_id: msId,
        slug,
        name: slug,
      });
      aaIds.push(r.json().id);
    }

    const archiveRes = await app.inject({
      method: 'POST',
      url: `/managed-systems/${msId}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(archiveRes.statusCode).toBe(200);
    const body = archiveRes.json();
    expect(body.archived_at).not.toBeNull();
    expect(body.cascaded_analytics_area_ids).toHaveLength(3);
    expect([...body.cascaded_analytics_area_ids].sort()).toEqual([...aaIds].sort());

    // Single MS archive audit row carrying the cascaded list.
    const msAudit = await dbHandle.pool.query(
      `select detail from core.audit_log where event_type = 'managed_system_archived' and subject_id = $1`,
      [msId],
    );
    expect(msAudit.rowCount).toBe(1);
    expect(
      (msAudit.rows[0]?.detail as { cascaded_analytics_area_ids: string[] })
        .cascaded_analytics_area_ids,
    ).toHaveLength(3);

    // 3 AA archive audit rows, each with cascade_source_managed_system_id = msId.
    const aaAudit = await dbHandle.pool.query(
      `select subject_id, detail from core.audit_log where event_type = 'analytics_area_archived'`,
    );
    expect(aaAudit.rowCount).toBe(3);
    for (const r of aaAudit.rows) {
      expect(
        (r.detail as { cascade_source_managed_system_id: string | null })
          .cascade_source_managed_system_id,
      ).toBe(msId);
    }

    // All AA rows now archived in the DB.
    const stillActive = await dbHandle.pool.query(
      `select count(*)::int as n from core.analytics_areas
        where managed_system_id = $1 and archived_at is null`,
      [msId],
    );
    expect(stillActive.rows[0]?.n).toBe(0);
  });

  // ── list ────────────────────────────────────────────────────────────
  it('GET /analytics-areas filters by managed_system_id; default hides archived', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const ms1 = await createMs(app, cookie, 'it-l-1', 'L1');
    const ms2 = await createMs(app, cookie, 'it-l-2', 'L2');
    await createAa(app, cookie, { managed_system_id: ms1, slug: 'it-l-1a', name: 'a' });
    const b = await createAa(app, cookie, { managed_system_id: ms1, slug: 'it-l-1b', name: 'b' });
    await createAa(app, cookie, { managed_system_id: ms2, slug: 'it-l-2a', name: 'c' });

    const onlyMs1 = await app.inject({
      method: 'GET',
      url: `/analytics-areas?managed_system_id=${ms1}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(onlyMs1.statusCode).toBe(200);
    expect(onlyMs1.json().total).toBe(2);

    // Archive b, default list should drop it.
    await app.inject({
      method: 'POST',
      url: `/analytics-areas/${b.json().id}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    const afterArch = await app.inject({
      method: 'GET',
      url: `/analytics-areas?managed_system_id=${ms1}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(afterArch.json().total).toBe(1);
    const incArch = await app.inject({
      method: 'GET',
      url: `/analytics-areas?managed_system_id=${ms1}&include_archived=true`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(incArch.json().total).toBe(2);

    // Review L3: belt-and-suspenders — assert ms2's rows are absent from
    // the ms1 filter (no cross-MS leak). Tenant isolation across MSs.
    const items = onlyMs1.json().items as Array<{ managed_system_id: string }>;
    expect(items.every((i) => i.managed_system_id === ms1)).toBe(true);
  });

  // ── review-followup tests ───────────────────────────────────────────

  it('Idempotency-Key reuse with different body → 409 conflict.idempotency_key_reuse (review C2)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-aaidem-ms', 'IdemHost');
    const key = randomUUID();
    const first = await app.inject({
      method: 'POST',
      url: '/analytics-areas',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: { managed_system_id: msId, slug: 'it-aaidem', name: 'first' },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/analytics-areas',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: { managed_system_id: msId, slug: 'it-aaidem', name: 'different body' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('conflict.idempotency_key_reuse');
  });

  it('archive of non-existent AA → 404 not_found.record (review H1)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'POST',
      url: `/analytics-areas/${randomUUID()}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  it('PATCH of non-existent AA → 404 not_found.record (review H1)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'PATCH',
      url: `/analytics-areas/${randomUUID()}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { name: 'whatever' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  it('non-admin POST → 403 permission.denied; no AA row, no audit row, no idempotency key (review H5)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, cookie, 'it-h5-ms', 'H5');
    const userCookie = await loginAs(app, 'mock-user-1');
    const key = randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/analytics-areas',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userCookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: { managed_system_id: msId, slug: 'it-h5-aa', name: 'denied' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
    const aaCount = await dbHandle.pool.query(
      `select count(*)::int as n from core.analytics_areas where slug = 'it-h5-aa'`,
    );
    expect(aaCount.rows[0]?.n).toBe(0);
    const audit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'analytics_area_registered' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    expect(audit.rows[0]?.n).toBe(0);
    const idem = await dbHandle.pool.query(
      `select count(*)::int as n from core.idempotency_keys where key = $1`,
      [key],
    );
    expect(idem.rows[0]?.n).toBe(0);
  });
});
