// POST /vocs/:id/reporter-replies integration tests — Slice 3 #16 C5.
//
// Every AC bullet from plan §C5 → post-reporter-reply maps to at least one test.
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

const SLUG_PREFIX = 'it-reptreply';

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

describe.skipIf(!runIntegration)('POST /vocs/:id/reporter-replies (#16 C5)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterCookie: string;
  let reporterId: string;

  function postReporterReply(
    cookie: string,
    vocId: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/reporter-replies`,
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

  // ── Reporter on own VOC → 201; audit row ──

  it('reporter on own VOC → 201; reporter_reply row + audit reporter_reply_created', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-happy`, 'Happy MS');
    const voc = await insertVoc(msId, 'Happy VOC');

    const res = await postReporterReply(reporterCookie, voc.id, {
      body_rich_content: paragraphDoc('reporter reply body'),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ reporter_reply: Record<string, unknown>; voc: Record<string, unknown> }>();
    expect(body.reporter_reply.id).toBeDefined();
    expect(body.reporter_reply.actor_id).toBe(reporterId);
    expect(body.reporter_reply.voc_id).toBe(voc.id);

    // DB row
    const row = await dbHandle.pool.query<{ id: string; actor_id: string }>(
      `select id, actor_id from voc.voc_reporter_replies where id = $1`,
      [body.reporter_reply.id as string],
    );
    expect(row.rows[0]?.actor_id).toBe(reporterId);

    // Audit
    const auditRows = await getAuditRows(voc.id);
    const types = auditRows.map((r) => r.event_type);
    expect(types).toContain('reporter_reply_created');
  });

  // ── Non-reporter → 403 permission.denied ──

  it('non-reporter (admin) posting reply → 403 permission.denied', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-nonrep`, 'NonRep MS');
    const voc = await insertVoc(msId, 'NonRep VOC');

    const res = await postReporterReply(adminCookie, voc.id, {
      body_rich_content: paragraphDoc('admin trying to reply'),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });

  // ── DB trigger defense-in-depth: direct repo call with wrong actor ──
  // We bypass the service guard by directly inserting with a wrong actor via raw SQL.
  // The trigger enforce_reporter_reply_actor must fire and reject the insert.
  // This verifies the trigger is active. The service's catch block maps this to
  // 403 permission.denied. But since we're testing via SQL here, we just assert
  // the DB trigger fires and throws.

  it('DB trigger defense-in-depth: INSERT with actor != reporter → trigger rejects', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-trig`, 'Trig MS');
    const voc = await insertVoc(msId, 'Trig VOC');

    // Try direct SQL insert with adminActorId (not the reporter)
    await expect(
      dbHandle.pool.query(
        `insert into voc.voc_reporter_replies (voc_id, actor_id, body_rich_content)
         values ($1, $2, $3::jsonb)`,
        [voc.id, adminActorId, JSON.stringify(paragraphDoc('trigger bypass attempt'))],
      ),
    ).rejects.toThrow(/reporter/i);
  });

  // ── attachments: [{...}] → 422 attachment.unsupported_pending_storage_slice ──

  it('attachments: [{...}] → 422 attachment.unsupported_pending_storage_slice', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-att`, 'Att MS');
    const voc = await insertVoc(msId, 'Att VOC');

    const res = await postReporterReply(reporterCookie, voc.id, {
      body_rich_content: paragraphDoc('body'),
      attachments: [{ id: randomUUID(), filename: 'file.pdf', mime_type: 'application/pdf', size_bytes: 1024 }],
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('attachment.unsupported_pending_storage_slice');
  });

  // ── attachments: [] → 201 ──

  it('attachments: [] → 201 (empty array accepted)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-attemt`, 'Att Empty MS');
    const voc = await insertVoc(msId, 'Att Empty VOC');

    const res = await postReporterReply(reporterCookie, voc.id, {
      body_rich_content: paragraphDoc('body with empty attachments'),
      attachments: [],
    });

    expect(res.statusCode).toBe(201);
  });

  // ── body containing attachmentRef node → 422 ──

  it('body with attachmentRef node → 422 attachment.unsupported_pending_storage_slice', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-attref`, 'AttRef MS');
    const voc = await insertVoc(msId, 'AttRef VOC');

    const bodyWithRef = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'see attachment:' }] },
        { type: 'attachmentRef', attrs: { id: randomUUID() } },
      ],
    };

    const res = await postReporterReply(reporterCookie, voc.id, {
      body_rich_content: bodyWithRef,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('attachment.unsupported_pending_storage_slice');
  });

  // ── Sanitizer attr-injection (#23) ────────────────────────────────────

  it('body with attachmentRef.attrs disallowed_attr_key → 422 disallowed_attr_key', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-atki`, 'AtKI MS');
    const voc = await insertVoc(msId, 'AtKI VOC');

    const attrInjectionDoc = {
      type: 'doc',
      content: [
        {
          type: 'attachmentRef',
          attrs: { id: randomUUID(), onclick: 'x' },
        },
      ],
    };

    const res = await postReporterReply(reporterCookie, voc.id, {
      body_rich_content: attrInjectionDoc,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('rich_content.disallowed_node');
    expect(res.json<{ detail: { fields: Array<{ path: string[]; code: string }> } }>().detail?.fields?.[0]?.path).toEqual(['body_rich_content']);
    expect(res.json<{ detail: { fields: Array<{ path: string[]; code: string }> } }>().detail?.fields?.[0]?.code).toBe('disallowed_attr_key');
    expect(res.json<{ detail: { hint: string } }>().detail?.hint).toMatch(/attrs\.onclick$/);
  });

  // ── Status field on envelope unchanged after reply ──

  it('reporter_facing_status on voc envelope unchanged after reply', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-status`, 'Status MS');
    const voc = await insertVoc(msId, 'Status VOC');

    const res = await postReporterReply(reporterCookie, voc.id, {
      body_rich_content: paragraphDoc('reply body'),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ voc: { reporter_facing_status: string } }>();
    expect(body.voc.reporter_facing_status).toBe('received'); // unchanged
  });

  // ── Idempotency replay ──

  it('idempotency replay: same key+body → 201×2, same reporter_reply.id', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-idem`, 'Idem MS');
    const voc = await insertVoc(msId, 'Idem VOC');

    const key = randomUUID();
    const payload = { body_rich_content: paragraphDoc('idempotent reply') };

    const res1 = await postReporterReply(reporterCookie, voc.id, payload, key);
    expect(res1.statusCode).toBe(201);

    const res2 = await postReporterReply(reporterCookie, voc.id, payload, key);
    expect(res2.statusCode).toBe(201);

    const b1 = res1.json<{ reporter_reply: { id: string } }>();
    const b2 = res2.json<{ reporter_reply: { id: string } }>();
    expect(b1.reporter_reply.id).toBe(b2.reporter_reply.id);
  });

  // ── Archived VOC → 409 ──

  it('archived VOC → 409 conflict.record_archived', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-arcvoc`, 'Arc Voc MS');
    const voc = await insertVoc(msId, 'Arc Voc VOC');

    await dbHandle.pool.query(`update voc.vocs set archived_at = now() where id = $1`, [voc.id]);

    const res = await postReporterReply(reporterCookie, voc.id, {
      body_rich_content: paragraphDoc('reply on archived'),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('conflict.record_archived');
  });

  // ── Rate limit: 11th POST within 60s → 429 ──

  it('rate limit: 11th POST within 60s → 429 rate_limited.actor', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-rl`, 'RL MS');
    // Fresh reporter actor to avoid polluting shared rate-limit bucket.
    // Must be role=user type to act as reporter (the VOC reporter_id must match).
    // We insert a user-role actor directly.
    const freshReporterExtId = `mock-user-rrl-${randomUUID().slice(0, 8)}`;
    const insertRes = await dbHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $4, 'user', 'internal_member')
         on conflict (workspace_id, external_id) do update set email = excluded.email
         returning id`,
      [WORKSPACE_ID, freshReporterExtId, `rl-reporter-${randomUUID().slice(0, 8)}@local`, 'RL Reporter'],
    );
    const freshReporterId = insertRes.rows[0]?.id;
    if (!freshReporterId) throw new Error('failed to insert fresh reporter');

    const freshCookie = await loginAs(app, freshReporterExtId);
    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, freshReporterId, 'RL VOC');

    for (let i = 0; i < 10; i++) {
      const r = await postReporterReply(freshCookie, voc.id, {
        body_rich_content: paragraphDoc(`reply ${i}`),
      });
      if (r.statusCode !== 201) {
        throw new Error(`expected 201 at i=${i}, got ${r.statusCode}: ${r.body}`);
      }
    }

    const limited = await postReporterReply(freshCookie, voc.id, {
      body_rich_content: paragraphDoc('over limit'),
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json<{ code: string }>().code).toBe('rate_limited.actor');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
