// GET /vocs/:id integration tests — Slice 3 #15 C4 acceptance coverage.
//
// Every AC bullet from issue #15 §get-voc maps to at least one test here.
// Uses live Postgres via buildServer + app.inject; no DB mocks.
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without these the suite is skipped
// with an informative message.

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
  insertInternalComment,
  insertMsDirectly,
  insertPermissionDecisionsSeed,
  insertPublicUpdate,
  insertReporterReply,
  insertVocDirectly,
  loginAs,
  randomUUID,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-getvoc';

describe.skipIf(!runIntegration)('GET /vocs/:id (#15 C4)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterCookie: string;
  let reporterId: string;

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
    const id = r.rows[0]?.id;
    if (!id) throw new Error('mock-admin-1 not found');
    adminActorId = id;

    reporterCookie = await loginAs(app, 'mock-user-1');
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

  // Helper: insert a VOC directly (bypasses rate limit on POST /vocs)
  async function insertVoc(msId: string, title: string): Promise<{ id: string; updated_at: string }> {
    return insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, title);
  }

  // ── AC1: Full envelope shape ──────────────────────────────────────────────

  it('AC1: GET /vocs/:id returns full envelope with all top-level fields', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-full`, 'Full Envelope MS');
    const voc = await insertVoc(msId, 'Full Envelope VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body.id).toBe(voc.id);
    expect(body.display_id).toBeDefined();
    expect(body.title).toBe('Full Envelope VOC');
    expect(body.primary_managed_system_id).toBe(msId);
    expect(body.analytics_area_id).toBeNull();
    expect(body.reporter_id).toBeDefined();
    expect(body.owner_user_id).toBeNull();
    expect(body.owner_team_id).toBeNull();
    expect(body.severity).toBeNull();
    expect(body.reporter_facing_status).toBeDefined();
    expect(body.triage_state).toBeDefined();
    expect(body.source_context).toBeDefined();
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();
    expect(body.similar_count).toBe(0);
    expect(body.description_rich_content).toBeDefined();
    expect(body.next_actions).toEqual([]);
    expect(body.next_reporter_states).toBeDefined();
    expect(body.linked_execution).toEqual({ findingRef: null, taskRef: null });
    expect(Array.isArray(body.conversation_timeline)).toBe(true);
    expect(body.conversation_page).toBeDefined();
    expect(body.permission_decisions).toBeDefined();
  });

  // ── AC2: next_reporter_states derived from transitions ───────────────────

  it('AC2: next_reporter_states derived from reporter_facing_status_transitions; received → allowed present', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-nrs`, 'NRS MS');
    const voc = await insertVoc(msId, 'NRS VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      reporter_facing_status: string;
      next_reporter_states: { allowed: string[]; forbidden: Record<string, string> };
    }>();
    expect(body.reporter_facing_status).toBe('received');
    expect(Array.isArray(body.next_reporter_states.allowed)).toBe(true);
    expect(typeof body.next_reporter_states.forbidden).toBe('object');
  });

  // ── AC3: reporter_status_gate omitted in Slice 3 ─────────────────────────

  it('AC3: reporter_status_gate field not present in envelope (Slice 3)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-rsg`, 'RSG MS');
    const voc = await insertVoc(msId, 'RSG VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body.reporter_status_gate).toBeUndefined();
  });

  // ── AC4: conversation_timeline hybrid 30 ─────────────────────────────────

  it('AC4: 30 internal_comments → 30 inline + has_more=false (canTriage actor)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-conv30`, 'Conv30 MS');
    const voc = await insertVoc(msId, 'Conv30 VOC');

    for (let i = 0; i < 30; i++) {
      await insertInternalComment(dbHandle, voc.id, adminActorId);
    }

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      conversation_timeline: unknown[];
      conversation_page: { has_more: boolean; cursor?: string };
    }>();
    expect(body.conversation_timeline.length).toBe(30);
    expect(body.conversation_page.has_more).toBe(false);
    expect(body.conversation_page.cursor).toBeUndefined();
  });

  // ── AC5: conversation_timeline hybrid 65 ─────────────────────────────────

  it('AC5: 65 internal_comments → 50 inline + has_more=true', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-conv65`, 'Conv65 MS');
    const voc = await insertVoc(msId, 'Conv65 VOC');

    for (let i = 0; i < 65; i++) {
      await insertInternalComment(dbHandle, voc.id, adminActorId);
    }

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      conversation_timeline: unknown[];
      conversation_page: { has_more: boolean; cursor?: string };
    }>();
    expect(body.conversation_timeline.length).toBe(50);
    expect(body.conversation_page.has_more).toBe(true);
    expect(body.conversation_page.cursor).toBeDefined();
  });

  // ── AC6: Visibility — reporter on own VOC ────────────────────────────────

  it('AC6: reporter on own VOC → FULL envelope; sees public_updates + own reporter_replies; NO internal_comments', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-rep-vis`, 'Reporter Vis MS');
    const voc = await insertVoc(msId, 'Reporter Vis VOC');

    await insertPublicUpdate(dbHandle, voc.id, adminActorId);
    await insertReporterReply(dbHandle, voc.id, reporterId);
    await insertInternalComment(dbHandle, voc.id, adminActorId);

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${reporterCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      reporter_id: string;
      conversation_timeline: { kind: string; visibility: string; actor_id: string }[];
    }>();

    // Should get full envelope (isReporter=true)
    expect(body.reporter_id).toBe(reporterId);

    // Reporter sees: public_updates + own reporter_replies; NOT internal_comments
    const kinds = body.conversation_timeline.map((e) => e.kind);
    expect(kinds).toContain('public_update');
    expect(kinds).toContain('reporter_reply');
    expect(kinds).not.toContain('internal_comment');

    // Reporter_replies should only be own
    const replies = body.conversation_timeline.filter((e) => e.kind === 'reporter_reply');
    for (const reply of replies) {
      expect(reply.actor_id).toBe(reporterId);
    }
  });

  // ── AC7: Developer with voc.read AND voc.triage sees all 3 kinds ─────────

  it('AC7: developer with voc.read AND voc.triage sees all 3 conversation kinds', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-dev-tri`, 'Dev Triage MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac7'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const voc = await insertVoc(msId, 'Dev Triage VOC');

    await insertPublicUpdate(dbHandle, voc.id, adminActorId);
    await insertReporterReply(dbHandle, voc.id, reporterId);
    await insertInternalComment(dbHandle, voc.id, adminActorId);

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      conversation_timeline: { kind: string }[];
    }>();
    const kinds = new Set(body.conversation_timeline.map((e) => e.kind));
    expect(kinds.has('public_update')).toBe(true);
    expect(kinds.has('reporter_reply')).toBe(true);
    expect(kinds.has('internal_comment')).toBe(true);
  });

  // ── AC8: Developer with voc.read only (no triage) ────────────────────────

  it('AC8: developer with voc.read only → public_updates + reporter_replies; NO internal_comments', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-dev-read`, 'Dev Read MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac8'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const voc = await insertVoc(msId, 'Dev Read Only VOC');

    await insertPublicUpdate(dbHandle, voc.id, adminActorId);
    await insertReporterReply(dbHandle, voc.id, reporterId);
    await insertInternalComment(dbHandle, voc.id, adminActorId);

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      conversation_timeline: { kind: string }[];
    }>();
    const kinds = body.conversation_timeline.map((e) => e.kind);
    expect(kinds).toContain('public_update');
    expect(kinds).toContain('reporter_reply');
    expect(kinds).not.toContain('internal_comment');
  });

  // ── AC9: Cross-MS Developer (no access) → 404 ────────────────────────────

  it('AC9: cross-MS developer (no read, no effective scope on this MS, not reporter) → 404 not_found.record', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-cross-404`, 'Cross 404 MS');
    const { externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac9'));
    const devCookie = await loginAs(app, externalId);

    const voc = await insertVoc(msId, 'Cross 404 VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');
  });

  // ── AC10: Cross-MS with voc.triage grant → SUMMARY envelope ─────────────

  it('AC10: developer with voc.triage on MS (no voc.read) → 200 SUMMARY envelope with request_access', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-summary`, 'Summary MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac10'));
    // voc.triage but NOT voc.read → effectiveScope=MS, readScope=empty → SUMMARY
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const voc = await insertVoc(msId, 'Summary VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();

    // SUMMARY envelope: has id, display_id, primary_managed_system_id, reporter_facing_status, created_at, permission_decisions
    expect(body.id).toBe(voc.id);
    expect(body.display_id).toBeDefined();
    expect(body.primary_managed_system_id).toBe(msId);
    expect(body.reporter_facing_status).toBeDefined();
    expect(body.created_at).toBeDefined();
    expect(body.permission_decisions).toBeDefined();

    // SUMMARY must NOT contain: description, conversation, next_reporter_states
    expect(body.description_rich_content).toBeUndefined();
    expect(body.conversation_timeline).toBeUndefined();
    expect(body.next_reporter_states).toBeUndefined();

    // permission_decisions._self.state must be 'request_access'
    const pd = body.permission_decisions as Record<string, unknown>;
    const selfDecision = pd._self as Record<string, unknown>;
    expect(selfDecision.state).toBe('request_access');
  });

  // ── AC11: Cross-workspace VOC id → 404 ───────────────────────────────────

  it('AC11: non-existent VOC id → 404 not_found.record (cross-workspace defense)', async () => {
    const fakeId = randomUUID();
    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${fakeId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');
  });

  // ── AC12: ETag header format ──────────────────────────────────────────────

  it('AC12: GET /vocs/:id returns ETag header in W/"<iso>" format', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-etag`, 'ETag MS');
    const voc = await insertVoc(msId, 'ETag VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const etag = res.headers['etag'] as string;
    expect(etag).toBeDefined();
    expect(etag).toMatch(/^W\/"[\d\-T:.Z]+"$/);
  });

  // ── AC13: If-None-Match round-trip → 304 ─────────────────────────────────

  it('AC13: If-None-Match: <etag> → 304 Not Modified', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-304`, '304 MS');
    const voc = await insertVoc(msId, '304 VOC');

    // First request — get ETag
    const res1 = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res1.statusCode).toBe(200);
    const etag = res1.headers['etag'] as string;

    // Second request with If-None-Match → 304
    const res2 = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'if-none-match': etag,
      },
    });
    expect(res2.statusCode).toBe(304);
  });

  // ── AC14: Stale If-None-Match → 200 + new etag ───────────────────────────

  it('AC14: stale If-None-Match → 200 + new envelope + new etag', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-stale-etag`, 'Stale ETag MS');
    const voc = await insertVoc(msId, 'Stale ETag VOC');

    const staleEtag = 'W/"1970-01-01T00:00:00.000Z"';

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'if-none-match': staleEtag,
      },
    });
    expect(res.statusCode).toBe(200);
    const newEtag = res.headers['etag'] as string;
    expect(newEtag).toBeDefined();
    expect(newEtag).not.toBe(staleEtag);
  });

  // ── AC15: permission_decisions.linkedFinding from seed fixture ────────────

  it('AC15: permission_decisions contains seed fixture envelope verbatim', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-pd-seed`, 'PD Seed MS');
    const voc = await insertVoc(msId, 'PD Seed VOC');

    const seedEnvelope = {
      linkedFinding: {
        decision_id: randomUUID(),
        state: 'linked',
      },
    };
    await insertPermissionDecisionsSeed(dbHandle, voc.id, seedEnvelope);

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ permission_decisions: Record<string, unknown> }>();
    expect(body.permission_decisions.linkedFinding).toEqual(seedEnvelope.linkedFinding);
  });

  // ── AC16: SUMMARY envelope shape ─────────────────────────────────────────

  it('AC16: SUMMARY envelope only has id, display_id, primary_managed_system_id, reporter_facing_status, created_at, permission_decisions._self', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-sum-shape`, 'Sum Shape MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac16'));
    // Only voc.triage → effectiveScope has MS; readScope does not
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const voc = await insertVoc(msId, 'Sum Shape VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();

    // Must have
    expect(body.id).toBeDefined();
    expect(body.display_id).toBeDefined();
    expect(body.primary_managed_system_id).toBeDefined();
    expect(body.reporter_facing_status).toBeDefined();
    expect(body.created_at).toBeDefined();
    expect(body.permission_decisions).toBeDefined();
    const pd = body.permission_decisions as Record<string, unknown>;
    expect(pd._self).toBeDefined();

    // Must NOT have
    expect(body.description_rich_content).toBeUndefined();
    expect(body.conversation_timeline).toBeUndefined();
    expect(body.next_reporter_states).toBeUndefined();
    expect(body.title).toBeUndefined();
  });
});
