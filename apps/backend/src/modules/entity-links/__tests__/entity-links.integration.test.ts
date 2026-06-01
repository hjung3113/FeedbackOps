// POST/GET /entity-links integration tests — Slice 4.1 issue #112.
//
// Gate: DATABASE_URL + WORKSPACE_ID + DATABASE_URL_MIGRATE. The migrate role is
// required because core.entity_links is append-only to fops_app.

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
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-links';

describe.skipIf(!runIntegration)('POST/GET /entity-links (#112)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('mock-admin-1 not found');

    await loginAs(app, 'mock-user-1');
    const reporter = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    reporterId = reporter.rows[0]?.id ?? '';
    if (!reporterId) throw new Error('mock-user-1 not found');
  });

  beforeEach(async () => {
    await cleanupEntityLinkFixtures();
  });

  afterAll(async () => {
    await cleanupEntityLinkFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupEntityLinkFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.audit_log where workspace_id = $1 and event_type = 'entity_link.created'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedVocPair(): Promise<{
    msA: string;
    msB: string;
    sourceVoc: { id: string };
    targetVoc: { id: string };
  }> {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-a`,
      'Links MS-A',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-b`,
      'Links MS-B',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Link Source VOC',
    );
    const targetVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msB,
      reporterId,
      'Link Target VOC',
    );
    return { msA, msB, sourceVoc, targetVoc };
  }

  async function postEntityLink(cookie: string, sourceId: string, targetId: string, extra = {}) {
    return app.inject({
      method: 'POST',
      url: '/entity-links',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
      },
      payload: {
        source: { type: 'voc', id: sourceId },
        target: { type: 'voc', id: targetId },
        relation_type: 'related_to',
        ...extra,
      },
    });
  }

  it('POST creates an active VOC↔VOC related_to link and audit row', async () => {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();

    const res = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; visibility_state: string; managed_system_id: string }>();
    expect(body.visibility_state).toBe('allowed');
    expect(body.managed_system_id).toBe(msA);

    const linkRows = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where id = $1 and status = 'active' and relation_type = 'related_to'`,
      [body.id],
    );
    expect(linkRows.rows[0]?.n).toBe(1);

    const auditRows = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
        where event_type = 'entity_link.created' and subject_id = $1`,
      [body.id],
    );
    expect(auditRows.rowCount).toBe(1);
    expect(auditRows.rows[0]?.detail).toMatchObject({
      link_id: body.id,
      relation_type: 'related_to',
      visibility: 'internal_only',
    });
  });

  it('POST returns 404 when actor lacks scope on the target VOC', async () => {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();
    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('target404'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await postEntityLink(devCookie, sourceVoc.id, targetVoc.id);
    expect(res.statusCode).toBe(404);
  });

  it('POST rejects self-link', async () => {
    const { sourceVoc } = await seedVocPair();
    const res = await postEntityLink(adminCookie, sourceVoc.id, sourceVoc.id);
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('POST rejects unsupported relation_type, source_type, target_type, and visibility', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const cases = [
      { relation_type: 'evidence_of' },
      { source: { type: 'finding', id: sourceVoc.id } },
      { target: { type: 'task', id: targetVoc.id } },
      { visibility: 'summary_visible' },
    ];

    for (const extra of cases) {
      const res = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id, extra);
      expect(res.statusCode).toBe(422);
      expect(res.json<{ code: string }>().code).toBe('validation.failed');
    }
  });

  it('POST duplicate returns the existing active link without duplicating', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const first = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(first.statusCode).toBe(201);
    const firstId = first.json<{ id: string }>().id;

    const second = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(second.statusCode).toBe(200);
    expect(second.json<{ id: string }>().id).toBe(firstId);

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where source_id = $1 and target_id = $2 and status = 'active'`,
      [sourceVoc.id, targetVoc.id],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it('GET by source returns allowed rows and hidden stubs for out-of-scope targets', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-geta`,
      'Links GET MS-A',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-getb`,
      'Links GET MS-B',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'GET Source VOC',
    );
    const allowedTarget = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'GET Allowed Target',
    );
    const hiddenTarget = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msB,
      reporterId,
      'GET Hidden Target',
    );

    await postEntityLink(adminCookie, sourceVoc.id, allowedTarget.id);
    await postEntityLink(adminCookie, sourceVoc.id, hiddenTarget.id);

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('getsrc'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await app.inject({
      method: 'GET',
      url: `/entity-links?source_type=voc&source_id=${sourceVoc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<Record<string, unknown>> }>();
    expect(body.items).toHaveLength(2);
    expect(
      body.items.some(
        (item) => item.visibility_state === 'allowed' && item.target_id === allowedTarget.id,
      ),
    ).toBe(true);
    const hidden = body.items.find((item) => item.visibility_state === 'hidden');
    expect(hidden).toBeDefined();
    expect(hidden?.target_id).toBeUndefined();
    expect(hidden?.source_id).toBeUndefined();
  });

  it('VOC detail returns active outbound related_to links on the Links tab payload', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${sourceVoc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ links?: Array<{ id: string; visibility_state: string }> }>();
    expect(
      body.links?.some((link) => link.id === linkId && link.visibility_state === 'allowed'),
    ).toBe(true);
  });
});
