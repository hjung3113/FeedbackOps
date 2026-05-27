// GET /vocs/:id + GET /vocs/:id/conversation — linked attachments coverage.
// PLAN-22 §Bug-1 (2026-05-22).
//
// The detail envelope must include `attachments: LinkedAttachment[]` for the
// VOC body, and each `conversation_timeline[]` entry must carry its own
// `attachments: LinkedAttachment[]`. Archived rows are excluded.
//
// Gate: DATABASE_URL + WORKSPACE_ID. Skipped without these (mirrors the
// other integration suites in this folder).

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertInternalComment,
  insertLinkedAttachment,
  insertMsDirectly,
  insertPublicUpdate,
  insertReporterReply,
  insertVocDirectly,
  loginAs,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-getatt';

describe.skipIf(!runIntegration)('GET /vocs/:id + /conversation attachments (PLAN-22 §Bug-1)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const ra = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const aid = ra.rows[0]?.id;
    if (!aid) throw new Error('mock-admin-1 not found');
    adminActorId = aid;
    await loginAs(app, 'mock-user-1'); // ensure reporter session exists for cleanup parity
    const rr = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const rid = rr.rows[0]?.id;
    if (!rid) throw new Error('mock-user-1 not found');
    reporterId = rid;
  });

  beforeEach(async () => {
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  });

  afterAll(async () => {
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await app?.close();
    await dbHandle?.close();
  });

  async function makeVoc(title: string): Promise<{ id: string; msId: string }> {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), `MS ${title}`);
    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, title);
    return { id: voc.id, msId };
  }

  // ── B1.1: VOC-body attachments[] present and shaped ───────────────────────
  it('returns attachments[] for a VOC with linked rows', async () => {
    const { id: vocId } = await makeVoc('Body attachments');
    const a1 = await insertLinkedAttachment(dbHandle, WORKSPACE_ID, { kind: 'voc', vocId }, adminActorId, {
      name: 'one.png',
      sizeBytes: 11,
    });
    const a2 = await insertLinkedAttachment(dbHandle, WORKSPACE_ID, { kind: 'voc', vocId }, adminActorId, {
      name: 'two.pdf',
      sizeBytes: 22,
      mimeType: 'application/pdf',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ attachments: Array<{ id: string; name: string; size_bytes: number; mime_type: string; uploaded_by_actor_id: string; created_at: string; linked_at: string }>; attachment_count: number }>();
    expect(Array.isArray(body.attachments)).toBe(true);
    const ids = body.attachments.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([a1.id, a2.id]));
    expect(body.attachment_count).toBe(2);
    // Wire shape: storage_key / storage_uri NOT exposed.
    for (const att of body.attachments) {
      expect(att).not.toHaveProperty('storage_key');
      expect(att).not.toHaveProperty('storage_uri');
      expect(typeof att.linked_at).toBe('string');
      expect(typeof att.created_at).toBe('string');
      expect(att.size_bytes).toBeGreaterThan(0);
    }
  });

  // ── B1.2: empty list when none ────────────────────────────────────────────
  it('returns empty attachments[] for a VOC with no linked attachments', async () => {
    const { id: vocId } = await makeVoc('No attachments');
    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ attachments: unknown[]; attachment_count: number }>();
    expect(body.attachments).toEqual([]);
    expect(body.attachment_count).toBe(0);
  });

  // ── B1.3: archived rows excluded ──────────────────────────────────────────
  it('excludes archived attachments from attachments[] and attachment_count', async () => {
    const { id: vocId } = await makeVoc('Archived excluded');
    const active = await insertLinkedAttachment(dbHandle, WORKSPACE_ID, { kind: 'voc', vocId }, adminActorId, {
      name: 'keep.png',
    });
    await insertLinkedAttachment(dbHandle, WORKSPACE_ID, { kind: 'voc', vocId }, adminActorId, {
      name: 'gone.png',
      archived: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ attachments: Array<{ id: string }>; attachment_count: number }>();
    expect(body.attachments.map((a) => a.id)).toEqual([active.id]);
    expect(body.attachment_count).toBe(1);
  });

  // ── B1.4: each conversation entry carries its linked attachments ─────────
  it('each conversation entry on detail carries its own attachments[]', async () => {
    const { id: vocId } = await makeVoc('Per-comment attachments');
    const puId = await insertPublicUpdate(dbHandle, vocId, adminActorId);
    const rrId = await insertReporterReply(dbHandle, vocId, reporterId);
    const icId = await insertInternalComment(dbHandle, vocId, adminActorId);

    const puAtt = await insertLinkedAttachment(
      dbHandle,
      WORKSPACE_ID,
      { kind: 'public_update', commentId: puId },
      adminActorId,
      { name: 'pu.png' },
    );
    const rrAtt = await insertLinkedAttachment(
      dbHandle,
      WORKSPACE_ID,
      { kind: 'reporter_reply', commentId: rrId },
      reporterId,
      { name: 'rr.png' },
    );
    const icAtt = await insertLinkedAttachment(
      dbHandle,
      WORKSPACE_ID,
      { kind: 'internal_comment', commentId: icId },
      adminActorId,
      { name: 'ic.png' },
    );

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      conversation_timeline: Array<{
        id: string;
        kind: string;
        attachments: Array<{ id: string; name: string }>;
      }>;
    }>();
    const byId = new Map(body.conversation_timeline.map((e) => [e.id, e]));
    expect(byId.get(puId)?.attachments.map((a) => a.id)).toEqual([puAtt.id]);
    expect(byId.get(rrId)?.attachments.map((a) => a.id)).toEqual([rrAtt.id]);
    expect(byId.get(icId)?.attachments.map((a) => a.id)).toEqual([icAtt.id]);

    // Entries with no attachments → []
    const otherPu = await insertPublicUpdate(dbHandle, vocId, adminActorId);
    const res2 = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    const body2 = res2.json<{
      conversation_timeline: Array<{ id: string; attachments: unknown[] }>;
    }>();
    const empty = body2.conversation_timeline.find((e) => e.id === otherPu);
    expect(empty?.attachments).toEqual([]);
  });

  // ── B1.5: GET /vocs/:id/conversation also carries attachments[] ──────────
  it('GET /vocs/:id/conversation entries carry attachments[]', async () => {
    const { id: vocId } = await makeVoc('Conv attachments');
    const ic = await insertInternalComment(dbHandle, vocId, adminActorId);
    const att = await insertLinkedAttachment(
      dbHandle,
      WORKSPACE_ID,
      { kind: 'internal_comment', commentId: ic },
      adminActorId,
      { name: 'conv.png' },
    );

    // First-page (no cursor) — exercises both Bug-1 (attachments) and Bug-2
    // (cursor optional) together.
    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}/conversation`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: Array<{ id: string; attachments: Array<{ id: string }> }>;
    }>();
    const target = body.items.find((i) => i.id === ic);
    expect(target?.attachments.map((a) => a.id)).toEqual([att.id]);
  });

  // ── B1.6: GET /vocs list rows carry attachment_count ─────────────────────
  it('GET /vocs list row exposes attachment_count', async () => {
    const { id: vocId, msId } = await makeVoc('List count');
    await insertLinkedAttachment(dbHandle, WORKSPACE_ID, { kind: 'voc', vocId }, adminActorId, { name: 'a.png' });
    await insertLinkedAttachment(dbHandle, WORKSPACE_ID, { kind: 'voc', vocId }, adminActorId, { name: 'b.png' });
    await insertLinkedAttachment(dbHandle, WORKSPACE_ID, { kind: 'voc', vocId }, adminActorId, {
      name: 'c.png',
      archived: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ id: string; attachment_count: number }> }>();
    const row = body.items.find((r) => r.id === vocId);
    expect(row?.attachment_count).toBe(2);
  });
});
