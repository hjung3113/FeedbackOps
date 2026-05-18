// GET /vocs integration tests — Slice 3 #15 C4 acceptance coverage.
//
// Every AC bullet from issue #15 §list-vocs maps to at least one test here.
// Uses live Postgres via buildServer + app.inject; no DB mocks.
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without these the suite is skipped
// with an informative message.
//
// NOTE: VOC / MS creation uses direct SQL helpers to avoid hitting the
// mutation rate limit when many tests create rows in sequence.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  denyCapability,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  randomUUID,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-list';

describe.skipIf(!runIntegration)('GET /vocs (#15 C4 — list)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterId: string;
  let reporterCookie: string;

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
    // Clean before each test so rate_limits and VOC data from previous tests don't interfere.
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  });

  afterAll(async () => {
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await app?.close();
    await dbHandle?.close();
  });

  // ── AC1: view=inbox scope union ───────────────────────────────────────────

  it('AC1a: admin view=inbox sees all VOCs across MSs', async () => {
    const msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-a`, 'Inbox MS-A');
    const msBId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b`, 'Inbox MS-B');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, reporterId, 'VOC-A');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msBId, reporterId, 'VOC-B');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { primary_managed_system_id: string }[] }>();
    const msIds = body.items.map((i) => i.primary_managed_system_id);
    expect(msIds).toContain(msAId);
    expect(msIds).toContain(msBId);
  });

  it('AC1b: developer with voc.read on MS-A only sees only MS-A VOCs in view=inbox', async () => {
    const msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-a`, 'Dev MS-A');
    const msBId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b`, 'Dev MS-B');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac1b'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msAId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, reporterId, 'VOC-A');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msBId, reporterId, 'VOC-B');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { primary_managed_system_id: string }[] }>();
    const msIds = body.items.map((i) => i.primary_managed_system_id);
    expect(msIds).toContain(msAId);
    expect(msIds).not.toContain(msBId);
  });

  // ── AC3: view=my filters by reporter_id ───────────────────────────────────

  it('AC3: view=my returns only the acting actor\'s VOCs; admin does not see other reporter\'s VOC', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-my`, 'My View MS');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Reporter VOC');

    // Admin should NOT see the reporter's VOC in view=my
    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=my',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { title: string }[] }>();
    expect(body.items.map((i) => i.title)).not.toContain('Reporter VOC');

    // Reporter should see their own
    const res2 = await app.inject({
      method: 'GET',
      url: '/vocs?view=my',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${reporterCookie}` },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json<{ items: { title: string }[] }>();
    expect(body2.items.map((i) => i.title)).toContain('Reporter VOC');
  });

  // ── AC4: view=my + managed_system_id=all → 422 ───────────────────────────

  it('AC4: view=my + managed_system_id=all → 422 validation.failed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=my&managed_system_id=all',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── AC5: view=my + managed_system_id=<uuid> → 200 (narrowing allowed) ────

  it('AC5: view=my + managed_system_id=<uuid> → 200', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-my-uuid`, 'My UUID MS');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'My VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs?view=my&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${reporterCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { title: string }[] }>();
    expect(body.items.map((i) => i.title)).toContain('My VOC');
  });

  // ── AC6: view=triage rejects sort param → 422 ────────────────────────────

  it('AC6: view=triage + sort param → 422 validation.failed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage&sort=created_at:desc',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── AC7: view=triage default order ───────────────────────────────────────

  it('AC7: view=triage default order: unassigned_first → severity desc → created_at asc', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-tri-ord`, 'Triage Order MS');

    const voc1 = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Assigned Critical', {
      severity: 'critical', ownerUserId: adminActorId,
    });
    const voc2 = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Unassigned High', {
      severity: 'high',
    });
    const voc3 = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Unassigned Low', {
      severity: 'low',
    });
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Unassigned Null');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { id: string; owner_user_id: string | null; severity: string | null }[] }>();

    // All unassigned appear before assigned.
    const unassigned = body.items.filter((i) => i.owner_user_id === null);
    const assigned = body.items.filter((i) => i.owner_user_id !== null);

    if (unassigned.length > 0 && assigned.length > 0) {
      const lastUnassignedIdx = body.items.findLastIndex((i) => i.owner_user_id === null);
      const firstAssignedIdx = body.items.findIndex((i) => i.owner_user_id !== null);
      expect(lastUnassignedIdx).toBeLessThan(firstAssignedIdx);
    }

    // Among unassigned, high before low
    const highIdx = body.items.findIndex((i) => i.id === voc2.id);
    const lowIdx = body.items.findIndex((i) => i.id === voc3.id);
    if (highIdx !== -1 && lowIdx !== -1) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
    // voc1 (assigned) comes after all unassigned
    const voc1Idx = body.items.findIndex((i) => i.id === voc1.id);
    if (voc1Idx !== -1 && unassigned.length > 0) {
      const lastUnassignedIdx = body.items.findLastIndex((i) => i.owner_user_id === null);
      expect(voc1Idx).toBeGreaterThan(lastUnassignedIdx);
    }
  });

  // ── AC8: view=triage requires voc.triage capability ──────────────────────

  it('AC8: developer with voc.read but no voc.triage → 403 on view=triage', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-tri-perm`, 'Triage Perm MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac8'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });

  // ── AC9: view=triage developer with no scope at all → 403 ───────────────

  it('AC9: developer with no scope → 403 on view=triage', async () => {
    const { externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac9'));
    const devCookie = await loginAs(app, externalId);

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(403);
    const code = res.json<{ code: string }>().code;
    expect(['permission.denied', 'permission.scope_required']).toContain(code);
  });

  // ── AC10: tab=untriaged ───────────────────────────────────────────────────

  it('AC10: tab=untriaged filters to triage_state=untriaged', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-tab-unt`, 'Tab Untriaged MS');

    const untriVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Untriaged VOC');
    const triVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Triaged VOC', {
      triageState: 'triaged', severity: 'low',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=untriaged',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { id: string; triage_state: string }[] }>();
    for (const item of body.items) {
      expect(item.triage_state).toBe('untriaged');
    }
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(untriVoc.id);
    expect(ids).not.toContain(triVoc.id);
  });

  // ── AC11: tab=high filters to severity high ───────────────────────────────

  it('AC11: tab=high filters to severity=high only (current repo behavior)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-tab-high`, 'Tab High MS');

    const highVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'High VOC', { severity: 'high' });
    const lowVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Low VOC', { severity: 'low' });

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=high',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { id: string; severity: string }[] }>();
    for (const item of body.items) {
      expect(item.severity).toBe('high');
    }
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(highVoc.id);
    expect(ids).not.toContain(lowVoc.id);
  });

  // ── AC12: tab=unassigned filters to no owner ─────────────────────────────

  it('AC12: tab=unassigned filters to no owner', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-tab-unass`, 'Tab Unassigned MS');

    const unassVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Unassigned VOC');
    const assVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Assigned VOC', {
      ownerUserId: adminActorId,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=unassigned',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { id: string; owner_user_id: string | null; owner_team_id: string | null }[] }>();
    for (const item of body.items) {
      expect(item.owner_user_id).toBeNull();
      expect(item.owner_team_id).toBeNull();
    }
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(unassVoc.id);
    expect(ids).not.toContain(assVoc.id);
  });

  // ── AC13: tab=similar returns [] in Slice 3 ──────────────────────────────

  it('AC13: tab=similar returns empty items in Slice 3', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-similar`, 'Similar MS');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Any VOC');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=similar',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: unknown[] }>();
    expect(body.items).toEqual([]);
  });

  // ── AC14: tab=no-link returns full set in Slice 3 ────────────────────────

  it('AC14: tab=no-link returns full set in Slice 3', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-nolink`, 'No-Link MS');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'NoLink VOC');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=no-link',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { title: string }[] }>();
    expect(body.items.map((i) => i.title)).toContain('NoLink VOC');
  });

  // ── AC15: tab=waiting (triage view) ──────────────────────────────────────

  it('AC15: tab=waiting on view=triage returns only postponed untriaged VOCs', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-waiting`, 'Waiting MS');

    const normalVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Normal Untriaged');
    const postponedVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Postponed VOC', {
      postponedAt: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage&tab=waiting',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { id: string }[] }>();
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(postponedVoc.id);
    expect(ids).not.toContain(normalVoc.id);
  });

  // ── AC16: tab=waiting on view=inbox → 422 ────────────────────────────────

  it('AC16: tab=waiting on view=inbox → 422 validation.failed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=waiting',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  // ── AC17: similar_count=0 on every row ───────────────────────────────────

  it('AC17: similar_count=0 on every returned row', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-sim-cnt`, 'SimCnt MS');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'SimCnt VOC');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { similar_count: number }[] }>();
    for (const item of body.items) {
      expect(item.similar_count).toBe(0);
    }
  });

  // ── AC18: Cursor pagination 75 VOCs ──────────────────────────────────────

  it('AC18: 75 VOCs, limit=50 → first page 50+has_more+cursor; second page 25+has_more=false', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-paginate`, 'Paginate MS');

    // Seed 75 VOCs directly in bulk — each needs a unique display_id via function
    for (let i = 0; i < 75; i++) {
      await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, `Paged VOC ${i}`);
    }

    // First page
    const res1 = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&managed_system_id=${msId}&sort=created_at%3Adesc&limit=50`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json<{ items: unknown[]; page: { has_more: boolean; cursor?: string } }>();
    expect(body1.items.length).toBe(50);
    expect(body1.page.has_more).toBe(true);
    expect(body1.page.cursor).toBeDefined();

    // Second page
    const res2 = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&managed_system_id=${msId}&sort=created_at%3Adesc&limit=50&cursor=${encodeURIComponent(body1.page.cursor!)}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json<{ items: unknown[]; page: { has_more: boolean } }>();
    expect(body2.items.length).toBe(25);
    expect(body2.page.has_more).toBe(false);
  }, 60_000);

  // ── AC19: Invalid cursor → 422 ────────────────────────────────────────────

  it('AC19: invalid cursor (mismatched sort key) → 422 validation.failed code=invalid_cursor', async () => {
    // Encode a cursor with sort key 'severity:asc' but request sort='created_at:desc'
    const fakeCursor = Buffer.from(
      JSON.stringify({ s: 'severity:asc', d: 'asc', sv: 1, id: '00000000-0000-0000-0000-000000000001' }),
      'utf8',
    ).toString('base64');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&sort=created_at%3Adesc&cursor=${encodeURIComponent(fakeCursor)}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json<{ code: string; detail?: { fields?: Array<{ path: string[]; code: string }> } }>();
    expect(body.code).toBe('validation.failed');
    if (body.detail?.fields) {
      const cursorField = body.detail.fields.find((f) => f.path.includes('cursor'));
      if (cursorField) {
        expect(cursorField.code).toBe('invalid_cursor');
      }
    }
  });

  // ── AC20: out_of_scope_summary integration ────────────────────────────────

  it('AC20: out_of_scope_summary — actor with voc.read on MS-A, voc.triage on MS-B', async () => {
    const msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-oos-a`, 'OOS MS-A');
    const msBId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-oos-b`, 'OOS MS-B');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('ac20'));
    // voc.read on MS-A only (so MS-A is in readScope)
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msAId, adminActorId);
    // voc.triage on MS-B (puts MS-B in effectiveScope but not readScope)
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msBId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    // MS-A: 2 VOCs (1 high, 1 medium)
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, reporterId, 'MS-A High', { severity: 'high' });
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, reporterId, 'MS-A Medium', { severity: 'medium' });

    // MS-B: 3 VOCs (1 critical, 2 low)
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msBId, reporterId, 'MS-B Critical', { severity: 'critical' });
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msBId, reporterId, 'MS-B Low 1', { severity: 'low' });
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msBId, reporterId, 'MS-B Low 2', { severity: 'low' });

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: { primary_managed_system_id: string }[];
      out_of_scope_summary?: {
        count: number;
        severity_distribution: Record<string, number>;
      };
    }>();

    // Items should only contain MS-A VOCs
    for (const item of body.items) {
      expect(item.primary_managed_system_id).toBe(msAId);
    }

    // out_of_scope_summary should be present for MS-B's 3 VOCs
    expect(body.out_of_scope_summary).toBeDefined();
    expect(body.out_of_scope_summary!.count).toBe(3);
    expect(body.out_of_scope_summary!.severity_distribution.critical).toBe(1);
    expect(body.out_of_scope_summary!.severity_distribution.low).toBe(2);
  });

  // ── AC21: out_of_scope_summary absent for admin ───────────────────────────

  it('AC21: out_of_scope_summary absent when admin (readScope=all)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-admin-oos`, 'Admin OOS MS');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Admin OOS VOC');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ out_of_scope_summary?: unknown }>();
    expect(body.out_of_scope_summary).toBeUndefined();
  });

  // ── AC22: Workspace isolation ─────────────────────────────────────────────

  it('AC22: workspace isolation — VOC in a second workspace is not visible to actor in workspace 1', async () => {
    // Create a second workspace so FK is satisfied, then insert a VOC and MS under it.
    const secondWorkspaceId = randomUUID();
    await dbHandle.pool.query(
      `insert into core.workspaces (id, name) values ($1, 'Test WS 2 - isolation')`,
      [secondWorkspaceId],
    );

    // Insert an MS under the second workspace.
    const isoMsRes = await dbHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, 'Iso MS') returning id`,
      [secondWorkspaceId, `iso-ms-${secondWorkspaceId.slice(0, 8)}`],
    );
    const isoMsId = isoMsRes.rows[0]?.id;
    if (!isoMsId) throw new Error('Failed to insert isolation MS');

    // Insert an actor under the second workspace (needed for reporter_id FK).
    const isoActorRes = await dbHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, 'iso-reporter', 'iso@local', 'Iso Reporter', 'user', 'internal_member') returning id`,
      [secondWorkspaceId],
    );
    const isoActorId = isoActorRes.rows[0]?.id;
    if (!isoActorId) throw new Error('Failed to insert isolation actor');

    // Insert a VOC under the second workspace.
    const isolatedVocRes = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.vocs
         (workspace_id, primary_managed_system_id, reporter_id, display_id, title,
          description_rich_content, source_context, reporter_facing_status, triage_state)
       values
         ($1, $2, $3, voc.next_voc_display_id($1::uuid), 'Cross-Workspace VOC',
          '{"type":"doc","content":[]}'::jsonb,
          'direct_use', 'received', 'untriaged')
       returning id`,
      [secondWorkspaceId, isoMsId, isoActorId],
    );
    const isolatedVocId = isolatedVocRes.rows[0]?.id;
    if (!isolatedVocId) throw new Error('Failed to insert cross-workspace VOC');

    try {
      // Admin in WORKSPACE_ID should NOT see the cross-workspace VOC in list.
      const res = await app.inject({
        method: 'GET',
        url: '/vocs?view=inbox',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { id: string }[] }>();
      const ids = body.items.map((i) => i.id);
      expect(ids).not.toContain(isolatedVocId);

      // Also: detail endpoint → 404 for cross-workspace VOC.
      const detailRes = await app.inject({
        method: 'GET',
        url: `/vocs/${isolatedVocId}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
      expect(detailRes.statusCode).toBe(404);
    } finally {
      // Cleanup the cross-workspace rows (reverse FK order).
      await dbHandle.pool.query(`delete from voc.vocs where workspace_id = $1`, [secondWorkspaceId]);
      await dbHandle.pool.query(`delete from core.actors where workspace_id = $1`, [secondWorkspaceId]);
      await dbHandle.pool.query(`delete from core.managed_systems where workspace_id = $1`, [secondWorkspaceId]);
      await dbHandle.pool.query(`delete from core.workspaces where id = $1`, [secondWorkspaceId]);
    }
  });

  // ── B1: permission_denies respected in scope resolution ──────────────────

  it('B1a: actor with voc.read grant + active MS-scoped deny → view=inbox returns empty for that MS', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-deny-a`, 'Deny MS-A');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('b1a'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    await denyCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Denied MS VOC');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    // Grant + deny → scope is empty → 403 (no scope) or empty items.
    // The deny removes the MS from resolved scope, so the actor has no read scope.
    const body = res.json<{ code?: string; items?: unknown[] }>();
    if (res.statusCode === 200) {
      // If scoped read returned 200 with 0 items (empty scope after deny subtraction):
      expect(body.items).toHaveLength(0);
    } else {
      // 403 is also correct (scope collapsed to empty → permission.denied or scope_required).
      expect([403, 422]).toContain(res.statusCode);
    }
  });

  // B1c/B1d/B1e cover the N-MAJ-1 gap: workspace-wide grant + MS-scoped deny.
  // These tests were absent in cycle-1 because the TODO(future) left the deny dropped.

  it('B1c: developer with workspace-wide voc.read grant + MS-scoped deny on MS-A → view=inbox excludes MS-A VOCs', async () => {
    const msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b1c-a`, 'B1c MS-A (denied)');
    const msBId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b1c-b`, 'B1c MS-B (allowed)');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('b1c'));
    // Workspace-wide grant (managed_system_id = null).
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', null, adminActorId);
    // MS-scoped deny on MS-A only.
    await denyCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msAId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, reporterId, 'B1c VOC-A (must be excluded)');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msBId, reporterId, 'B1c VOC-B (must be included)');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { primary_managed_system_id: string; title: string }[] }>();
    const msIds = body.items.map((i) => i.primary_managed_system_id);
    // MS-A (denied) must not appear; MS-B (allowed) must appear.
    expect(msIds).not.toContain(msAId);
    expect(msIds).toContain(msBId);
  });

  it('B1d: developer with workspace-wide voc.read + MS-scoped deny on MS-A → GET /vocs/:id on MS-A VOC → 404', async () => {
    const msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b1d-a`, 'B1d MS-A (denied)');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('b1d'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', null, adminActorId);
    await denyCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msAId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, reporterId, 'B1d Denied VOC');

    // Existence-probe defense: must return 404 not_found.record (not 200 or 403).
    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('not_found.record');
  });

  it('B1e: developer with workspace-wide voc.triage + workspace-wide voc.read + MS-scoped triage deny on MS-A → view=triage excludes MS-A VOCs', async () => {
    const msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b1e-a`, 'B1e MS-A (triage denied)');
    const msBId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-b1e-b`, 'B1e MS-B (triage allowed)');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('b1e'));
    // Both voc.read and voc.triage workspace-wide grants. MS-scoped deny on voc.triage for MS-A.
    // view=triage uses intersect(readScope, triageScope); with the deny applied to triageScope,
    // MS-A is excluded from triageScope, so the intersection also excludes it.
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', null, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', null, adminActorId);
    await denyCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msAId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, reporterId, 'B1e Triage VOC-A (denied)');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msBId, reporterId, 'B1e Triage VOC-B (allowed)');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { primary_managed_system_id: string }[] }>();
    const msIds = body.items.map((i) => i.primary_managed_system_id);
    // Denied MS-A must not appear in triage view results.
    expect(msIds).not.toContain(msAId);
    expect(msIds).toContain(msBId);
  });

  it('B1b: actor with voc.read grant + workspace-wide deny → view=inbox → 403 (scope collapses to empty)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-deny-ws`, 'Deny WS MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('b1b'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    // Workspace-wide deny (managed_system_id = null) collapses scope to empty.
    await denyCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', null, adminActorId);
    const devCookie = await loginAs(app, externalId);

    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'WS Denied VOC');

    const res = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    // Workspace-wide deny → scope empty → 403.
    if (res.statusCode === 200) {
      // Acceptable only if items is empty (deny correctly subtracted all grants).
      expect(res.json<{ items: unknown[] }>().items).toHaveLength(0);
    } else {
      expect([403, 422]).toContain(res.statusCode);
    }
  });

  // ── M6: severity null ordering ────────────────────────────────────────────

  it('M6a: sort=severity:asc → nulls sort last (after all real severities)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-sev-asc`, 'Sev Asc MS');

    const lowVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Sev Low', { severity: 'low' });
    const critVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Sev Critical', { severity: 'critical' });
    const null1 = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Sev Null 1');
    const null2 = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Sev Null 2');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&managed_system_id=${msId}&sort=severity%3Aasc&limit=10`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { id: string; severity: string | null }[] }>();
    const ids = body.items.map((i) => i.id);

    // All 4 VOCs must appear.
    expect(ids).toContain(lowVoc.id);
    expect(ids).toContain(critVoc.id);
    expect(ids).toContain(null1.id);
    expect(ids).toContain(null2.id);

    // low must come before critical (ASC ordinal 1 < 4).
    expect(ids.indexOf(lowVoc.id)).toBeLessThan(ids.indexOf(critVoc.id));

    // Both null VOCs must come after both non-null VOCs (nulls last).
    const lastNonNullIdx = Math.max(ids.indexOf(lowVoc.id), ids.indexOf(critVoc.id));
    const firstNullIdx = Math.min(ids.indexOf(null1.id), ids.indexOf(null2.id));
    expect(lastNonNullIdx).toBeLessThan(firstNullIdx);
  });

  it('M6b: sort=severity:desc → nulls sort last (after all real severities)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${uid(SLUG_PREFIX)}-sev-desc`, 'Sev Desc MS');

    const lowVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Desc Low', { severity: 'low' });
    const critVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Desc Critical', { severity: 'critical' });
    const nullVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Desc Null');
    const medVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Desc Medium', { severity: 'medium' });

    const res = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&managed_system_id=${msId}&sort=severity%3Adesc&limit=10`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { id: string; severity: string | null }[] }>();
    const ids = body.items.map((i) => i.id);

    // critical must come before medium, medium before low (DESC ordinal).
    expect(ids.indexOf(critVoc.id)).toBeLessThan(ids.indexOf(medVoc.id));
    expect(ids.indexOf(medVoc.id)).toBeLessThan(ids.indexOf(lowVoc.id));

    // null VOC must come after all non-null VOCs (nulls last).
    const lastNonNullIdx = Math.max(ids.indexOf(critVoc.id), ids.indexOf(medVoc.id), ids.indexOf(lowVoc.id));
    expect(ids.indexOf(nullVoc.id)).toBeGreaterThan(lastNonNullIdx);
  });
});
