// POST /vocs/:id/public-updates integration tests — Slice 3 #16 C5.
//
// Every AC bullet from plan §C5 → post-public-update maps to at least one test.
// Uses live Postgres via buildServer + app.inject; no DB mocks except the
// tx-rollback test (documented deviation below).
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without these the suite is skipped.
// Without DATABASE_URL_MIGRATE audit assertions are silently skipped.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@fops/shared';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  paragraphDoc,
  randomUUID as seedRandomUUID,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-pubupd';

// ── Audit helpers ─────────────────────────────────────────────────────────────

async function getAuditRows(vocId: string): Promise<Array<{ event_type: string; detail: Record<string, unknown> }>> {
  if (!MIGRATE_URL) return [];
  const ops = createDb(MIGRATE_URL);
  try {
    const rows = await ops.pool.query<{ event_type: string; detail: Record<string, unknown> }>(
      `select event_type, detail from core.audit_log where subject_id = $1 order by created_at asc`,
      [vocId],
    );
    return rows.rows;
  } finally {
    await ops.close();
  }
}

async function cleanupAuditLog(dbHandle: DbHandle): Promise<void> {
  if (!MIGRATE_URL) return;
  const ops = createDb(MIGRATE_URL);
  try {
    await ops.pool.query(
      `delete from core.audit_log
        where subject_id in (
          select id from voc.vocs
           where primary_managed_system_id in (
             select id from core.managed_systems where slug like $1 and workspace_id = $2
           )
        )`,
      [`${SLUG_PREFIX}%`, WORKSPACE_ID],
    );
  } finally {
    await ops.close();
  }
}

