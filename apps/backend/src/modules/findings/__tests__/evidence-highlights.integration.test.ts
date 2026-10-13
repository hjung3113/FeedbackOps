// POST/GET /findings/:id/evidence-highlights + POST /findings/:id/link-evidence.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role is
// required for cleanup of append-only core.entity_links and core.audit_log rows.

import { randomUUID } from 'node:crypto';
import { evidenceInventoryItemSchema, listEvidenceInventoryResponseSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  grantCapability,
  revokeCapabilityGrant,
  seedPermissionSelectedReadScale,
} from '../../../test-support/permissions-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';
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

  it('retains app-readable authored note text after the Survey-only cutover (#739)', async () => {
    const source = await seedSource();
    const finding = await seedFinding({ managedSystemId: source.msId, sourceVocId: source.vocId });
    const created = await postHighlight(adminCookie, finding.id, {
      source_type: 'note',
      quote_or_summary: 'Authored note remains readable.',
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    const rows = await dbHandle.pool.query(
      'select source_id,approved_excerpt_id,quote_or_summary from finding.evidence_highlights where id=$1',
      [id],
    );
    expect(rows.rows).toEqual([
      {
        source_id: null,
        approved_excerpt_id: null,
        quote_or_summary: 'Authored note remains readable.',
      },
    ]);
    const list = await getHighlights(adminCookie, finding.id);
    expect(list.statusCode).toBe(200);
    expect(list.body).toContain('Authored note remains readable.');
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
    const links = await migrateHandle.pool.query<{ id: string }>(
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
    const rows = await migrateHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where workspace_id = $1 and source_id = $2 and target_id = $3`,
      [WORKSPACE_ID, crossMs.vocId, finding.id],
    );
    expect(rows.rows[0]?.n).toBe(0);
  });
  function inventory(cookie: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/evidence-highlights${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }
  function inventoryDetail(cookie: string, id: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/evidence-highlights/${id}${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('inventory returns only safe note metadata and directly reads a later page without mutation', async () => {
    const source = await seedSource();
    const finding = await seedFinding({ managedSystemId: source.msId, sourceVocId: source.vocId });
    const ids: string[] = [];
    for (const quote of ['earlier', 'later']) {
      const added = await postHighlight(adminCookie, finding.id, {
        source_type: 'note',
        quote_or_summary: quote,
      });
      expect(added.statusCode).toBe(201);
      ids.push(added.json<{ id: string }>().id);
    }
    const snapshot = () =>
      migrateHandle.pool.query(
        `select (select count(*)::int from core.audit_log where workspace_id=$1::uuid) as audits,
        (select count(*)::int from core.entity_links where workspace_id=$1::uuid) as links,
        (select evidence_count from finding.findings where id=$2::uuid) as evidence_count`,
        [WORKSPACE_ID, finding.id],
      );
    const before = (await snapshot()).rows;
    const first = await inventory(adminCookie, `?managed_system_id=${source.msId}&limit=1`);
    expect(first.statusCode).toBe(200);
    const page = listEvidenceInventoryResponseSchema.parse(first.json());
    expect(page.items.map((item) => item.id)).toEqual([ids[1]]);
    expect(page.page.has_more).toBe(true);
    const detail = await inventoryDetail(adminCookie, ids[0] ?? '');
    expect(detail.statusCode).toBe(200);
    const item = evidenceInventoryItemSchema.parse(detail.json());
    expect(Object.keys(item).sort()).toEqual([
      'analytics_area_id',
      'content_state',
      'created_at',
      'finding',
      'finding_id',
      'id',
      'importance',
      'primary_managed_system_id',
      'quote_or_summary',
      'sentiment',
      'source_type',
    ]);
    expect(Object.keys(item.finding).sort()).toEqual(['display_id', 'id', 'title']);
    const second = await inventory(
      adminCookie,
      `?managed_system_id=${source.msId}&limit=1&cursor=${encodeURIComponent(page.page.cursor ?? '')}`,
    );
    expect(second.json().items.map((row: { id: string }) => row.id)).toEqual([ids[0]]);
    expect(second.json().page).toEqual({ has_more: false });
    expect((await snapshot()).rows).toEqual(before);
  });

  it('inventory excludes denied parents and hidden VOC text before literal search and pagination', async () => {
    const a = await seedSource('allowed');
    const b = await seedSource('hidden-source-needle');
    const parentA = await seedFinding({
      managedSystemId: a.msId,
      sourceVocId: a.vocId,
      title: 'Safe parent marker',
    });
    const parentB = await seedFinding({ managedSystemId: b.msId, sourceVocId: b.vocId });
    const visible = await postHighlight(adminCookie, parentA.id, {
      source_type: 'note',
      quote_or_summary: 'Literal %_ MixedCase',
    });
    const hidden = await postHighlight(adminCookie, parentA.id, {
      source_type: 'voc',
      source_id: b.vocId,
      quote_or_summary: 'hidden-quote-needle',
    });
    await postHighlight(adminCookie, parentB.id, {
      source_type: 'note',
      quote_or_summary: 'denied-parent-needle',
    });
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'finding.read', a.msId, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'finding.read', b.msId, adminActorId);
    await denyCapability(migrateHandle, WORKSPACE_ID, dev.id, 'finding.read', b.msId, adminActorId);
    const cookie = await loginAs(app, dev.externalId);
    for (const q of [
      'hidden-source-needle',
      'hidden-quote-needle',
      'denied-parent-needle',
      'Finding summary',
    ]) {
      const res = await inventory(cookie, `?q=${encodeURIComponent(q)}&limit=1`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [], page: { has_more: false } });
    }
    const literal = await inventory(cookie, '?q=%25_ mixedcase&limit=1');
    expect(literal.json().items.map((row: { id: string }) => row.id)).toEqual([
      visible.json<{ id: string }>().id,
    ]);
    expect(literal.json().page).toEqual({ has_more: false });
    const safe = await inventory(cookie, '?q=safe parent marker&limit=1');
    expect(safe.json().items[0]).toMatchObject({ id: hidden.json().id, content_state: 'withheld' });
    expect(safe.json().items[0]).not.toHaveProperty('source');
    expect(safe.json().items[0]).not.toHaveProperty('quote_or_summary');
    expect(safe.json().page.has_more).toBe(true);
    expect((await inventory(cookie, `?managed_system_id=${b.msId}`)).json()).toEqual({
      items: [],
      page: { has_more: false },
    });
    expect((await inventoryDetail(cookie, hidden.json().id)).statusCode).toBe(200);
  });

  it('inventory blocks a User even with a Finding grant and validates selected reads', async () => {
    const source = await seedSource();
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      reporterActorId,
      'finding.read',
      source.msId,
      adminActorId,
    );
    expect((await inventory(reporterCookie)).statusCode).toBe(403);
    expect((await inventoryDetail(reporterCookie, randomUUID())).statusCode).toBe(403);
    expect((await inventoryDetail(adminCookie, randomUUID())).statusCode).toBe(404);
    expect((await inventoryDetail(adminCookie, 'bad')).statusCode).toBe(422);
    expect((await inventoryDetail(adminCookie, randomUUID(), '?q=x')).statusCode).toBe(422);
    expect((await inventory(adminCookie, '?limit=0')).statusCode).toBe(422);
    expect((await inventory(adminCookie, '?unexpected=x')).statusCode).toBe(422);
  });

  it('inventory preserves microseconds/UUID ties and binds cursors to normalized session context', async () => {
    const source = await seedSource();
    const finding = await seedFinding({ managedSystemId: source.msId, sourceVocId: source.vocId });
    const ids = [
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ];
    await migrateHandle.pool.query(
      `insert into finding.evidence_highlights (id,workspace_id,finding_id,primary_managed_system_id,
        source_type,quote_or_summary,created_by,created_at)
       values ($1,$4,$5,$6,'note','precision needle',$7,'2026-10-13 00:00:00.000002+00'),
         ($2,$4,$5,$6,'note','precision needle',$7,'2026-10-13 00:00:00.000001+00'),
         ($3,$4,$5,$6,'note','precision needle',$7,'2026-10-13 00:00:00.000001+00')`,
      [...ids, WORKSPACE_ID, finding.id, source.msId, adminActorId],
    );
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      dev.id,
      'finding.read',
      source.msId,
      adminActorId,
    );
    const cookie = await loginAs(app, dev.externalId);
    const first = await inventory(adminCookie, '?q= Precision NEEDLE &limit=1');
    const cursor = first.json().page.cursor as string;
    expect(first.json().items.map((row: { id: string }) => row.id)).toEqual([ids[0]]);
    for (const [actor, query] of [
      [cookie, '?q=precision needle'],
      [adminCookie, `?q=precision needle&managed_system_id=${source.msId}`],
      [adminCookie, '?q=precision needle&source_type=note'],
      [adminCookie, '?q=other'],
    ]) {
      const res = await inventory(actor ?? '', `${query}&cursor=${encodeURIComponent(cursor)}`);
      expect(res.statusCode).toBe(422);
      expect(res.json().detail.fields).toContainEqual({ path: ['cursor'], code: 'invalid_cursor' });
    }
    const next = await inventory(
      adminCookie,
      `?managed_system_id=all&q=precision needle&limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(next.statusCode).toBe(200);
    expect(next.json().items.map((row: { id: string }) => row.id)).toEqual([ids[1]]);
    const third = await inventory(
      adminCookie,
      `?q=precision needle&limit=1&cursor=${encodeURIComponent(next.json().page.cursor)}`,
    );
    expect(third.json().items.map((row: { id: string }) => row.id)).toEqual([ids[2]]);
    expect(third.json().page).toEqual({ has_more: false });
    expect((await inventory(adminCookie, '?cursor=garbage')).statusCode).toBe(422);
  });

  it('inventory reauthorizes parent and VOC source loss between pages', async () => {
    const source = await seedSource();
    const finding = await seedFinding({ managedSystemId: source.msId, sourceVocId: source.vocId });
    const attached = await postHighlight(adminCookie, finding.id, {
      source_type: 'voc',
      source_id: source.vocId,
      quote_or_summary: 'permission loss quote',
    });
    await postHighlight(adminCookie, finding.id, {
      source_type: 'note',
      quote_or_summary: 'first',
    });
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      dev.id,
      'finding.read',
      source.msId,
      adminActorId,
    );
    const sourceGrant = await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      dev.id,
      'voc.read',
      source.msId,
      adminActorId,
    );
    const cookie = await loginAs(app, dev.externalId);
    const first = await inventory(cookie, `?managed_system_id=${source.msId}&limit=1`);
    await revokeCapabilityGrant(migrateHandle, sourceGrant, adminActorId);
    const continued = await inventory(
      cookie,
      `?managed_system_id=${source.msId}&limit=1&cursor=${encodeURIComponent(first.json().page.cursor)}`,
    );
    expect(continued.json().items[0]).toMatchObject({
      id: attached.json().id,
      content_state: 'withheld',
    });
    expect(continued.body).not.toContain('permission loss quote');
    expect((await inventoryDetail(cookie, attached.json().id)).json().content_state).toBe(
      'withheld',
    );
    await denyCapability(
      migrateHandle,
      WORKSPACE_ID,
      dev.id,
      'finding.read',
      source.msId,
      adminActorId,
    );
    expect((await inventory(cookie, `?managed_system_id=${source.msId}`)).json()).toEqual({
      items: [],
      page: { has_more: false },
    });
    expect((await inventoryDetail(cookie, attached.json().id)).statusCode).toBe(404);
  });

  it('measures stable bounded Evidence pagination at representative ordinary fan-out', async () => {
    const source = await seedSource('inventory-scale');
    const finding = await seedFinding({ managedSystemId: source.msId, sourceVocId: source.vocId });
    try {
      const workload = await seedPermissionSelectedReadScale(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        managedSystemId: source.msId,
        actorId: adminActorId,
        prefix: uid(SLUG_PREFIX),
      });
      await migrateHandle.pool.query(
        `insert into finding.findings (workspace_id,display_id,primary_managed_system_id,title,summary,
          source_type,source_id,severity,status,created_by)
         select workspace_id,$2 || n,primary_managed_system_id,title,summary,
           source_type,source_id,severity,status,created_by
         from finding.findings cross join generate_series(1,29) n where id=$1`,
        [finding.id, uid('FIN-scale')],
      );
      await migrateHandle.pool.query(
        `insert into finding.evidence_highlights (workspace_id,finding_id,primary_managed_system_id,
          source_type,quote_or_summary,created_by)
         select workspace_id,id,primary_managed_system_id,'note','inventory-scale excerpt',created_by
         from finding.findings cross join generate_series(1,100) n
         where primary_managed_system_id=$1`,
        [source.msId],
      );
      await migrateHandle.pool.query(
        'update finding.findings set evidence_count=100 where primary_managed_system_id=$1',
        [source.msId],
      );
      const plan = await dbHandle.pool.query(
        `explain (analyze,buffers,format json)
         select h.id,h.finding_id,f.primary_managed_system_id,h.source_type,h.source_id,
           h.quote_or_summary,h.analytics_area_id,h.sentiment,h.importance,h.created_at,
           h.created_at::text as cursor_timestamp,f.display_id,f.title
         from finding.evidence_highlights h join finding.findings f
           on f.workspace_id=h.workspace_id and f.id=h.finding_id
         where h.workspace_id=$1 and f.primary_managed_system_id=any($2::uuid[])
         order by h.created_at desc,h.id desc limit 100`,
        [WORKSPACE_ID, [source.msId]],
      );
      const url = `?managed_system_id=${source.msId}&limit=100&q=inventory-scale`;
      const start = performance.now();
      const first = await inventory(adminCookie, url);
      const firstMs = performance.now() - start;
      expect(first.statusCode).toBe(200);
      const ids = new Set<string>();
      let page = listEvidenceInventoryResponseSchema.parse(first.json());
      const lastItem = page.items.at(-1);
      if (!lastItem) throw new Error('scale first page missing');
      const stored = await migrateHandle.pool.query<{ timestamp: string }>(
        'select created_at::text as timestamp from finding.evidence_highlights where id=$1',
        [lastItem.id],
      );
      const continuationPlan = await dbHandle.pool.query(
        `explain (analyze,buffers,format json)
         select h.id,h.finding_id,f.primary_managed_system_id,h.source_type,h.source_id,
           h.quote_or_summary,h.analytics_area_id,h.sentiment,h.importance,h.created_at,
           h.created_at::text as cursor_timestamp,f.display_id,f.title
         from finding.evidence_highlights h join finding.findings f
           on f.workspace_id=h.workspace_id and f.id=h.finding_id
         where h.workspace_id=$1 and f.primary_managed_system_id=any($2::uuid[])
           and (h.created_at,h.id)<($3::timestamptz,$4::uuid)
         order by h.created_at desc,h.id desc limit 100`,
        [WORKSPACE_ID, [source.msId], stored.rows[0]?.timestamp, lastItem.id],
      );
      const continuationStart = performance.now();
      const continuation = await inventory(
        adminCookie,
        `${url}&cursor=${encodeURIComponent(page.page.cursor ?? '')}`,
      );
      const continuationMs = performance.now() - continuationStart;
      expect(continuation.statusCode).toBe(200);
      expect((await inventory(adminCookie, url)).json()).toEqual(first.json());
      const replay = await inventory(
        adminCookie,
        `${url}&cursor=${encodeURIComponent(page.page.cursor ?? '')}`,
      );
      expect(replay.json()).toEqual(continuation.json());
      let pages = 0;
      while (true) {
        expect(page.items.length).toBeLessThanOrEqual(100);
        for (const item of page.items) {
          expect(ids.has(item.id)).toBe(false);
          ids.add(item.id);
        }
        pages++;
        if (!page.page.has_more) break;
        const next = await inventory(
          adminCookie,
          `${url}&cursor=${encodeURIComponent(page.page.cursor ?? '')}`,
        );
        expect(next.statusCode).toBe(200);
        page = listEvidenceInventoryResponseSchema.parse(next.json());
      }
      expect(ids.size).toBe(3000);
      expect(pages).toBe(30);
      expect(workload.vocCount).toBeGreaterThanOrEqual(5000);
      expect(workload.taskCount).toBe(5000);
      console.info('W-1106 ordinary pagination measurement', {
        vocs: workload.vocCount,
        tasks: workload.taskCount,
        findings: 30,
        highlights: ids.size,
        pages,
        firstMs,
        continuationMs,
        plan: plan.rows,
        continuationPlan: continuationPlan.rows,
      });
    } finally {
      await migrateHandle.pool.query('delete from task.tasks where primary_managed_system_id=$1', [
        source.msId,
      ]);
    }
  }, 60_000);

  it('inventory searches projected content across hidden-source batches without hidden cursor influence', async () => {
    const a = await seedSource('batch-visible');
    const b = await seedSource('batch-hidden-source');
    const finding = await seedFinding({ managedSystemId: a.msId, sourceVocId: a.vocId });
    await migrateHandle.pool.query(
      `insert into finding.evidence_highlights (workspace_id,finding_id,primary_managed_system_id,
        source_type,source_id,quote_or_summary,created_by,created_at)
       select $1::uuid,$2::uuid,$3::uuid,'voc',$4::uuid,'batch-hidden-quote',$5::uuid,
         '2026-10-13 00:00:00+00'::timestamptz + n * interval '1 microsecond'
       from generate_series(1,150) n`,
      [WORKSPACE_ID, finding.id, a.msId, b.vocId, adminActorId],
    );
    const notes = await migrateHandle.pool.query<{ id: string }>(
      `insert into finding.evidence_highlights (workspace_id,finding_id,primary_managed_system_id,
        source_type,quote_or_summary,created_by,created_at)
       values ($1,$2,$3,'note','batch-visible-quote',$4,'2026-10-13 00:00:00.001+00'),
         ($1,$2,$3,'note','batch-visible-quote',$4,'2026-10-13 00:00:00+00') returning id`,
      [WORKSPACE_ID, finding.id, a.msId, adminActorId],
    );
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'finding.read', a.msId, adminActorId);
    const cookie = await loginAs(app, dev.externalId);
    const first = await inventory(cookie, '?q=batch-visible-quote&limit=1');
    expect(first.statusCode).toBe(200);
    expect(first.json().items.map((row: { id: string }) => row.id)).toEqual([notes.rows[0]?.id]);
    expect(first.json().page.has_more).toBe(true);
    const next = await inventory(
      cookie,
      `?q=batch-visible-quote&limit=1&cursor=${encodeURIComponent(first.json().page.cursor)}`,
    );
    expect(next.json().items.map((row: { id: string }) => row.id)).toEqual([notes.rows[1]?.id]);
    expect(next.json().page).toEqual({ has_more: false });
    expect((await inventory(cookie, '?q=batch-hidden-quote&limit=1')).json()).toEqual({
      items: [],
      page: { has_more: false },
    });
  });

  it('inventory retains readable VOC metadata and the ordinary reporter exception', async () => {
    const target = await seedSource('voc-target');
    const source = await seedSource('voc-source');
    const finding = await seedFinding({ managedSystemId: target.msId, sourceVocId: target.vocId });
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      dev.id,
      'finding.read',
      target.msId,
      adminActorId,
    );
    const ownVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      source.msId,
      dev.id,
      'own source title',
    );
    const attached = await postHighlight(adminCookie, finding.id, {
      source_type: 'voc',
      source_id: ownVoc.id,
      quote_or_summary: 'own source excerpt',
    });
    expect(attached.statusCode).toBe(201);
    const cookie = await loginAs(app, dev.externalId);
    const detail = await inventoryDetail(cookie, attached.json().id);
    expect(detail.statusCode).toBe(200);
    const item = evidenceInventoryItemSchema.parse(detail.json());
    if (item.source_type !== 'voc') throw new Error('VOC item missing');
    expect(item.content_state).toBe('available');
    expect(item.quote_or_summary).toBe('own source excerpt');
    expect(item.source).toEqual({
      id: ownVoc.id,
      display_id: expect.any(String),
      title: 'own source title',
      route: `/vocs?view=inbox&selected=${ownVoc.id}`,
    });
    expect(Object.keys(item.source ?? {}).sort()).toEqual(['display_id', 'id', 'route', 'title']);
    const search = await inventory(cookie, '?q=own source title');
    expect(search.json().items.map((row: { id: string }) => row.id)).toEqual([attached.json().id]);
  });

  it('#1109 selection attachment stays separate from the shipped generic UUID/quote command', async () => {
    const source = await seedSource('Existing generic source');
    const target = await seedFinding({ managedSystemId: source.msId, sourceVocId: source.vocId });
    const generic = await postHighlight(adminCookie, target.id, {
      source_type: 'survey_response',
      source_id: randomUUID(),
      quote_or_summary: 'unapproved text',
    });
    expect(generic.statusCode).toBe(422);
    expect(generic.json().code).toBe('validation.failed');
    const strict = await app.inject({
      method: 'POST',
      url: `/findings/${target.id}/survey-evidence`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'idempotency-key': randomUUID(),
        'content-type': 'application/json',
      },
      payload: { approved_excerpt_id: randomUUID(), quote_or_summary: 'unapproved text' },
    });
    expect(strict.statusCode).toBe(422);
    expect(strict.json().detail.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: [], code: 'unrecognized_keys' })]),
    );
    expect((await getHighlights(adminCookie, target.id)).json()).toEqual({ items: [] });
  });
});
