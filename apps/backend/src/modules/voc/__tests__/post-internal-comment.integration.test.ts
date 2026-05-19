// POST /vocs/:id/internal-comments integration tests — Slice 3 #16 C5.
//
// Every AC bullet from plan §C5 → post-internal-comment maps to at least one test.
// Uses live Postgres via buildServer + app.inject; no DB mocks.
//
// Gate: DATABASE_URL + WORKSPACE_ID.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-intcmnt';

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

/** Build a TipTap doc with one mention node referencing actor_id */
function mentionDoc(actorId: string, text = 'hi') {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text },
          { type: 'mention', attrs: { actor_id: actorId } },
        ],
      },
    ],
  };
}

/** Build a TipTap doc with two mention nodes */
function twoMentionDoc(actorId1: string, actorId2: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello ' },
          { type: 'mention', attrs: { actor_id: actorId1 } },
          { type: 'text', text: ' and ' },
          { type: 'mention', attrs: { actor_id: actorId2 } },
        ],
      },
    ],
  };
}

describe.skipIf(!runIntegration)('POST /vocs/:id/internal-comments (#16 C5)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterCookie: string;
  let reporterId: string;

  function postInternalComment(
    cookie: string,
    vocId: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/internal-comments`,
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
    await dbHandle.pool.query(`delete from core.rate_limits`);
    await dbHandle.pool.query(`delete from core.idempotency_keys`);
  }

  // Remove any MS-scoped grants for the reporter (mock-user-1) that were
  // granted during tests. cleanupReadTestTables only removes grants for
  // mock-dev-read-% actors. Without this, deleting MSs fails on FK constraint.
  async function cleanupReporterGrants() {
    if (!reporterId) return;
    await dbHandle.pool.query(
      `delete from permission.permission_grants
        where actor_id = $1
          and managed_system_id in (
            select id from core.managed_systems where slug like $2 and workspace_id = $3
          )`,
      [reporterId, `${SLUG_PREFIX}%`, WORKSPACE_ID],
    );
  }

  beforeEach(async () => {
    await cleanupAuditLog(dbHandle);
    await cleanupReporterGrants();
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await cleanupRateLimits();
  });

  afterAll(async () => {
    await cleanupAuditLog(dbHandle);
    await cleanupReporterGrants();
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await app?.close();
    await dbHandle?.close();
  });

  // ── Admin → 201 ──

  it('admin → 201; internal_comment row + audit internal_comment_created', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-admin`, 'Admin MS');
    const voc = await insertVoc(msId, 'Admin VOC');

    const res = await postInternalComment(adminCookie, voc.id, {
      body_rich_content: paragraphDoc('admin internal comment'),
      mentions: [],
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ internal_comment: Record<string, unknown> }>();
    expect(body.internal_comment.id).toBeDefined();
    expect(body.internal_comment.actor_id).toBe(adminActorId);

    const row = await dbHandle.pool.query<{ id: string }>(
      `select id from voc.voc_internal_comments where id = $1`,
      [body.internal_comment.id as string],
    );
    expect(row.rows[0]?.id).toBeDefined();

    const auditRows = await getAuditRows(voc.id);
    expect(auditRows.map((r) => r.event_type)).toContain('internal_comment_created');
  });

  // ── Same-MS dev (with voc.triage grant) → 201 ──

  it('same-MS dev with voc.triage grant → 201', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-devok`, 'Dev OK MS');
    const voc = await insertVoc(msId, 'Dev OK VOC');

    const { externalId, id: devId } = await insertDevActor(dbHandle, WORKSPACE_ID, `intcmnt-dev-${randomUUID().slice(0, 8)}`);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await postInternalComment(devCookie, voc.id, {
      body_rich_content: paragraphDoc('dev comment'),
      mentions: [],
    });

    expect(res.statusCode).toBe(201);
  });

  // ── Cross-MS dev → 403 permission.scope_required ──

  it('cross-MS dev (grant on different MS) → 403 permission.scope_required', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-devscope`, 'Dev Scope MS');
    const otherMsId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-devscope2`, 'Dev Scope2 MS');
    const voc = await insertVoc(msId, 'Dev Scope VOC');

    const { externalId, id: devId } = await insertDevActor(dbHandle, WORKSPACE_ID, `intcmnt-cross-${randomUUID().slice(0, 8)}`);
    // Grant on OTHER MS, not the one with the VOC
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', otherMsId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await postInternalComment(devCookie, voc.id, {
      body_rich_content: paragraphDoc('cross MS dev comment'),
      mentions: [],
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.scope_required');
  });

  // ── Non-triage actor (plain user / reporter without grant) → 403 permission.denied ──

  it('plain user (reporter without voc.triage grant) → 403 permission.denied', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-plain`, 'Plain MS');
    const voc = await insertVoc(msId, 'Plain VOC');

    // reporter does not have voc.triage
    const res = await postInternalComment(reporterCookie, voc.id, {
      body_rich_content: paragraphDoc('reporter trying to comment'),
      mentions: [],
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });

  // ── Reporter who ALSO holds voc.triage on the MS → 201 (codex cycle-1 BLOCKER fix) ──

  it('reporter who also holds voc.triage on MS → 201 (reporter identity not a deny condition)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-reptriage`, 'Rep Triage MS');
    // reporter_id IS reporterId (mock-user-1)
    const voc = await insertVoc(msId, 'Rep Triage VOC');

    // Grant voc.triage to the reporter on this MS
    await grantCapability(dbHandle, WORKSPACE_ID, reporterId, 'voc.triage', msId, adminActorId);

    const res = await postInternalComment(reporterCookie, voc.id, {
      body_rich_content: paragraphDoc('reporter with triage grant'),
      mentions: [],
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ internal_comment: Record<string, unknown> }>();
    expect(body.internal_comment.actor_id).toBe(reporterId);
  });

  // ── mentions: [] + no mention nodes → 201; audit mentions: [] ──

  it('mentions: [] + no mention nodes → 201; audit internal_comment_created with mentions: []', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-nomention`, 'No Mention MS');
    const voc = await insertVoc(msId, 'No Mention VOC');

    const res = await postInternalComment(adminCookie, voc.id, {
      body_rich_content: paragraphDoc('no mentions here'),
      mentions: [],
    });

    expect(res.statusCode).toBe(201);

    const auditRows = await getAuditRows(voc.id);
    const commentRow = auditRows.find((r) => r.event_type === 'internal_comment_created');
    expect(commentRow?.detail?.mentions).toEqual([]);
  });

  // ── mentions: [validUuid] + body mention node → 201 ──

  it('mentions: [validUuid] + body mention node with same actor_id → 201', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-mention1`, 'Mention1 MS');
    const voc = await insertVoc(msId, 'Mention1 VOC');

    const res = await postInternalComment(adminCookie, voc.id, {
      body_rich_content: mentionDoc(adminActorId, 'hi '),
      mentions: [adminActorId],
    });

    expect(res.statusCode).toBe(201);
  });

  // ── mentions: [a,b] + body mention nodes {a} only → 422 validation.failed ──
  // mentions[] has extra entry not in body

  it('mentions: [a,b] + body mention nodes {a} only → 422 validation.failed (set-equality, mentions[] extra)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-mextra`, 'MExtra MS');
    const voc = await insertVoc(msId, 'MExtra VOC');

    // Insert a second valid actor to use as extra mention
    const { id: devId2 } = await insertDevActor(dbHandle, WORKSPACE_ID, `intcmnt-m2-${randomUUID().slice(0, 8)}`);

    const res = await postInternalComment(adminCookie, voc.id, {
      // body only has adminActorId mention
      body_rich_content: mentionDoc(adminActorId, 'single mention '),
      mentions: [adminActorId, devId2], // extra devId2 not in body
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── mentions: [a] + body mention nodes {a,b} → 422 validation.failed ──
  // body has extra mention not in mentions[]

  it('mentions: [a] + body mention nodes {a,b} → 422 validation.failed (set-equality, body extra)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-bextra`, 'BExtra MS');
    const voc = await insertVoc(msId, 'BExtra VOC');

    const { id: devId2 } = await insertDevActor(dbHandle, WORKSPACE_ID, `intcmnt-b2-${randomUUID().slice(0, 8)}`);

    const res = await postInternalComment(adminCookie, voc.id, {
      // body has TWO mention nodes
      body_rich_content: twoMentionDoc(adminActorId, devId2),
      mentions: [adminActorId], // missing devId2
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── cross-workspace mention uuid → 422 validation.failed ──

  it('mentions: [randomUuid not in workspace] → 422 validation.failed (cross-workspace)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-cwmention`, 'CwMention MS');
    const voc = await insertVoc(msId, 'CwMention VOC');

    const crossWorkspaceId = randomUUID(); // doesn't exist in workspace

    const res = await postInternalComment(adminCookie, voc.id, {
      body_rich_content: mentionDoc(crossWorkspaceId, 'cross workspace '),
      mentions: [crossWorkspaceId],
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── Idempotency replay ──

  it('idempotency replay: same key+body → 201×2, same internal_comment.id', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-idem`, 'Idem MS');
    const voc = await insertVoc(msId, 'Idem VOC');

    const key = randomUUID();
    const payload = { body_rich_content: paragraphDoc('idempotent comment'), mentions: [] };

    const res1 = await postInternalComment(adminCookie, voc.id, payload, key);
    expect(res1.statusCode).toBe(201);

    const res2 = await postInternalComment(adminCookie, voc.id, payload, key);
    expect(res2.statusCode).toBe(201);

    const b1 = res1.json<{ internal_comment: { id: string } }>();
    const b2 = res2.json<{ internal_comment: { id: string } }>();
    expect(b1.internal_comment.id).toBe(b2.internal_comment.id);
  });

  // ── Archived VOC → 409 ──

  it('archived VOC → 409 conflict.record_archived', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-arcvoc`, 'Arc Voc MS');
    const voc = await insertVoc(msId, 'Arc Voc VOC');

    await dbHandle.pool.query(`update voc.vocs set archived_at = now() where id = $1`, [voc.id]);

    const res = await postInternalComment(adminCookie, voc.id, {
      body_rich_content: paragraphDoc('comment on archived'),
      mentions: [],
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('conflict.record_archived');
  });

  // ── Rate limit: 11th POST within 60s → 429 ──

  it('rate limit: 11th POST within 60s → 429 rate_limited.actor', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-rl`, 'RL MS');
    // Fresh dev actor with grant to avoid polluting admin's bucket
    const { externalId, id: devId } = await insertDevActor(dbHandle, WORKSPACE_ID, `intcmnt-rl-${randomUUID().slice(0, 8)}`);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const voc = await insertVoc(msId, 'RL VOC');

    for (let i = 0; i < 10; i++) {
      const r = await postInternalComment(devCookie, voc.id, {
        body_rich_content: paragraphDoc(`comment ${i}`),
        mentions: [],
      });
      if (r.statusCode !== 201) {
        throw new Error(`expected 201 at i=${i}, got ${r.statusCode}: ${r.body}`);
      }
    }

    const limited = await postInternalComment(devCookie, voc.id, {
      body_rich_content: paragraphDoc('over limit'),
      mentions: [],
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json<{ code: string }>().code).toBe('rate_limited.actor');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
