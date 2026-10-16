import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { loginAs } from '../../../test-support/auth.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import {
  grantCapability,
  insertActorRow,
  insertVocClusterMemberRow,
  insertVocClusterRow,
  insertVocRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

type Candidate = { voc_id: string; display_id: string; title: string };
type Body = { candidates: Candidate[]; page: { has_more: boolean; cursor?: string } };

describe.skipIf(!runIntegration)('VOC cluster candidate-peers paging (#1176)', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let adminId: string;
  let adminCookie: string;
  let msId: string;
  let clusterId: string;
  let scopedActorId: string;
  let scopedCookie: string;
  let ownerActorId: string;
  let ownerCookie: string;
  let outsiderActorId: string;
  let outsiderCookie: string;
  let noReadActorId: string;
  let noReadCookie: string;
  // Newest first, i.e. the expected `created_at desc, id desc` order of readable candidates.
  let expectedOrder: string[] = [];
  let ownerVocId: string;
  let memberVocId: string;
  let archivedVocId: string;
  const vocIds: string[] = [];
  const externalIds: string[] = [];
  const denyActorIds: string[] = [];

  const headers = (cookie: string) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'workspace-id': WORKSPACE_ID,
  });

  async function get(cookie: string, query = '', id = clusterId) {
    return app.inject({
      method: 'GET',
      url: `/voc-clusters/${id}/candidate-peers${query}`,
      headers: headers(cookie),
    });
  }

  async function walk(cookie: string, limit: number, extra = ''): Promise<Body[]> {
    const pages: Body[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 50; guard += 1) {
      const response = await get(
        cookie,
        `?limit=${limit}${extra}${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
      );
      expect(response.statusCode).toBe(200);
      const body = response.json() as Body;
      pages.push(body);
      if (!body.page.has_more) return pages;
      cursor = body.page.cursor;
      expect(cursor).toBeDefined();
    }
    throw new Error('candidate paging did not terminate');
  }

  async function newVoc(title: string, reporterId: string, createdAt: string) {
    const { id } = await insertVocRow(ops, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      reporterId,
      title,
    });
    await ops.pool.query('update voc.vocs set created_at=$1::timestamptz where id=$2', [
      createdAt,
      id,
    ]);
    vocIds.push(id);
    return id;
  }

  async function newActor(roleLevel: 'admin' | 'developer', label: string) {
    const externalId = `candidate-paging-${label}-${randomUUID()}`;
    externalIds.push(externalId);
    const actor = await insertActorRow(ops, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    return { ...actor, externalId };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();

    adminId =
      (
        await ops.pool.query<{ id: string }>(
          `select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'`,
          [WORKSPACE_ID],
        )
      ).rows[0]?.id ?? '';
    if (!adminId) throw new Error('admin seed missing');
    adminCookie = await loginAs(app, 'mock-admin-1');

    msId =
      (
        await ops.pool.query<{ id: string }>(
          'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
          [WORKSPACE_ID, `candidate-paging-${randomUUID()}`, 'Candidate paging'],
        )
      ).rows[0]?.id ?? '';

    const scoped = await newActor('developer', 'scoped');
    const owner = await newActor('developer', 'owner');
    const outsider = await newActor('developer', 'outsider');
    const noRead = await newActor('developer', 'no-read');
    scopedActorId = scoped.id;
    ownerActorId = owner.id;
    outsiderActorId = outsider.id;
    noReadActorId = noRead.id;
    for (const actorId of [scoped.id, owner.id, outsider.id, noRead.id]) {
      await grantCapability(ops, {
        workspaceId: WORKSPACE_ID,
        actorId,
        capability: 'finding.read',
        managedSystemId: msId,
        grantedByActorId: adminId,
      });
    }
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: scoped.id,
      capability: 'voc.read',
      managedSystemId: msId,
      grantedByActorId: adminId,
    });

    clusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        createdBy: adminId,
        title: 'Candidate paging cluster',
      })
    ).id;

    // Newest first. Two rows share one timestamp (UUID tie-break) and two differ only by
    // microseconds inside one millisecond (cursor must not round-trip through a JS Date).
    const tie = '2026-03-01T00:00:00.000000Z';
    const a = await newVoc('Paging alpha 100% sure', adminId, '2026-03-05T00:00:00.000000Z');
    const b = await newVoc('Paging beta_one', adminId, '2026-03-04T00:00:00.000200Z');
    const c = await newVoc('Paging gamma', adminId, '2026-03-04T00:00:00.000100Z');
    ownerVocId = await newVoc('Paging owner-held', owner.id, '2026-03-03T00:00:00.000000Z');
    const d = await newVoc('Paging delta', adminId, tie);
    const e = await newVoc('Paging epsilon', adminId, tie);
    memberVocId = await newVoc('Paging already member', adminId, '2026-03-06T00:00:00.000000Z');
    archivedVocId = await newVoc('Paging archived', adminId, '2026-03-07T00:00:00.000000Z');
    await ops.pool.query('update voc.vocs set archived_at=now() where id=$1', [archivedVocId]);
    await insertVocClusterMemberRow(ops, { clusterId, vocId: memberVocId, addedBy: adminId });
    const [first, second] = [d, e].sort().reverse() as [string, string];
    expectedOrder = [a, b, c, ownerVocId, first, second];

    scopedCookie = await loginAs(app, scoped.externalId);
    ownerCookie = await loginAs(app, owner.externalId);
    outsiderCookie = await loginAs(app, outsider.externalId);
    noReadCookie = await loginAs(app, noRead.externalId);
  });

  afterAll(async () => {
    if (ops) {
      const actorIds = [
        scopedActorId,
        ownerActorId,
        outsiderActorId,
        noReadActorId,
        ...denyActorIds,
      ];
      await ops.pool.query('delete from voc_cluster.voc_cluster_members where cluster_id=$1', [
        clusterId,
      ]);
      await ops.pool.query('delete from voc_cluster.voc_clusters where id=$1', [clusterId]);
      await ops.pool.query('delete from voc.vocs where id=any($1::uuid[])', [vocIds]);
      await ops.pool.query(
        'delete from permission.permission_denies where actor_id=any($1::uuid[])',
        [actorIds],
      );
      await ops.pool.query(
        'delete from permission.permission_grants where actor_id=any($1::uuid[])',
        [actorIds],
      );
      await deleteRecoveryFixtureParents(
        ops,
        'delete from core.managed_systems where id=any($1::uuid[])',
        [[msId]],
      );
      await ops.pool.query('delete from core.audit_log where actor_id=any($1::uuid[])', [actorIds]);
      await ops.pool.query('delete from core.sessions where actor_id=any($1::uuid[])', [actorIds]);
      await ops.pool.query('delete from core.actors where id=any($1::uuid[])', [actorIds]);
    }
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  it('returns every readable candidate exactly once across limit=2 cursors in created_at desc, id desc order', async () => {
    const pages = await walk(adminCookie, 2);
    expect(pages.map((page) => page.candidates.length)).toEqual([2, 2, 2]);
    expect(pages.map((page) => page.page.has_more)).toEqual([true, true, false]);
    expect(pages.at(-1)?.page.cursor).toBeUndefined();
    const ids = pages.flatMap((page) => page.candidates.map((candidate) => candidate.voc_id));
    expect(ids).toEqual(expectedOrder);
    expect(ids).not.toContain(memberVocId);
    expect(ids).not.toContain(archivedVocId);
  });

  it('defaults to 20 rows and omits the cursor on a single page', async () => {
    const response = await get(adminCookie);
    expect(response.statusCode).toBe(200);
    const body = response.json() as Body;
    expect(body.candidates.map((candidate) => candidate.voc_id)).toEqual(expectedOrder);
    expect(body.page).toEqual({ has_more: false });
  });

  it('includes a reporter-owned VOC for its reporter only and never shortens a page', async () => {
    const ownerPages = await walk(ownerCookie, 1);
    expect(ownerPages.map((page) => page.candidates.map((c) => c.voc_id))).toEqual([[ownerVocId]]);
    const outsider = await get(outsiderCookie, '?limit=1');
    expect(outsider.json()).toMatchObject({ candidates: [], page: { has_more: false } });
    const scoped = await walk(scopedCookie, 1);
    expect(scoped).toHaveLength(expectedOrder.length);
    expect(scoped.every((page) => page.candidates.length === 1)).toBe(true);
    expect(scoped.map((page) => page.candidates[0]?.voc_id)).toEqual(expectedOrder);
    expect((await get(noReadCookie)).json()).toMatchObject({ candidates: [] });
  });

  it.each([
    ['workspace', null],
    ['MS', 'ms'],
  ] as const)(
    'drops non-own rows for an Admin with a %s voc.read deny, uncounted, keeping reporter-own',
    async (_label, scope) => {
      const admin = await newActor('admin', `deny-${_label}`);
      denyActorIds.push(admin.id);
      await appDb.pool.query(
        `insert into permission.permission_denies
         (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
         values ($1,$2,'voc.read',$3,'1176 candidate regression',$2)`,
        [WORKSPACE_ID, admin.id, scope === 'ms' ? msId : null],
      );
      const own = await newVoc(
        `Paging admin-own ${_label}`,
        admin.id,
        '2026-03-02T00:00:00.000000Z',
      );
      const cookie = await loginAs(app, admin.externalId);
      const pages = await walk(cookie, 1);
      expect(pages.map((page) => page.candidates.map((c) => c.voc_id))).toEqual([[own]]);
      expect(pages).toHaveLength(1);
    },
  );

  it('filters by display-id prefix and title-contains, treating % and _ literally', async () => {
    const all = (await get(adminCookie)).json() as Body;
    const byTitle = (title: string) => all.candidates.find((c) => c.title === title) as Candidate;
    const alpha = byTitle('Paging alpha 100% sure');
    const ids = (body: Body) => body.candidates.map((candidate) => candidate.voc_id);

    const prefix = (await get(adminCookie, `?q=${encodeURIComponent(alpha.display_id)}`)).json();
    expect(ids(prefix)).toEqual([alpha.voc_id]);
    const contains = (await get(adminCookie, `?q=${encodeURIComponent('GAMMA')}`)).json();
    expect(ids(contains)).toEqual([byTitle('Paging gamma').voc_id]);
    const percent = (await get(adminCookie, `?q=${encodeURIComponent('100%')}`)).json();
    expect(ids(percent)).toEqual([alpha.voc_id]);
    const wildPercent = (await get(adminCookie, `?q=${encodeURIComponent('%')}`)).json();
    expect(ids(wildPercent)).toEqual([alpha.voc_id]);
    const underscore = (await get(adminCookie, `?q=${encodeURIComponent('beta_one')}`)).json();
    expect(ids(underscore)).toEqual([byTitle('Paging beta_one').voc_id]);
    const wildUnderscore = (await get(adminCookie, `?q=${encodeURIComponent('beta_')}`)).json();
    expect(ids(wildUnderscore)).toEqual([byTitle('Paging beta_one').voc_id]);
    const noWildcardMatch = (
      await get(adminCookie, `?q=${encodeURIComponent('Paging _eta')}`)
    ).json();
    expect(ids(noWildcardMatch)).toEqual([]);
    const blank = (await get(adminCookie, `?q=${encodeURIComponent('   ')}`)).json();
    expect(ids(blank)).toEqual(ids(all));
  });

  it.each([
    ['q too long', `?q=${'x'.repeat(101)}`, 'q'],
    ['q over 100 after trimming', `?q=${'x'.repeat(101)}%20`, 'q'],
    ['limit 0', '?limit=0', 'limit'],
    ['limit 51', '?limit=51', 'limit'],
    ['limit not a number', '?limit=abc', 'limit'],
    ['cursor not base64', '?cursor=!!!', 'cursor'],
    [
      'cursor bad timestamp',
      `?cursor=${Buffer.from(JSON.stringify({ timestamp: 'nope', id: randomUUID() })).toString('base64')}`,
      'cursor',
    ],
    [
      'cursor bad uuid',
      `?cursor=${Buffer.from(JSON.stringify({ timestamp: '2026-03-01T00:00:00Z', id: 'nope' })).toString('base64')}`,
      'cursor',
    ],
  ] as const)('rejects %s with 422 at the field', async (_label, query, path) => {
    const response = await get(adminCookie, query);
    expect(response.statusCode).toBe(422);
    expect(response.json().detail.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: [path] })]),
    );
  });

  it('accepts limit boundaries 1 and 50', async () => {
    for (const limit of [1, 50]) {
      expect((await get(adminCookie, `?limit=${limit}`)).statusCode).toBe(200);
    }
  });

  it('returns 404 for an unreadable or unknown cluster', async () => {
    const response = await get(adminCookie, '', randomUUID());
    expect(response.statusCode).toBe(404);
    const userExternal = await newActor('developer', 'no-finding-read');
    denyActorIds.push(userExternal.id);
    const cookie = await loginAs(app, userExternal.externalId);
    expect((await get(cookie)).statusCode).toBe(404);
  });
});
