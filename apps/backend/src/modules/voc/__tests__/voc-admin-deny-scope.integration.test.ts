import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import {
  cleanupTestActorsByExternalIdPrefix,
  insertPublicUpdate,
  insertVocDirectly,
} from '../../../test-support/voc-fixtures.js';
import { insertInternalComment } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-1170-deny';

describe.skipIf(!runIntegration)('VOC Admin deny scopes and default Triage (#1170a)', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: string;
  let developer: string;
  let reporter: string;
  let a: string;
  let b: string;
  let vocA: string;
  let vocB: string;
  let findingA: string;
  let findingB: string;
  let internalA: string;
  let internalB: string;
  let publicA: string;
  let publicB: string;
  const cookies: Record<string, string> = {};

  const get = (url: string, actor = 'admin') =>
    app.inject({
      method: 'GET',
      url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookies[actor]}` },
    });
  const deny = (capability: string, managedSystemId: string | null) =>
    handle.pool.query(
      `insert into permission.permission_denies
       (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
       values ($1,$2,$3,$4,'1170 regression',$2)`,
      [WORKSPACE_ID, admin, capability, managedSystemId],
    );
  async function list(view: 'inbox' | 'triage', actor = 'admin') {
    const response = await get(`/vocs?view=${view}&limit=100`, actor);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: { id: string }[]; page: { has_more: boolean } }>();
    expect(body.page.has_more).toBe(false);
    return body.items.map((item) => item.id);
  }
  async function counts() {
    const response = await get('/nav/counts');
    expect(response.statusCode).toBe(200);
    return response.json<{ counts: Record<string, number> }>().counts;
  }
  async function conversation(
    vocId: string,
    internalId: string,
    publicId: string,
    visible: boolean,
  ) {
    for (const path of [`/vocs/${vocId}`, `/vocs/${vocId}/conversation`]) {
      const response = await get(path);
      expect(response.statusCode).toBe(200);
      if (path === `/vocs/${vocId}`) expect(response.json().title).toBeDefined();
      const entries = path.endsWith('/conversation')
        ? response.json().items
        : response.json().conversation_timeline;
      const serialized = JSON.stringify(entries);
      expect(serialized).toContain(publicId);
      expect(serialized).toContain('public update');
      if (visible) {
        expect(serialized).toContain(internalId);
        expect(serialized).toContain('internal comment');
      } else {
        expect(serialized).not.toContain(internalId);
        expect(serialized).not.toContain('internal comment');
      }
    }
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    for (const [name, roleLevel] of [
      ['admin', 'admin'],
      ['developer', 'developer'],
      ['reporter', 'user'],
    ] as const) {
      const actor = await insertActorRow(handle, {
        workspaceId: WORKSPACE_ID,
        externalId: `${PREFIX}-${name}`,
        roleLevel,
      });
      if (name === 'admin') admin = actor.id;
      if (name === 'developer') developer = actor.id;
      if (name === 'reporter') reporter = actor.id;
      cookies[name] = await loginAs(app, `${PREFIX}-${name}`);
    }
    a = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-a`, '1170 A');
    b = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-b`, '1170 B');
    vocA = (await insertVocDirectly(handle, WORKSPACE_ID, a, reporter, '1170 non-own A')).id;
    vocB = (await insertVocDirectly(handle, WORKSPACE_ID, b, reporter, '1170 non-own B')).id;
    internalA = await insertInternalComment(handle, vocA, admin);
    internalB = await insertInternalComment(handle, vocB, admin);
    publicA = await insertPublicUpdate(handle, vocA, admin);
    publicB = await insertPublicUpdate(handle, vocB, admin);
    findingA = (
      await insertFindingRow(handle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: a,
        sourceId: vocA,
        createdBy: admin,
      })
    ).id;
    findingB = (
      await insertFindingRow(handle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: b,
        sourceId: vocB,
        createdBy: admin,
      })
    ).id;
  });
  beforeEach(async () => {
    await handle.pool.query('delete from permission.permission_denies where actor_id = $1', [
      admin,
    ]);
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [
      developer,
    ]);
  });
  afterAll(async () => {
    await migrate.pool.query('delete from finding.findings where id = any($1::uuid[])', [
      [findingA, findingB],
    ]);
    await handle.pool.query('delete from voc.vocs where id = any($1::uuid[])', [[vocA, vocB]]);
    await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, PREFIX);
    await deleteRecoveryFixtureParents(
      handle,
      'delete from core.managed_systems where id = any($1::uuid[])',
      [[a, b]],
    );
    await app.close();
    await handle.close();
    await migrate.close();
  });

  it('AC1: workspace read deny blocks Inbox and omits its count and scope', async () => {
    await deny('voc.read', null);
    const inbox = await get('/vocs?view=inbox');
    expect(inbox.statusCode).toBe(403);
    expect(inbox.json().code).toBe('permission.denied');
    expect(await counts()).not.toHaveProperty(['voc.inbox']);
    const scope = await get('/me/permissions/scope?capability=voc.read');
    expect(scope.statusCode).toBe(200);
    expect(scope.json()).toEqual({ scope: { kind: 'scoped', managed_system_ids: [] } });
  });

  it('AC2: MS read deny filters Inbox and counts; triage-only detail is summary', async () => {
    await deny('voc.read', a);
    const ids = await list('inbox');
    expect(ids).not.toContain(vocA);
    expect(ids).toContain(vocB);
    expect((await counts())['voc.inbox']).toBe(ids.length);
    const detail = await get(`/vocs/${vocA}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: vocA,
      permission_decisions: { _self: { state: 'blocked_not_requestable' } },
    });
    expect(detail.json()).not.toHaveProperty('title');
    expect(detail.json()).not.toHaveProperty('conversation_timeline');
    const response = await get(`/vocs/${vocA}/conversation`);
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('permission.denied');
  });

  it.each(['workspace', 'MS-A'] as const)(
    'AC3: %s triage deny hides internal entries on both conversation surfaces',
    async (scope) => {
      await conversation(vocA, internalA, publicA, true);
      await conversation(vocB, internalB, publicB, true);
      await deny('voc.triage', scope === 'workspace' ? null : a);
      await conversation(vocA, internalA, publicA, false);
      await conversation(vocB, internalB, publicB, scope !== 'workspace');
      const badge = await counts();
      if (scope === 'workspace') {
        const triage = await get('/vocs?view=triage');
        expect(triage.statusCode).toBe(403);
        expect(triage.json().code).toBe('permission.denied');
        for (const key of [
          'voc.triage',
          'voc.tab.high',
          'voc.tab.unassigned',
          'voc.tab.untriaged',
          'voc.tab.waiting',
        ]) {
          expect(badge).not.toHaveProperty([key]);
        }
      } else {
        const ids = await list('triage');
        expect(ids).not.toContain(vocA);
        expect(ids).toContain(vocB);
        expect(badge['voc.triage']).toBe(ids.length);
        const scopedBadge = await get(`/nav/counts?managed_system_id=${a}`);
        expect(scopedBadge.statusCode).toBe(200);
        expect(scopedBadge.json().counts).not.toHaveProperty(['voc.triage']);
      }
    },
  );

  it('AC4: read and triage denies hide non-own detail and conversation with exact 404', async () => {
    await deny('voc.read', a);
    await deny('voc.triage', a);
    for (const path of [`/vocs/${vocA}`, `/vocs/${vocA}/conversation`]) {
      const response = await get(path);
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('not_found.record');
    }
  });

  it('AC5: no-deny Admin reads both systems and Finding always bypass survives deny', async () => {
    for (const view of ['inbox', 'triage'] as const) {
      expect(await list(view)).toEqual(expect.arrayContaining([vocA, vocB]));
    }
    await conversation(vocA, internalA, publicA, true);
    await deny('finding.read', null);
    const findings = await get('/findings');
    expect(findings.statusCode).toBe(200);
    expect(findings.json().items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([findingA, findingB]),
    );
  });

  it('AC5: reporter without grants still reads their own MS-A detail', async () => {
    const response = await get(`/vocs/${vocA}`, 'reporter');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: vocA, title: '1170 non-own A' });
  });

  it('AC6: default-scope Developer Triage returns only its read and triage grant system', async () => {
    for (const capability of ['voc.read', 'voc.triage']) {
      await grantCapability(handle, WORKSPACE_ID, developer, capability, a, admin);
    }
    expect(await list('triage', 'developer')).toEqual([vocA]);
  });
});
