// POST/GET /findings/:id/evidence-highlights + POST /findings/:id/link-evidence.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role is
// required for cleanup of append-only core.entity_links and core.audit_log rows.

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
import { insertFindingRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-evidence';

describe.skipIf(!runIntegration)('Evidence Highlights backend (#124)', () => {
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
      `delete from finding.evidence_highlights
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and relation_type in ('created_finding', 'evidence_of')
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and event_type in ('evidence_highlight_added', 'entity_link.created', 'entity_link.detached')`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id = $2
          and capability = 'finding.read'
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $3
          )`,
      [WORKSPACE_ID, reporterActorId, `${SLUG_PREFIX}%`],
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

  async function seedSource(
    title = 'Evidence Source VOC',
    msId?: string,
  ): Promise<{ msId: string; vocId: string; vocDisplayId: string; title: string }> {
    const managedSystemId =
      msId ?? (await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), `${title} MS`));
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      managedSystemId,
      reporterActorId,
      title,
    );
    const display = await dbHandle.pool.query<{ display_id: string }>(
      'select display_id from voc.vocs where id = $1',
      [voc.id],
    );
    const vocDisplayId = display.rows[0]?.display_id;
    if (!vocDisplayId) throw new Error(`seedSource failed to read display_id for ${title}`);
    return { msId: managedSystemId, vocId: voc.id, vocDisplayId, title };
  }

  async function seedFinding(input: {
    managedSystemId: string;
    sourceVocId: string;
    title?: string;
  }): Promise<{ id: string }> {
    return insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: input.managedSystemId,
      title: input.title ?? 'Seeded Evidence Finding',
      sourceId: input.sourceVocId,
      createdBy: adminActorId,
    });
  }

  function postHighlight(cookie: string, findingId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/findings/${findingId}/evidence-highlights`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
      },
      payload,
    });
  }

  function getHighlights(cookie: string, findingId: string) {
    return app.inject({
      method: 'GET',
      url: `/findings/${findingId}/evidence-highlights`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  function linkEvidence(cookie: string, findingId: string, sourceVocId: string) {
    return app.inject({
      method: 'POST',
      url: `/findings/${findingId}/link-evidence`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
      },
      payload: { source_type: 'voc', source_id: sourceVocId },
    });
  }

  function getEntityLinks(cookie: string, query: string) {
    return app.inject({
      method: 'GET',
      url: `/entity-links${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  function patchEntityLink(cookie: string, linkId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/entity-links/${linkId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
      },
      payload,
    });
  }

  it('adds a VOC evidence highlight and increments evidence_count in the same transaction', async () => {
    const source = await seedSource();
    const finding = await seedFinding({
      managedSystemId: source.msId,
      sourceVocId: source.vocId,
    });

    const res = await postHighlight(adminCookie, finding.id, {
      source_type: 'voc',
      source_id: source.vocId,
      quote_or_summary: 'Export failed after the billing cutoff.',
      sentiment: 'negative',
      importance: 'high',
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      finding_id: finding.id,
      source_type: 'voc',
      source_id: source.vocId,
      source_title: source.title,
      source_meta: source.vocDisplayId,
      quote_or_summary: 'Export failed after the billing cutoff.',
      sentiment: 'negative',
      importance: 'high',
    });

    const persisted = await dbHandle.pool.query<{ evidence_count: number; highlights: number }>(
      `select f.evidence_count::int, count(e.id)::int as highlights
         from finding.findings f
         left join finding.evidence_highlights e on e.finding_id = f.id
        where f.id = $1
        group by f.id`,
      [finding.id],
    );
    expect(persisted.rows[0]).toEqual({ evidence_count: 1, highlights: 1 });
  });

  it('lists readable highlight quotes for actors with Finding and source access', async () => {
    const source = await seedSource();
    const finding = await seedFinding({
      managedSystemId: source.msId,
      sourceVocId: source.vocId,
    });
    await postHighlight(adminCookie, finding.id, {
      source_type: 'voc',
      source_id: source.vocId,
      quote_or_summary: 'The saved highlight is visible to source readers.',
    });

    const list = await getHighlights(adminCookie, finding.id);

    expect(list.statusCode).toBe(200);
    expect(list.json<{ items: Array<Record<string, unknown>> }>().items).toEqual([
      expect.objectContaining({
        finding_id: finding.id,
        quote_or_summary: 'The saved highlight is visible to source readers.',
        source_title: source.title,
        source_meta: source.vocDisplayId,
      }),
    ]);
  });

  it('withholds each highlight quote when the actor can read the Finding but not the source VOC', async () => {
    const findingSource = await seedSource('Finding Source VOC');
    const evidenceSource = await seedSource('Hidden Evidence VOC');
    const finding = await seedFinding({
      managedSystemId: findingSource.msId,
      sourceVocId: findingSource.vocId,
    });
    await postHighlight(adminCookie, finding.id, {
      source_type: 'voc',
      source_id: evidenceSource.vocId,
      quote_or_summary: 'This raw source quote must not leak.',
    });

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('redact'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.read',
      findingSource.msId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);

    const list = await getHighlights(devCookie, finding.id);

    expect(list.statusCode).toBe(200);
    const items = list.json<{ items: Array<Record<string, unknown>> }>().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      finding_id: finding.id,
      source_type: 'voc',
      source_id: evidenceSource.vocId,
      source_title: null,
      source_meta: null,
    });
    expect(items[0]).not.toHaveProperty('quote_or_summary');
  });

  it('returns null source title and meta for note evidence highlights', async () => {
    const source = await seedSource();
    const finding = await seedFinding({
      managedSystemId: source.msId,
      sourceVocId: source.vocId,
    });
    const created = await postHighlight(adminCookie, finding.id, {
      source_type: 'note',
      quote_or_summary: 'Internal synthesis note.',
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      finding_id: finding.id,
      source_type: 'note',
      source_id: null,
      source_title: null,
      source_meta: null,
      quote_or_summary: 'Internal synthesis note.',
    });

    const list = await getHighlights(adminCookie, finding.id);

    expect(list.statusCode).toBe(200);
    expect(list.json<{ items: Array<Record<string, unknown>> }>().items).toEqual([
      expect.objectContaining({
        source_type: 'note',
        source_id: null,
        source_title: null,
        source_meta: null,
      }),
    ]);
  });

  it('links additional VOC evidence to a Finding using the evidence_of tuple', async () => {
    const source = await seedSource();
    // Cross-MS link creation is rejected (#388): the extra evidence VOC must
    // share the Finding's Managed System.
    const extra = await seedSource('Additional Evidence VOC', source.msId);
    const finding = await seedFinding({
      managedSystemId: source.msId,
      sourceVocId: source.vocId,
    });

    const res = await linkEvidence(adminCookie, finding.id, extra.vocId);

    expect(res.statusCode).toBe(201);
    const linkId = res.json<{ id: string }>().id;
    const links = await dbHandle.pool.query<{ id: string }>(
      `select id
         from core.entity_links
        where workspace_id = $1
          and source_type = 'voc'
          and source_id = $2
          and target_type = 'finding'
          and target_id = $3
          and relation_type = 'evidence_of'
          and visibility = 'internal_only'
          and status = 'active'`,
      [WORKSPACE_ID, extra.vocId, finding.id],
    );
    expect(links.rowCount).toBe(1);

    const targetQuery = `?target_type=finding&target_id=${finding.id}`;
    const adminList = await getEntityLinks(adminCookie, targetQuery);
    expect(adminList.statusCode).toBe(200);
    expect(
      adminList
        .json<{ items: Array<Record<string, unknown>> }>()
        .items.find((item) => item.id === linkId),
    ).toMatchObject({
      source_type: 'voc',
      source_id: extra.vocId,
      target_type: 'finding',
      target_id: finding.id,
      relation_type: 'evidence_of',
      visibility_state: 'allowed',
    });

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('evlink'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', extra.msId, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.read', source.msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const devList = await getEntityLinks(devCookie, targetQuery);
    expect(devList.statusCode).toBe(200);
    expect(
      devList
        .json<{ items: Array<Record<string, unknown>> }>()
        .items.find((item) => item.id === linkId),
    ).toMatchObject({
      source_type: 'voc',
      source_id: extra.vocId,
      target_type: 'finding',
      target_id: finding.id,
      relation_type: 'evidence_of',
      visibility_state: 'allowed',
    });

    const { id: outScopeDevId, externalId: outScopeExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('evout'),
    );
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      outScopeDevId,
      'finding.read',
      source.msId,
      adminActorId,
    );
    const outScopeCookie = await loginAs(app, outScopeExternalId);

    const outScopeList = await getEntityLinks(outScopeCookie, targetQuery);
    expect(outScopeList.statusCode).toBe(200);
    const outScopeRow = outScopeList
      .json<{ items: Array<Record<string, unknown>> }>()
      .items.find((item) => item.id === linkId);
    expect(outScopeRow).toMatchObject({
      source_type: 'voc',
      target_type: 'finding',
      relation_type: 'evidence_of',
      visibility_state: 'hidden',
    });
    expect(outScopeRow?.source_id).toBeUndefined();
    expect(outScopeRow?.target_id).toBeUndefined();

    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      reporterActorId,
      'finding.read',
      source.msId,
      adminActorId,
    );
    const reporterList = await getEntityLinks(reporterCookie, targetQuery);
    expect(reporterList.statusCode).toBe(200);
    const reporterRow = reporterList
      .json<{ items: Array<Record<string, unknown>> }>()
      .items.find((item) => item.id === linkId);
    expect(reporterRow).toMatchObject({
      source_type: 'voc',
      target_type: 'finding',
      relation_type: 'evidence_of',
      visibility_state: 'hidden',
    });
    expect(reporterRow?.source_id).toBeUndefined();
    expect(reporterRow?.target_id).toBeUndefined();

    const detach = await patchEntityLink(adminCookie, linkId, { reason: 'Evidence superseded' });
    expect(detach.statusCode).toBe(200);
    expect(detach.json()).toMatchObject({ id: linkId, status: 'detached' });

    const afterDetach = await getEntityLinks(adminCookie, targetQuery);
    expect(afterDetach.statusCode).toBe(200);
    expect(
      afterDetach.json<{ items: Array<{ id: string }> }>().items.some((item) => item.id === linkId),
    ).toBe(false);
  });

  it('allows the VOC to Finding evidence_of DB tuple and still rejects invalid tuples', async () => {
    const source = await seedSource();
    const invalidTarget = await seedSource('Invalid Evidence Target VOC');
    const finding = await seedFinding({
      managedSystemId: source.msId,
      sourceVocId: source.vocId,
    });

    const accepted = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, 'voc', $2, 'finding', $3, 'evidence_of', 'internal_only', 'active', $4, $5)
       returning id`,
      [WORKSPACE_ID, source.vocId, finding.id, source.msId, adminActorId],
    );
    expect(accepted.rowCount).toBe(1);

    await expect(
      migrateHandle.pool.query(
        `insert into core.entity_links (
            workspace_id, source_type, source_id, target_type, target_id,
            relation_type, visibility, status, managed_system_id, created_by
          )
         values ($1, 'voc', $2, 'voc', $3, 'evidence_of', 'internal_only', 'active', $4, $5)`,
        [WORKSPACE_ID, source.vocId, invalidTarget.vocId, source.msId, adminActorId],
      ),
    ).rejects.toThrow();
  });

  it('denies unauthorized highlight writes and hides unreadable source VOCs on link-evidence', async () => {
    const source = await seedSource();
    // The source is cross-MS and unreadable. The missing voc.read scope must
    // still be evaluated before #388's compatibility rejection is disclosed.
    const hidden = await seedSource('Unreadable Link Evidence VOC');
    const finding = await seedFinding({
      managedSystemId: source.msId,
      sourceVocId: source.vocId,
    });

    const reporterAdd = await postHighlight(reporterCookie, finding.id, {
      source_type: 'voc',
      source_id: source.vocId,
      quote_or_summary: 'Reporter cannot manage findings.',
    });
    expect(reporterAdd.statusCode).toBe(403);

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('authz'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.manage',
      source.msId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);

    const unreadableSource = await linkEvidence(devCookie, finding.id, hidden.vocId);
    expect(unreadableSource.statusCode).toBe(404);
    expect(unreadableSource.json<{ code: string }>().code).toBe('not_found.record');
  });

  it('AC-388-4 link-evidence rejects a cross-MS source VOC without persisting a link (AC-388-3)', async () => {
    const source = await seedSource();
    const crossMs = await seedSource('Cross-MS Evidence VOC');
    const finding = await seedFinding({
      managedSystemId: source.msId,
      sourceVocId: source.vocId,
    });

    const res = await linkEvidence(adminCookie, finding.id, crossMs.vocId);

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
    const rows = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where workspace_id = $1 and source_id = $2 and target_id = $3`,
      [WORKSPACE_ID, crossMs.vocId, finding.id],
    );
    expect(rows.rows[0]?.n).toBe(0);
  });
});
