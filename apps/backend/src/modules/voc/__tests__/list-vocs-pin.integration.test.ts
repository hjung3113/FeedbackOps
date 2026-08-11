// GET /vocs?view=triage&pin_voc_id=… integration tests (#383).
//
// The triage queue predicate pins triage_state IN ('untriaged',
// 'needs_more_information'), so an already-triaged VOC can never appear in it —
// including the one the VOC detail panel's "트리아지에서 변경" deep link points at.
// pin_voc_id is the only path that carries such a target into the queue, and it
// must do so WITHOUT widening the scope wall and WITHOUT disturbing pagination.
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without these the suite is skipped.
//
// Rows are seeded with direct SQL so the mutation rate limit (10/min per actor)
// never enters the picture.

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
  randomUUID,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-pin';

interface ListBody {
  items: { id: string; display_id: string }[];
  page: { has_more: boolean; cursor?: string };
}

describe.skipIf(!runIntegration)('GET /vocs?view=triage&pin_voc_id (#383)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterId: string;

  async function listTriage(
    cookie: string,
    params: Record<string, string> = {},
  ): Promise<{ status: number; body: ListBody }> {
    const qs = new URLSearchParams({ view: 'triage', ...params });
    const res = await app.inject({
      method: 'GET',
      url: `/vocs?${qs.toString()}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    return { status: res.statusCode, body: res.json() as ListBody };
  }

  const idsOf = (body: ListBody): Set<string> => new Set(body.items.map((i) => i.id));

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    const a = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const aid = a.rows[0]?.id;
    if (!aid) throw new Error('mock-admin-1 not found');
    adminActorId = aid;

    const r = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const rid = r.rows[0]?.id;
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

  // ── The defect this endpoint exists to close ──────────────────────────────

  it('pins a triaged+assigned VOC that no triage tab can show', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Pin MS');
    const queued = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'pin-queued');
    const settled = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'pin-settled',
      {
        triageState: 'triaged',
        severity: 'medium',
        ownerUserId: adminActorId,
      },
    );

    const without = await listTriage(adminCookie);
    const withPin = await listTriage(adminCookie, { pin_voc_id: settled.id });

    // Set difference, not counts: names the row that appeared.
    expect(idsOf(without.body).has(settled.id)).toBe(false);
    expect(idsOf(withPin.body).has(settled.id)).toBe(true);
    // The rest of the queue is untouched by pinning.
    expect(idsOf(without.body).has(queued.id)).toBe(true);
    expect(idsOf(withPin.body).has(queued.id)).toBe(true);
  });

  it('places the pinned VOC first so the deep link lands on it', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Pin MS first');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'pin-first-queued');
    const settled = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'pin-first-settled',
      { triageState: 'triaged', severity: 'medium', ownerUserId: adminActorId },
    );

    const { body } = await listTriage(adminCookie, { pin_voc_id: settled.id });
    expect(body.items[0]?.id).toBe(settled.id);
  });

  it('does not duplicate a VOC the queue already contains', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Pin MS dup');
    const queued = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'pin-dup');

    const { body } = await listTriage(adminCookie, { pin_voc_id: queued.id });
    expect(body.items.filter((i) => i.id === queued.id)).toHaveLength(1);
  });

  // ── Scope wall — pinning must not widen it ────────────────────────────────

  it('drops a pin outside the actor triage scope, and answers 200 (no existence probe)', async () => {
    const msMine = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-mine`,
      'Pin mine',
    );
    const msTheirs = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-theirs`,
      'Pin theirs',
    );
    const mine = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msMine,
      reporterId,
      'pin-scope-mine',
    );
    const theirs = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msTheirs,
      reporterId,
      'pin-scope-theirs',
      { triageState: 'triaged', severity: 'medium', ownerUserId: adminActorId },
    );

    // Developer scoped to msMine only.
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, `pin-${uid('')}`);
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'workspace.read', null, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'voc.read', msMine, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'voc.triage', msMine, adminActorId);
    const devCookie = await loginAs(app, dev.externalId);

    const { status, body } = await listTriage(devCookie, { pin_voc_id: theirs.id });

    expect(status).toBe(200);
    expect(idsOf(body).has(theirs.id)).toBe(false);
    expect(idsOf(body).has(mine.id)).toBe(true);
  });

  it('ignores an unknown pin id and returns the same queue', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Pin MS unknown');
    const queued = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'pin-unknown');

    const baseline = await listTriage(adminCookie);
    const { status, body } = await listTriage(adminCookie, { pin_voc_id: randomUUID() });

    expect(status).toBe(200);
    expect(idsOf(body)).toEqual(idsOf(baseline.body));
    expect(idsOf(body).has(queued.id)).toBe(true);
  });

  it('ignores a pin pointing at an archived VOC', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Pin MS archived',
    );
    const archived = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'pin-archived',
      { triageState: 'triaged', severity: 'medium', ownerUserId: adminActorId },
    );
    await dbHandle.pool.query('update voc.vocs set archived_at = now() where id = $1', [
      archived.id,
    ]);

    const { status, body } = await listTriage(adminCookie, { pin_voc_id: archived.id });
    expect(status).toBe(200);
    expect(idsOf(body).has(archived.id)).toBe(false);
  });

  // ── Cross-view validation ─────────────────────────────────────────────────

  it('rejects pin_voc_id on view=inbox', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Pin MS inbox');
    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'pin-inbox');

    const res = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&pin_voc_id=${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code?: string }).code).toBe('validation.failed');
  });

  // ── Pagination must not shift ─────────────────────────────────────────────

  it('leaves has_more and cursor computed from the tab query alone', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Pin MS page');
    for (let i = 0; i < 3; i += 1) {
      await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, `pin-page-${i}`);
    }
    const settled = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'pin-page-settled',
      {
        triageState: 'triaged',
        severity: 'medium',
        ownerUserId: adminActorId,
      },
    );

    const without = await listTriage(adminCookie, { limit: '2' });
    const withPin = await listTriage(adminCookie, { limit: '2', pin_voc_id: settled.id });

    expect(withPin.body.page.has_more).toBe(without.body.page.has_more);
    expect(withPin.body.page.cursor).toBe(without.body.page.cursor);
    // The pinned row is extra — it does not consume a page slot.
    expect(idsOf(withPin.body).has(settled.id)).toBe(true);
    expect(withPin.body.items).toHaveLength(without.body.items.length + 1);
  });
});
