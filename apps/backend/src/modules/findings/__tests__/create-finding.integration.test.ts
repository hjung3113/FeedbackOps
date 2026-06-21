// POST /vocs/:id/create-finding + GET /findings integration tests.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role is
// required for cleanup of append-only core.entity_links and core.audit_log rows.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  createAa,
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

const SLUG_PREFIX = 'it-findings';

describe.skipIf(!runIntegration)('POST /vocs/:id/create-finding (#122)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let reporterCookie: string;
  let adminActorId: string;
  let reporterActorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    reporterActorId = actors.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !reporterActorId) throw new Error('seed actors not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and relation_type = 'created_finding'
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and event_type in ('finding_created_from_voc', 'entity_link.created')`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from finding.findings
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys
        where actor_id in (
          select id from core.actors
           where workspace_id = $1
             and (
               external_id in ('mock-admin-1', 'mock-user-1')
               or external_id like 'mock-dev-read-%'
             )
        )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedSource(): Promise<{ msId: string; vocId: string }> {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Findings Source MS',
    );
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterActorId,
      'VOC with synthesis need',
    );
    return { msId, vocId: voc.id };
  }

  async function createFinding(
    cookie: string,
    vocId: string,
    body: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/create-finding`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: body,
    });
  }

  it('creates a finding, created_finding link, and both audit rows atomically', async () => {
    const { msId, vocId } = await seedSource();

    const res = await createFinding(adminCookie, vocId, {
      title: 'Billing exports need synthesis',
      summary: 'Several customer reports describe confusing export failures.',
      severity: 'high',
      confidence: 'medium',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; source_type: string; source_id: string }>();
    expect(body).toMatchObject({
      title: 'Billing exports need synthesis',
      primary_managed_system_id: msId,
      source_type: 'voc',
      source_id: vocId,
      evidence_count: 0,
      severity: 'high',
      confidence: 'medium',
      status: 'draft',
    });

    const persisted = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from finding.findings
        where id = $1
          and source_type = 'voc'
          and source_id = $2
          and evidence_count = 0`,
      [body.id, vocId],
    );
    expect(persisted.rows[0]?.n).toBe(1);

    const links = await dbHandle.pool.query<{ id: string }>(
      `select id
         from core.entity_links
        where workspace_id = $1
          and source_type = 'voc'
          and source_id = $2
          and target_type = 'finding'
          and target_id = $3
          and relation_type = 'created_finding'
          and visibility = 'internal_only'
          and status = 'active'`,
      [WORKSPACE_ID, vocId, body.id],
    );
    expect(links.rowCount).toBe(1);

    const audits = await dbHandle.pool.query<{ event_type: string }>(
      `select event_type
         from core.audit_log
        where workspace_id = $1
          and event_type in ('finding_created_from_voc', 'entity_link.created')
          and (subject_id = $2 or subject_id = $3)
        order by event_type`,
      [WORKSPACE_ID, body.id, links.rows[0]?.id],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual([
      'entity_link.created',
      'finding_created_from_voc',
    ]);
  });

  it('reloads finding detail with immutable source columns and source VOC link', async () => {
    const { vocId } = await seedSource();
    const created = await createFinding(adminCookie, vocId, {
      title: 'Reloadable finding',
      summary: 'Detail must include source provenance after reload.',
      severity: 'medium',
    });
    expect(created.statusCode).toBe(201);
    const findingId = created.json<{ id: string }>().id;

    const detail = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: findingId,
      source_type: 'voc',
      source_id: vocId,
      source: { type: 'voc', id: vocId, relation_type: 'created_finding' },
    });
  });

  it('denies Reporter and out-of-scope Developer, and hides unreadable source VOCs', async () => {
    const { msId, vocId } = await seedSource();

    const reporter = await createFinding(reporterCookie, vocId, {
      title: 'Reporter denied',
      summary: 'Reporter cannot create findings.',
      severity: 'low',
    });
    expect(reporter.statusCode).toBe(403);
    expect(reporter.json<{ code: string }>().code).toBe('permission.denied');

    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('cf'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.manage', otherMs, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const outOfScope = await createFinding(devCookie, vocId, {
      title: 'Out of scope',
      summary: 'Developer lacks finding.manage on target MS.',
      severity: 'medium',
    });
    expect(outOfScope.statusCode).toBe(403);
    expect(outOfScope.json<{ code: string }>().code).toBe('permission.denied');

    const { id: blindDevId, externalId: blindExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('blind'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, blindDevId, 'finding.manage', msId, adminActorId);
    const blindCookie = await loginAs(app, blindExternalId);

    const unreadableSource = await createFinding(blindCookie, vocId, {
      title: 'Unreadable source',
      summary: 'Developer lacks voc.read on source.',
      severity: 'medium',
    });
    expect(unreadableSource.statusCode).toBe(404);
    expect(unreadableSource.json<{ code: string }>().code).toBe('not_found.record');
  });

  it('rejects analytics areas outside the target managed system', async () => {
    const { msId, vocId } = await seedSource();
    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA Other MS');
    const aaId = await createAa(app, adminCookie, {
      managed_system_id: otherMs,
      slug: uid(SLUG_PREFIX),
      name: 'Wrong AA',
    });

    const res = await createFinding(adminCookie, vocId, {
      title: 'Wrong AA finding',
      summary: 'AA belongs to a different MS.',
      severity: 'critical',
      primary_managed_system_id: msId,
      analytics_area_id: aaId,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('replays an idempotent create request with the same finding id', async () => {
    const { vocId } = await seedSource();
    const key = randomUUID();
    const payload = {
      title: 'Idempotent finding',
      summary: 'Retry returns the cached create response.',
      severity: 'high',
    };

    const first = await createFinding(adminCookie, vocId, payload, key);
    const second = await createFinding(adminCookie, vocId, payload, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
  });

  it('lists only findings in the Developer finding.read scope', async () => {
    const sourceA = await seedSource();
    const sourceB = await seedSource();
    const createdA = await createFinding(adminCookie, sourceA.vocId, {
      title: 'Visible finding',
      summary: 'Developer can read this MS.',
      severity: 'low',
    });
    const createdB = await createFinding(adminCookie, sourceB.vocId, {
      title: 'Hidden finding',
      summary: 'Developer cannot read this MS.',
      severity: 'low',
    });
    expect(createdA.statusCode).toBe(201);
    expect(createdB.statusCode).toBe(201);

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('list'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.read',
      sourceA.msId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);

    const list = await app.inject({
      method: 'GET',
      url: '/findings',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });

    expect(list.statusCode).toBe(200);
    const ids = list.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id);
    expect(ids).toContain(createdA.json<{ id: string }>().id);
    expect(ids).not.toContain(createdB.json<{ id: string }>().id);
  });
});
