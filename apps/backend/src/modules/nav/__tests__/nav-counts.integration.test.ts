import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertVocClusterRow } from '../../../test-support/voc-cluster-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { createNavCountsService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-nav-counts';

describe.skipIf(!runIntegration)('GET /nav/counts (#143)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminActorId: string;
  let reporterId: string;

  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const counts = async (cookie: string, query = '') => {
    const response = await app.inject({
      method: 'GET',
      url: `/nav/counts${query}`,
      headers: headers(cookie),
    });
    return { response, body: response.json<{ counts: Record<string, number> }>() };
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');
    const actors = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows[0]!.id;
    reporterId = (
      await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
        [WORKSPACE_ID],
      )
    ).rows[0]!.id;
  });

  async function cleanupNavFixtures() {
    const managedSystems = `select id from core.managed_systems where workspace_id = $1 and slug like $2`;
    await migrateHandle.pool.query(
      `delete from finding.findings where workspace_id = $1 and primary_managed_system_id in (${managedSystems})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id in (${managedSystems})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.surveys where workspace_id = $1 and primary_managed_system_id in (${managedSystems})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, PREFIX);
  }

  beforeEach(cleanupNavFixtures);
  afterAll(async () => {
    await cleanupNavFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('agrees with inbox, triage, and high-tab list totals', async () => {
    const ms = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${PREFIX}-agreement`,
      'Navigation agreement',
    );
    await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'high unassigned', {
      severity: 'high',
    });
    const triagedUnlinkedVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      ms,
      reporterId,
      'triaged high',
      {
        severity: 'high',
        triageState: 'triaged',
      },
    );
    const badge = await counts(adminCookie);
    expect(badge.response.statusCode).toBe(200);
    for (const [url, key] of [
      ['/vocs?view=inbox', 'voc.inbox'],
      ['/vocs?view=triage', 'voc.triage'],
      ['/vocs?view=triage&tab=high', 'voc.tab.high'],
    ] as const) {
      const list = await app.inject({ method: 'GET', url, headers: headers(adminCookie) });
      expect(list.statusCode).toBe(200);
      expect(badge.body.counts[key]).toBe(list.json<{ items: unknown[] }>().items.length);
    }

    const noLinkList = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=no-link',
      headers: headers(adminCookie),
    });
    expect(noLinkList.statusCode).toBe(200);
    const noLinkItems = noLinkList.json<{ items: Array<{ id: string }> }>().items;
    expect(badge.body.counts['voc.inbox.no-link']).toBe(noLinkItems.length);
    expect(noLinkItems.map((item) => item.id)).toContain(triagedUnlinkedVoc.id);

    const triageList = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage',
      headers: headers(adminCookie),
    });
    expect(triageList.statusCode).toBe(200);
    expect(
      triageList.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id),
    ).not.toContain(triagedUnlinkedVoc.id);
  });

  it('emits exact untriaged and waiting triage tab counts for the fixture', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-tab-counts`, 'Tab counts');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'plain untriaged');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'second plain untriaged');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'waiting untriaged', {
      postponedAt: true,
    });
    await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'needs more', {
      triageState: 'needs_more_information',
    });
    await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'already triaged', {
      triageState: 'triaged',
    });

    const badge = await counts(adminCookie, `?managed_system_id=${ms}`);
    expect(badge.response.statusCode).toBe(200);
    // Waiting is untriaged plus postponed, so it is inside the untriaged count.
    expect(badge.body.counts['voc.tab.untriaged']).toBe(3);
    expect(badge.body.counts['voc.tab.waiting']).toBe(1);
    for (const [tab, key, expected] of [
      ['untriaged', 'voc.tab.untriaged', 3],
      ['waiting', 'voc.tab.waiting', 1],
    ] as const) {
      const list = await app.inject({
        method: 'GET',
        url: `/vocs?view=triage&tab=${tab}&managed_system_id=${ms}`,
        headers: headers(adminCookie),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json<{ items: unknown[] }>().items.length).toBe(expected);
      expect(badge.body.counts[key]).toBe(expected);
    }
  });

  it('omits untriaged and waiting tab counts for an actor without VOC read', async () => {
    const result = await counts(userCookie);
    expect(result.response.statusCode).toBe(200);
    expect(Object.hasOwn(result.body.counts, 'voc.tab.untriaged')).toBe(false);
    expect(Object.hasOwn(result.body.counts, 'voc.tab.waiting')).toBe(false);
  });

  it('filters counts to each actor read scope', async () => {
    const msA = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-scope-a`, 'Scope A');
    const msB = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-scope-b`, 'Scope B');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msA, reporterId, 'visible to developer');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msB, reporterId, 'hidden from developer');
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid('nav-counts'));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, dev.externalId);
    const admin = await counts(adminCookie);
    const scoped = await counts(devCookie);
    const scopedNoLinkList = await app.inject({
      method: 'GET',
      url: '/vocs?view=inbox&tab=no-link',
      headers: headers(devCookie),
    });
    expect(admin.response.statusCode).toBe(200);
    expect(scoped.response.statusCode).toBe(200);
    expect(scopedNoLinkList.statusCode).toBe(200);
    if (
      admin.response.statusCode !== 200 ||
      scoped.response.statusCode !== 200 ||
      scopedNoLinkList.statusCode !== 200
    )
      return;
    expect(admin.body.counts['voc.inbox']).toBeGreaterThan(scoped.body.counts['voc.inbox']!);
    expect(scoped.body.counts['voc.inbox']).toBe(1);
    const adminNoLinkCount = admin.body.counts['voc.inbox.no-link'];
    const scopedNoLinkCount = scoped.body.counts['voc.inbox.no-link'];
    expect(adminNoLinkCount).toBeDefined();
    expect(scopedNoLinkCount).toBeDefined();
    if (adminNoLinkCount === undefined || scopedNoLinkCount === undefined) return;
    expect(adminNoLinkCount).toBeGreaterThan(scopedNoLinkCount);
    expect(scoped.body.counts['voc.inbox.no-link']).toBe(
      scopedNoLinkList.json<{ items: unknown[] }>().items.length,
    );
    expect(scopedNoLinkCount).toBe(1);
    expect(scoped.body.counts['voc.triage']).toBeUndefined();
    expect(Object.hasOwn(scoped.body.counts, 'voc.triage')).toBe(false);
    expect(Object.hasOwn(admin.body.counts, 'voc.triage')).toBe(true);
  });

  it('narrows by managed_system_id and rejects an invalid value', async () => {
    const msA = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-narrow-a`, 'Narrow A');
    const msB = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-narrow-b`, 'Narrow B');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msA, reporterId, 'A');
    await insertVocDirectly(dbHandle, WORKSPACE_ID, msB, reporterId, 'B');
    const all = await counts(adminCookie);
    const narrowed = await counts(adminCookie, `?managed_system_id=${msA}`);
    expect(all.body.counts['voc.inbox']).toBeGreaterThan(narrowed.body.counts['voc.inbox']!);
    expect(narrowed.body.counts['voc.inbox']).toBe(1);
    const invalid = await app.inject({
      method: 'GET',
      url: '/nav/counts?managed_system_id=not-a-uuid',
      headers: headers(adminCookie),
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('omits keys with no backing filter instead of returning a stub zero', async () => {
    const result = await counts(adminCookie);
    expect(result.response.statusCode).toBe(200);
    expect(Object.hasOwn(result.body.counts, 'voc.tab.similar')).toBe(false);
    expect(Object.hasOwn(result.body.counts, 'tasks.board')).toBe(false);
  });

  it('emits backed domain counts from seeded findings, surveys, and clusters', async () => {
    const ms = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${PREFIX}-domain-counts`,
      'Domain counts',
    );
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      ms,
      reporterId,
      'domain count source',
    );
    await insertFindingRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      sourceId: voc.id,
      createdBy: adminActorId,
    });
    await insertVocClusterRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      createdBy: adminActorId,
    });
    await dbHandle.pool.query(
      `insert into survey.surveys (
        workspace_id, display_id, type, status, title, primary_managed_system_id,
        operator_actor_id, responses_identity_protected, created_by, opened_at
      ) values ($1, 'S-nav-counts', 'validation', 'open', 'Navigation count survey', $2, $3, true, $3, now())`,
      [WORKSPACE_ID, ms, adminActorId],
    );

    const result = await counts(adminCookie);
    expect(result.response.statusCode).toBe(200);
    expect(result.body.counts['findings.all']).toBe(1);
    expect(result.body.counts['surveys.all']).toBe(1);
    expect(result.body.counts['voc.clusters']).toBe(1);
  });

  it('omits inaccessible domain counts while preserving the User VOC count', async () => {
    const ms = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${PREFIX}-user-counts`,
      'User counts',
    );
    await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'visible to its reporter');

    const result = await counts(userCookie);

    expect(result.response.statusCode).toBe(200);
    expect(result.body.counts['voc.my']).toBe(1);
    expect(Object.hasOwn(result.body.counts, 'voc.inbox.no-link')).toBe(false);
    expect(Object.hasOwn(result.body.counts, 'findings.all')).toBe(false);
  });

  it('surfaces an unexpected VOC count failure as an error response', async () => {
    const failingNavCountsService = createNavCountsService({
      vocReadService: {
        async countVocs() {
          throw new Error('injected VOC count failure');
        },
      },
      findingsService: { listFindings: async () => ({ items: [] }) },
      surveysService: { listSurvey: async () => [] },
      vocClustersService: { listClusters: async () => ({ items: [] }) },
    });
    const failingApp = await buildServer({
      config: loadConfig(),
      dbHandle,
      navCountsService: failingNavCountsService,
    });
    await failingApp.ready();
    try {
      const response = await failingApp.inject({
        method: 'GET',
        url: '/nav/counts',
        headers: headers(adminCookie),
      });
      expect(response.statusCode).toBe(500);
      expect(response.json<{ code: string }>().code).toBe('internal.unexpected');
    } finally {
      await failingApp.close();
    }
  });
});