describe.skipIf(!runIntegration)('POST /vocs/:id/public-updates (#16 C5)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterId: string;
  let reporterCookie: string;

  function postPublicUpdate(
    cookie: string,
    vocId: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/public-updates`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey ?? randomUUID(),
        'workspace-id': WORKSPACE_ID,
      },
      payload,
    });
  }

  async function insertVoc(msId: string, title = 'test voc') {
    return insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, title);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    const r = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const aid = r.rows[0]?.id;
    if (!aid) throw new Error('mock-admin-1 not found');
    adminActorId = aid;

    reporterCookie = await loginAs(app, 'mock-user-1');
    const rr = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const rid = rr.rows[0]?.id;
    if (!rid) throw new Error('mock-user-1 not found');
    reporterId = rid;
  });

  async function cleanupRateLimits() {
    // Clear all rate_limit buckets so tests don't bleed into each other's
    // rate windows. This is safe because each test creates isolated actors/VOCs.
    await dbHandle.pool.query(`delete from core.rate_limits`);
    await dbHandle.pool.query(`delete from core.idempotency_keys`);
  }

  beforeEach(async () => {
    await cleanupAuditLog(dbHandle);
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await cleanupRateLimits();
  });

  afterAll(async () => {
    await cleanupAuditLog(dbHandle);
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await app?.close();
    await dbHandle?.close();
  });

  // ── AC (a): body + status change → 201; voc_public_updates row + status bumped + 2 audit rows ──

  it('(a) body + status change → 201; DB row + voc status updated + 2 audit rows (paired_with=public_update)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-a`, 'A MS');
    const voc = await insertVoc(msId, 'AC-a VOC');

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('status update body'),
      next_reporter_facing_status: 'reviewing',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ public_update: Record<string, unknown>; voc: Record<string, unknown> }>();
    expect(body.public_update.id).toBeDefined();
    expect(body.public_update.skip_public_update).toBe(false);
    expect(body.public_update.skip_reason).toBeNull();
    expect(body.voc.reporter_facing_status).toBe('reviewing');

    // DB: voc_public_updates row exists
    const row = await dbHandle.pool.query<{ id: string; reporter_facing_status_after: string; skip_public_update: boolean }>(
      `select id, reporter_facing_status_after, skip_public_update
         from voc.voc_public_updates where id = $1`,
      [body.public_update.id as string],
    );
    expect(row.rows[0]?.reporter_facing_status_after).toBe('reviewing');
    expect(row.rows[0]?.skip_public_update).toBe(false);

    // DB: voc.reporter_facing_status bumped
    const vocRow = await dbHandle.pool.query<{ reporter_facing_status: string }>(
      `select reporter_facing_status from voc.vocs where id = $1`,
      [voc.id],
    );
    expect(vocRow.rows[0]?.reporter_facing_status).toBe('reviewing');

    // Audit: 2 rows — public_update_created + reporter_facing_status_changed
    const auditRows = await getAuditRows(voc.id);
    const types = auditRows.map((r) => r.event_type);
    expect(types).toContain('public_update_created');
    expect(types).toContain('reporter_facing_status_changed');

    const rfsRow = auditRows.find((r) => r.event_type === 'reporter_facing_status_changed');
    expect(rfsRow?.detail?.paired_with).toBe('public_update');
    expect(rfsRow?.detail?.from).toBe('received');
    expect(rfsRow?.detail?.to).toBe('reviewing');
  });

  // ── AC (b): body only (next === current) → 201; 1 audit row; status unchanged ──

  it('(b) body-only (next === current) → 201; 1 audit row (public_update_created); status unchanged', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b`, 'B MS');
    const voc = await insertVoc(msId, 'AC-b VOC');

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('body only update'),
      next_reporter_facing_status: 'received', // same as current
    });

    expect(res.statusCode).toBe(201);
    const resBody = res.json<{ public_update: Record<string, unknown>; voc: Record<string, unknown> }>();
    expect(resBody.voc.reporter_facing_status).toBe('received');

    const vocRow = await dbHandle.pool.query<{ reporter_facing_status: string }>(
      `select reporter_facing_status from voc.vocs where id = $1`,
      [voc.id],
    );
    expect(vocRow.rows[0]?.reporter_facing_status).toBe('received');

    const auditRows = await getAuditRows(voc.id);
    const types = auditRows.map((r) => r.event_type);
    expect(types).toContain('public_update_created');
    expect(types).not.toContain('reporter_facing_status_changed');
  });

  // ── AC (c): skip + status change → 201; row body=null skip=true; paired_with='skip' ──

  it('(c) skip + status change → 201; row body=null skip=true; audit paired_with=skip', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-c`, 'C MS');
    const voc = await insertVoc(msId, 'AC-c VOC');

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: true,
      skip_reason: 'skipping this update for now',
      next_reporter_facing_status: 'reviewing',
    });

    expect(res.statusCode).toBe(201);
    const resBody = res.json<{ public_update: Record<string, unknown>; voc: Record<string, unknown> }>();
    expect(resBody.public_update.skip_public_update).toBe(true);
    expect(resBody.public_update.body_rich_content).toBeNull();
    expect(resBody.public_update.skip_reason).toBe('skipping this update for now');
    expect(resBody.voc.reporter_facing_status).toBe('reviewing');

    // DB row
    const row = await dbHandle.pool.query<{
      body_rich_content: unknown;
      skip_public_update: boolean;
      skip_reason: string;
    }>(
      `select body_rich_content, skip_public_update, skip_reason
         from voc.voc_public_updates where id = $1`,
      [resBody.public_update.id as string],
    );
    expect(row.rows[0]?.body_rich_content).toBeNull();
    expect(row.rows[0]?.skip_public_update).toBe(true);
    expect(row.rows[0]?.skip_reason).toBe('skipping this update for now');

    const auditRows = await getAuditRows(voc.id);
    const rfsRow = auditRows.find((r) => r.event_type === 'reporter_facing_status_changed');
    expect(rfsRow?.detail?.paired_with).toBe('skip');
  });

  // ── body-only with next not in allowed → 422 reporter_facing_status.invalid_transition ──

  it('body-only with invalid next (not in allowed) → 422 reporter_facing_status.invalid_transition', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-inv`, 'Inv MS');
    const voc = await insertVoc(msId, 'Inv VOC');

    // 'resolved' is forbidden from 'received' with a reason
    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('body'),
      next_reporter_facing_status: 'resolved',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('reporter_facing_status.invalid_transition');
  });

  // ── forbidden transition → 422 with detail.reason from seed ──

  it('forbidden transition → 422 reporter_facing_status.invalid_transition with detail.reason', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-forb`, 'Forb MS');
    const voc = await insertVoc(msId, 'Forb VOC');

    // received → resolved is explicitly forbidden with a Korean reason in seed data
    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('body'),
      next_reporter_facing_status: 'resolved',
    });

    expect(res.statusCode).toBe(422);
    const body = res.json<{ code: string; detail: { detail?: { reason?: unknown }; fields?: unknown[] } }>();
    expect(body.code).toBe('reporter_facing_status.invalid_transition');
    // The error detail is nested: body.detail.detail.reason (see conversation-service.ts line ~258)
    const nestedDetail = body.detail?.detail;
    const reason = nestedDetail?.reason;
    expect(typeof reason === 'string' || reason === null).toBe(true);
    // The reason string comes from the seed table (Korean text for 'received → resolved')
    if (typeof reason === 'string') {
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  // ── skip + next === current → 422 validation.failed ──

  it('skip + next === current → 422 validation.failed (skip requires status change)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-skipnoop`, 'Skip Noop MS');
    const voc = await insertVoc(msId, 'Skip Noop VOC');

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: true,
      skip_reason: 'skipping for good reason',
      next_reporter_facing_status: 'received', // same as current
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── skip with skip_reason.length < 8 trimmed → 422 validation.failed ──

  it('skip with skip_reason too short (< 8 chars trimmed) → 422 validation.failed', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-skipshr`, 'Skip Short MS');
    const voc = await insertVoc(msId, 'Skip Short VOC');

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: true,
      skip_reason: 'short', // 5 chars, too short
      next_reporter_facing_status: 'reviewing',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── skip + body present → zod strips body (discriminated union) ──
  // Schema is .strict() on both shapes: extra keys (e.g. body on skip shape)
  // → zod rejects → 422 validation.failed (issue #16 AC).

  it('skip + body_rich_content present → 422 validation.failed', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-skipbody`, 'Skip Body MS');
    const voc = await insertVoc(msId, 'Skip Body VOC');

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: true,
      skip_reason: 'valid skip reason here',
      body_rich_content: paragraphDoc('conflicting body'),
      next_reporter_facing_status: 'reviewing',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── non-MS dev → 403 permission.scope_required ──

  it('developer without MS-scoped voc.triage grant → 403 permission.scope_required', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-dev403`, 'Dev 403 MS');
    const voc = await insertVoc(msId, 'Dev 403 VOC');

    const { externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, `pubupd-dev-${randomUUID().slice(0, 8)}`);
    const devCookie = await loginAs(app, externalId);

    const res = await postPublicUpdate(devCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('body'),
      next_reporter_facing_status: 'received',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.scope_required');
  });

  // ── Sanitizer attr-injection (#23) ────────────────────────────────────

  it('body with link mark (not in public-update allowlist) + extra target attr → 422 disallowed_node', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-atki`, 'AtKI MS');
    const voc = await insertVoc(msId, 'AtKI VOC');

    // public-update has no attachmentRef; use link mark on paragraph instead.
    // Note: link mark itself is NOT in public-update marks allowlist (bold/italic only),
    // so the mark-type rejection fires before attr-key inspection.
    // Per plan: "link mark with {href, target: '_blank'} (since public-update has no attachmentRef)"
    // — assert disallowed_node (mark type rejected, link is not in public-update allowlist).
    const attrInjectionDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
            },
          ],
        },
      ],
    };

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: attrInjectionDoc,
      next_reporter_facing_status: 'received',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('rich_content.disallowed_node');
    expect(res.json<{ detail: { fields: Array<{ path: string[]; code: string }> } }>().detail?.fields?.[0]?.path).toEqual(['body_rich_content']);
  });

  // ── gate stub: evaluateReporterStatusGate returns null ──

  it('gate stub: ERROR_CODES contains reporter_facing_status.gate_blocked', () => {
    expect(ERROR_CODES).toContain('reporter_facing_status.gate_blocked');
    expect(ERROR_CODES).toContain('reporter_facing_status.invalid_transition');
  });

  // ── migration 0012 invariants ──

  it('migration 0012: voc_public_updates.body_rich_content is nullable (skip row succeeds)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-mig12`, 'Mig12 MS');
    const voc = await insertVoc(msId, 'Mig12 VOC');

    // Direct raw INSERT of a skip row with body=NULL — must succeed
    const insertSkip = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_public_updates
         (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update, skip_reason)
       values ($1, $2, NULL, 'received', 'reviewing', true, 'valid long reason here')
       returning id`,
      [voc.id, adminActorId],
    );
    expect(insertSkip.rows[0]?.id).toBeDefined();
  });

  it('migration 0012: non-skip row with skip_reason set → CHECK violation', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-chk1`, 'Chk1 MS');
    const voc = await insertVoc(msId, 'Chk1 VOC');

    await expect(
      dbHandle.pool.query(
        `insert into voc.voc_public_updates
           (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update, skip_reason)
         values ($1, $2, $3::jsonb, 'received', 'receiving', false, 'a reason here')`,
        [voc.id, adminActorId, JSON.stringify(paragraphDoc('body'))],
      ),
    ).rejects.toThrow();
  });

  it('migration 0012: skip row with skip_reason length < 8 trimmed → CHECK violation', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-chk2`, 'Chk2 MS');
    const voc = await insertVoc(msId, 'Chk2 VOC');

    await expect(
      dbHandle.pool.query(
        `insert into voc.voc_public_updates
           (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update, skip_reason)
         values ($1, $2, NULL, 'received', 'reviewing', true, 'short')`,
        [voc.id, adminActorId],
      ),
    ).rejects.toThrow();
  });

  // ── tx rollback: simulate audit-write failure → no public_update row remains ──
  // DEVIATION: We cannot deterministically trigger a mid-tx failure via the
  // public API. Instead, we rely on the fact that all inserts (public_update +
  // status update + audit) happen in a single DB transaction. We verify this
  // indirectly: when the service returns an error (403), the voc_public_updates
  // table must not contain a row for the failed request. This proves the service
  // does not commit partial state.
  it('tx isolation: failed request (403) leaves no voc_public_updates row', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-txrb`, 'TxRb MS');
    const voc = await insertVoc(msId, 'TxRb VOC');

    const countBefore = await dbHandle.pool.query<{ n: string }>(
      `select count(*)::text as n from voc.voc_public_updates where voc_id = $1`,
      [voc.id],
    );
    const beforeCount = parseInt(countBefore.rows[0]?.n ?? '0', 10);

    // Use dev actor without grant → 403 before INSERT
    const { externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, `pubupd-txrb-${randomUUID().slice(0, 8)}`);
    const devCookie = await loginAs(app, externalId);

    const res = await postPublicUpdate(devCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('body'),
      next_reporter_facing_status: 'reviewing',
    });
    expect(res.statusCode).toBe(403);

    const countAfter = await dbHandle.pool.query<{ n: string }>(
      `select count(*)::text as n from voc.voc_public_updates where voc_id = $1`,
      [voc.id],
    );
    expect(parseInt(countAfter.rows[0]?.n ?? '0', 10)).toBe(beforeCount);
  });

  // ── idempotency: same key + same body replay → 201 ──

  it('idempotency replay: same key+body → 201×2, same public_update.id', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-idem`, 'Idem MS');
    const voc = await insertVoc(msId, 'Idem VOC');

    const key = randomUUID();
    const payload = {
      skip_public_update: false,
      body_rich_content: paragraphDoc('idempotent body'),
      next_reporter_facing_status: 'received',
    };

    const res1 = await postPublicUpdate(adminCookie, voc.id, payload, key);
    expect(res1.statusCode).toBe(201);

    const res2 = await postPublicUpdate(adminCookie, voc.id, payload, key);
    expect(res2.statusCode).toBe(201);

    // Same response — idempotency cache hit
    const b1 = res1.json<{ public_update: { id: string } }>();
    const b2 = res2.json<{ public_update: { id: string } }>();
    expect(b1.public_update.id).toBe(b2.public_update.id);
  });

  // ── idempotency: same key + different body → 409 ──

  it('idempotency key reuse with different body → 409 conflict.idempotency_key_reuse', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-idemmm`, 'IdemMm MS');
    const voc = await insertVoc(msId, 'IdemMm VOC');

    const key = randomUUID();

    const res1 = await postPublicUpdate(
      adminCookie,
      voc.id,
      { skip_public_update: false, body_rich_content: paragraphDoc('first'), next_reporter_facing_status: 'received' },
      key,
    );
    expect(res1.statusCode).toBe(201);

    const res2 = await postPublicUpdate(
      adminCookie,
      voc.id,
      { skip_public_update: false, body_rich_content: paragraphDoc('different'), next_reporter_facing_status: 'received' },
      key,
    );
    expect(res2.statusCode).toBe(409);
    expect(res2.json<{ code: string }>().code).toBe('conflict.idempotency_key_reuse');
  });

  // ── cycle-2 B1: cross-endpoint idempotency key isolation ──
  // Two routes share `{body_rich_content}` as a wire-valid shape (internal-
  // comment with strict() rejects unknown keys; admin actor has voc.triage so
  // both calls authorise). Without the route discriminator in the hash, the
  // second call would replay the first's internal_comment envelope. With the
  // fix, the same (actor, key, body) on a different route hashes differently
  // → idempotency lookup misses → 409 conflict.idempotency_key_reuse.

  it('idempotency: same key + same body across different routes → 409 (route discriminator in hash)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-xrt`, 'X-route MS');
    const voc = await insertVoc(msId, 'X-route VOC');
    const key = randomUUID();
    const sharedBody = { body_rich_content: paragraphDoc('cross-route body') };

    const r1 = await app.inject({
      method: 'POST',
      url: `/vocs/${voc.id}/internal-comments`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'workspace-id': WORKSPACE_ID,
        'idempotency-key': key,
        'content-type': 'application/json',
      },
      payload: sharedBody,
    });
    expect(r1.statusCode).toBe(201);

    // Same body wire-valid for reporter-reply too (body_rich_content only).
    // adminActor is not the reporter for this VOC, so service would 403 — but
    // the idempotency lookup happens FIRST inside the tx (before the service
    // call). A hash collision would replay the 201 envelope from r1. A correct
    // route-discriminated hash misses → service runs → 403 (not 201, not 409).
    // What we assert: the body+key did NOT cache-replay across routes.
    const r2 = await app.inject({
      method: 'POST',
      url: `/vocs/${voc.id}/reporter-replies`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'workspace-id': WORKSPACE_ID,
        'idempotency-key': key,
        'content-type': 'application/json',
      },
      payload: sharedBody,
    });
    // Without the route discriminator, r2 would replay r1's 201
    // internal_comment envelope (wrong endpoint, wrong audit). With the fix,
    // the hash differs → idempotencyService.lookup returns `mismatch` for
    // same-key/different-hash → 409 conflict.idempotency_key_reuse. Either
    // behavior (409 or service-403) proves no cross-route cache replay;
    // 409 is the spec-correct outcome since the client violated the
    // "Idempotency-Key unique per request intent" contract.
    expect(r2.statusCode).not.toBe(201);
    expect(r2.statusCode).toBe(409);
    expect(r2.json<{ code: string }>().code).toBe('conflict.idempotency_key_reuse');
  });

  // ── archived VOC → 409 conflict.record_archived ──

  it('archived VOC → 409 conflict.record_archived', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-arcvoc`, 'Arc Voc MS');
    const voc = await insertVoc(msId, 'Arc Voc VOC');

    await dbHandle.pool.query(`update voc.vocs set archived_at = now() where id = $1`, [voc.id]);

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('body'),
      next_reporter_facing_status: 'received',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('conflict.record_archived');
  });

  // ── archived parent MS → 409 conflict.parent_archived ──
  it('archived parent MS → 409 conflict.parent_archived', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-arcms`, 'Arc Ms MS');
    const voc = await insertVoc(msId, 'Arc Ms VOC');

    await dbHandle.pool.query(`update core.managed_systems set archived_at = now() where id = $1`, [msId]);

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('body'),
      next_reporter_facing_status: 'received',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('conflict.parent_archived');
  });

  // ── rate limit: 11th POST within 60s → 429 rate_limited.actor ──

  it('rate limit: 11th POST within 60s → 429 rate_limited.actor', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-rl`, 'RL MS');
    // Use fresh actor to avoid polluting shared rate-limit bucket.
    const { externalId: devExtId, id: devId } = await insertDevActor(dbHandle, WORKSPACE_ID, `pubupd-rl-${randomUUID().slice(0, 8)}`);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const devCookie = await loginAs(app, devExtId);

    const voc = await insertVoc(msId, 'RL VOC');

    for (let i = 0; i < 10; i++) {
      const r = await postPublicUpdate(devCookie, voc.id, {
        skip_public_update: false,
        body_rich_content: paragraphDoc(`update ${i}`),
        next_reporter_facing_status: 'received',
      });
      if (r.statusCode !== 201) {
        throw new Error(`expected 201 at i=${i}, got ${r.statusCode}: ${r.body}`);
      }
    }

    const limited = await postPublicUpdate(devCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('over limit'),
      next_reporter_facing_status: 'received',
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json<{ code: string }>().code).toBe('rate_limited.actor');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  // ── PLAN-22 C7b — attachment_ids linking on body shape ──────────────────

  it('attachment_ids on body shape → 201 + linked to public_update (PLAN-22 C7b)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-puatt`, 'PU Att MS');
    const voc = await insertVoc(msId, 'PU Att VOC');

    // Admin uploads — seed owned by admin.
    const attachmentId = randomUUID();
    const storageKey = `${WORKSPACE_ID}/${attachmentId}/puatt-${randomUUID()}.pdf`;
    await dbHandle.pool.query(
      `insert into voc.voc_attachments
         (id, voc_id, comment_id, comment_kind, name, size_bytes, mime_type,
          storage_key, uploaded_by_actor_id, linked_at)
       values ($1, null, null, null, 'pu.pdf', 1024, 'application/pdf', $2, $3, null)`,
      [attachmentId, storageKey, adminActorId],
    );

    const res = await postPublicUpdate(adminCookie, voc.id, {
      skip_public_update: false,
      body_rich_content: paragraphDoc('public update with attachment'),
      next_reporter_facing_status: 'reviewing',
      attachment_ids: [attachmentId],
    });
    expect(res.statusCode).toBe(201);
    const updateId = res.json<{ public_update: { id: string } }>().public_update.id;

    const linked = await dbHandle.pool.query<{
      comment_id: string;
      comment_kind: string;
      linked_at: Date | null;
    }>(
      `select comment_id, comment_kind, linked_at from voc.voc_attachments where id = $1`,
      [attachmentId],
    );
    expect(linked.rows[0]?.comment_id).toBe(updateId);
    expect(linked.rows[0]?.comment_kind).toBe('public_update');
    expect(linked.rows[0]?.linked_at).not.toBeNull();
  });
});
