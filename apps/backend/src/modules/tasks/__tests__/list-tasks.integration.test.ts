// Task list managed_system_id filter (#395).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox.

import { randomUUID } from 'node:crypto';
import type { TaskStatus } from '@fops/shared';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { createAa } from '../../../test-support/core-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';

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
  revokeDeny,
} from '../../../test-support/permissions-fixtures.js';
import {
  cleanupReadTestTables,
  insertPublicUpdate,
  insertVocDirectly,
} from '../../../test-support/voc-fixtures.js';
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-list';

describe.skipIf(!runIntegration)('task list managed_system_id filter (#395)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let msAId: string;
  let msBId: string;
  let taskAId: string;
  let taskBId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    if (!adminActorId) throw new Error('seed actors not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await seedFixtures();
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
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedFixtures(): Promise<void> {
    msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'MS A');
    msBId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'MS B');
    const taskA = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msAId,
      title: 'Task on MS A',
      createdBy: adminActorId,
    });
    const taskB = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msBId,
      title: 'Task on MS B',
      createdBy: adminActorId,
    });
    taskAId = taskA.id;
    taskBId = taskB.id;
  }

  function listTasks(managedSystemId?: string) {
    const query = managedSystemId === undefined ? '' : `?managed_system_id=${managedSystemId}`;
    return app.inject({
      method: 'GET',
      url: `/tasks${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
  }

  it('AC-981: walks opt-in pages in full-list order with exact first-page total', async () => {
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` };
    const full = await app.inject({
      method: 'GET',
      url: `/tasks?managed_system_id=${msAId}`,
      headers,
    });
    expect(Object.keys(full.json())).toEqual(['items']);
    const expected = full.json<{ items: Array<{ id: string }> }>().items.map((row) => row.id);
    const walked: string[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ managed_system_id: msAId, limit: '2' });
      if (cursor !== undefined) params.set('cursor', cursor);
      const response = await app.inject({ method: 'GET', url: `/tasks?${params}`, headers });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        items: Array<{ id: string }>;
        page: { total?: number; has_more: boolean; cursor?: string };
      }>();
      expect(body.page.total).toBe(cursor === undefined ? expected.length : undefined);
      walked.push(...body.items.map((row) => row.id));
      expect(body.page.has_more).toBe(walked.length < expected.length);
      expect(body.page.cursor !== undefined).toBe(body.page.has_more);
      cursor = body.page.cursor;
    } while (cursor !== undefined);
    expect(walked).toEqual(expected);
    expect(new Set(walked).size).toBe(walked.length);
  });

  it.each(['limit=101', 'limit=2&cursor=bad'])(
    'AC-981: rejects invalid paging %s',
    async (query) => {
      const response = await app.inject({
        method: 'GET',
        url: `/tasks?${query}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        code: 'validation.failed',
        message: query.includes('cursor') ? 'invalid cursor' : 'invalid query parameters',
        detail: {
          fields: [
            {
              path: [query.includes('cursor') ? 'cursor' : 'limit'],
              code: query.includes('cursor') ? 'invalid_cursor' : 'too_big',
            },
          ],
        },
      });
    },
  );

  it('AC-395-1: managed_system_id=<ms-a> returns only ms-a tasks', async () => {
    const res = await listTasks(msAId);
    expect(res.statusCode).toBe(200);
    const resIds = res.json<{ items: Array<{ id: string }> }>().items.map((i) => i.id);
    expect(resIds).toContain(taskAId);
    expect(resIds).not.toContain(taskBId);
  });

  it('AC-395-2: managed_system_id=all and omitted parameter both return all tasks', async () => {
    const all = await listTasks('all');
    expect(all.statusCode).toBe(200);
    const allIds = all.json<{ items: Array<{ id: string }> }>().items.map((i) => i.id);
    expect(allIds).toContain(taskAId);
    expect(allIds).toContain(taskBId);

    const omitted = await listTasks();
    expect(omitted.statusCode).toBe(200);
    expect(Object.keys(omitted.json())).toEqual(['items']);
    const omittedIds = omitted.json<{ items: Array<{ id: string }> }>().items.map((i) => i.id);
    expect(omittedIds).toContain(taskAId);
    expect(omittedIds).toContain(taskBId);
  });

  it('shows only granted-system Tasks when another system is explicitly denied', async () => {
    const developer = await insertDevActor(dbHandle, WORKSPACE_ID, uid('task-list-scope'));
    for (const managedSystemId of [msAId, msBId]) {
      await grantCapability(
        dbHandle,
        WORKSPACE_ID,
        developer.id,
        'finding.manage',
        managedSystemId,
        adminActorId,
      );
    }
    const denyId = await denyCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msBId,
      adminActorId,
    );
    try {
      const cookie = await loginAs(app, developer.externalId);
      const response = await app.inject({
        method: 'GET',
        url: '/tasks?managed_system_id=all',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      });
      expect(response.statusCode).toBe(200);
      const items = response.json<{
        items: Array<{ id: string; primary_managed_system_id: string }>;
      }>().items;
      expect(items.map((item) => item.id)).toContain(taskAId);
      expect(items.map((item) => item.id)).not.toContain(taskBId);
      expect(items.every((item) => item.primary_managed_system_id === msAId)).toBe(true);
    } finally {
      await revokeDeny(dbHandle, denyId, adminActorId);
    }
  });

  it('AC-395-3: managed_system_id=not-a-uuid fails validation with 422', async () => {
    const res = await listTasks('not-a-uuid');
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('public_update=missing returns the released-task public-update gap and leaves the unfiltered list unchanged', async () => {
    const gap = await insertReleased('Released without public update');
    const updated = await insertReleased('Released with public update');
    const unlinked = await insertReleased('Released without VOC');
    const gapVoc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msAId, adminActorId, 'Gap VOC');
    const updatedVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msAId,
      adminActorId,
      'Updated VOC',
    );
    await linkVocEvidence(gapVoc.id, gap.id);
    await linkVocEvidence(updatedVoc.id, updated.id);
    await insertPublicUpdate(dbHandle, updatedVoc.id, adminActorId);

    const filtered = await app.inject({
      method: 'GET',
      url: `/tasks?public_update=missing&managed_system_id=${msAId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(filtered.statusCode).toBe(200);
    const filteredIds = filtered
      .json<{ items: Array<{ id: string }> }>()
      .items.map((item) => item.id);
    expect(filteredIds).toContain(gap.id);
    expect(filteredIds).not.toContain(updated.id);
    expect(filteredIds).not.toContain(unlinked.id);

    const open = await listTasks(msAId);
    expect(open.statusCode).toBe(200);
    const openIds = open.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id);
    expect(openIds).toEqual(expect.arrayContaining([gap.id, updated.id, unlinked.id]));
  });

  async function insertReleased(title: string): Promise<{ id: string }> {
    return insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msAId,
      title,
      status: 'released',
      createdBy: adminActorId,
    });
  }

  async function linkVocEvidence(vocId: string, taskId: string): Promise<void> {
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, managed_system_id, created_by
        )
       values ($1, 'voc', $2, 'task', $3, 'evidence_of', $4, $5)`,
      [WORKSPACE_ID, vocId, taskId, msAId, adminActorId],
    );
  }
  it('AC-981: visibility precedes limit, cursor walks exact order, and explicit deny applies in both modes', async () => {
    for (let i = 0; i < 4; i += 1) {
      await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msAId,
        title: `Page A ${i}`,
        createdBy: adminActorId,
      });
    }
    await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msBId,
      title: 'Newest B',
      createdBy: adminActorId,
    });
    await migrateHandle.pool.query(
      "update task.tasks set updated_at = '2026-01-01 00:00:00.123456+00' where workspace_id = $1 and primary_managed_system_id = $2",
      [WORKSPACE_ID, msAId],
    );
    const developer = await insertDevActor(dbHandle, WORKSPACE_ID, uid('page-scope'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msAId,
      adminActorId,
    );
    const cookie = await loginAs(app, developer.externalId);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const full = await app.inject({ method: 'GET', url: '/tasks', headers });
    expect(full.statusCode).toBe(200);
    expect(Object.keys(full.json())).toEqual(['items']);
    const expected = full.json<{
      items: Array<{ id: string; primary_managed_system_id: string }>;
    }>().items;
    expect(expected.length).toBeGreaterThan(2);
    expect(expected.map((item) => item.id)).toEqual(
      expected
        .map((item) => item.id)
        .sort()
        .reverse(),
    );
    expect(expected.every((item) => item.primary_managed_system_id === msAId)).toBe(true);
    const walked: string[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ limit: '2' });
      if (cursor !== undefined) params.set('cursor', cursor);
      const response = await app.inject({ method: 'GET', url: `/tasks?${params}`, headers });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        items: Array<{ id: string }>;
        page: { has_more: boolean; cursor?: string; total?: number };
      }>();
      expect(body.items).toHaveLength(Math.min(2, expected.length - walked.length));
      expect(body.page.total).toBe(cursor === undefined ? expected.length : undefined);
      walked.push(...body.items.map((item) => item.id));
      expect(body.page.has_more).toBe(walked.length < expected.length);
      expect(body.page.cursor !== undefined).toBe(body.page.has_more);
      cursor = body.page.cursor;
    } while (cursor !== undefined);
    expect(walked).toEqual(expected.map((item) => item.id));
    expect(new Set(walked).size).toBe(expected.length);
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msBId,
      adminActorId,
    );
    const denyId = await denyCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msBId,
      adminActorId,
    );
    try {
      for (const query of ['', '?limit=2']) {
        const denied = await app.inject({ method: 'GET', url: `/tasks${query}`, headers });
        expect(denied.statusCode).toBe(200);
        expect(
          denied
            .json()
            .items.every(
              (item: { primary_managed_system_id: string }) =>
                item.primary_managed_system_id === msAId,
            ),
        ).toBe(true);
        if (query) expect(denied.json().page.total).toBe(expected.length);
      }
    } finally {
      await revokeDeny(dbHandle, denyId, adminActorId);
    }
  });
});

function fixtureRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('missing #1077 fixture row');
  return row;
}

// Separate owned fixtures preserve every existing #395/#981 setup and assertion.
describe.skipIf(!runIntegration)('Task Analytics Area report destinations (#1077)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: { id: string; cookie: string };
  let devA: { id: string; cookie: string };
  let devB: { id: string; cookie: string };
  let user: { id: string; cookie: string };
  let msA: string;
  let msB: string;
  let areaA: string;
  let areaB: string;
  let archivedArea: string;
  let foreignWorkspace: string;
  let foreignArea: string;
  const systems: string[] = [];
  const actors: string[] = [];
  const tasks: Array<{ id: string; status: TaskStatus; area: string | null; overdue: boolean }> =
    [];
  const reporterNeeded: string[] = [];

  async function actor(roleLevel: 'admin' | 'developer' | 'user') {
    const row = await insertActorRow(migrate, {
      workspaceId: WORKSPACE_ID,
      externalId: uid('task-area-1077'),
      roleLevel,
    });
    actors.push(row.id);
    const cookie = randomUUID();
    await migrate.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [cookie, row.id, WORKSPACE_ID],
    );
    return { id: row.id, cookie };
  }
  const get = (query: Record<string, string>, who = admin) =>
    app.inject({
      method: 'GET',
      url: `/tasks?${new URLSearchParams(query)}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${who.cookie}` },
    });
  async function membership(query: Record<string, string>, expected: string[], who = admin) {
    const full = await get(query, who);
    expect(full.statusCode).toBe(200);
    const ids = full.json<{ items: Array<{ id: string }> }>().items.map((row) => row.id);
    expect([...ids].sort()).toEqual([...expected].sort());
    const walked: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await get({ ...query, limit: '2', ...(cursor ? { cursor } : {}) }, who);
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        items: Array<{ id: string }>;
        page: { total?: number; cursor?: string; has_more: boolean };
      }>();
      expect(body.page.total).toBe(cursor === undefined ? expected.length : undefined);
      walked.push(...body.items.map((row) => row.id));
      expect(body.page.has_more).toBe(walked.length < expected.length);
      cursor = body.page.cursor;
    } while (cursor !== undefined);
    expect(walked).toEqual(ids);
    expect(new Set(walked).size).toBe(expected.length);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    admin = await actor('admin');
    devA = await actor('developer');
    devB = await actor('developer');
    user = await actor('user');
    msA = await insertMsDirectly(migrate, WORKSPACE_ID, uid('task-area-1077'), 'A');
    msB = await insertMsDirectly(migrate, WORKSPACE_ID, uid('task-area-1077'), 'B');
    systems.push(msA, msB);
    for (const [who, system] of [
      [devA, msA],
      [devB, msB],
      [user, msA],
    ] as const)
      await grantCapability(migrate, WORKSPACE_ID, who.id, 'finding.manage', system, admin.id);
    areaA = await createAa(app, admin.cookie, {
      managed_system_id: msA,
      slug: 'same',
      name: 'Same',
    });
    areaB = await createAa(app, admin.cookie, {
      managed_system_id: msB,
      slug: 'same',
      name: 'Same',
    });
    archivedArea = await createAa(app, admin.cookie, {
      managed_system_id: msA,
      slug: 'archived',
      name: 'Archived',
    });
    const dates = fixtureRow(
      (
        await migrate.pool.query<{ yesterday: string; today: string }>(
          `select ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 1)::text as yesterday,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text as today`,
        )
      ).rows,
    );
    for (const status of [
      'backlog',
      'todo',
      'doing',
      'review',
      'done',
      'released',
      'reopened',
    ] as const) {
      for (const due of [dates.yesterday, dates.today, null]) {
        const task = await insertTaskRow(migrate, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: msA,
          status,
          analyticsAreaId: areaA,
          dueDate: due,
          createdBy: admin.id,
        });
        tasks.push({
          id: task.id,
          status,
          area: areaA,
          overdue: due === dates.yesterday && status !== 'done' && status !== 'released',
        });
      }
    }
    for (const [system, area] of [
      [msA, null],
      [msA, archivedArea],
      [msB, areaB],
    ] as const) {
      const task = await insertTaskRow(migrate, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: system,
        analyticsAreaId: area,
        createdBy: admin.id,
      });
      tasks.push({ id: task.id, status: 'backlog', area, overdue: false });
    }
    await migrate.pool.query('update core.analytics_areas set archived_at = now() where id = $1', [
      archivedArea,
    ]);
    // Two hidden unresolved VOCs still produce one Task-grain row without a voc.read grant.
    const gap = fixtureRow(tasks.filter((row) => row.status === 'released'));
    reporterNeeded.push(gap.id);
    for (const [taskId, statuses] of [
      [gap.id, ['received', 'received']],
      [
        fixtureRow(tasks.filter((row) => row.status === 'released').slice(1)).id,
        ['resolved', 'closed'],
      ],
      [fixtureRow(tasks.filter((row) => row.status === 'todo')).id, ['received']],
    ] as const) {
      for (const status of statuses) {
        const voc = await insertVocDirectly(db, WORKSPACE_ID, msA, admin.id, 'Reporter gap');
        if (status !== 'received')
          await migrate.pool.query(
            'update voc.vocs set reporter_facing_status = $2 where id = $1',
            [voc.id, status],
          );
        await migrate.pool.query(
          `insert into core.entity_links (workspace_id, source_type, source_id, target_type,
            target_id, relation_type, managed_system_id, created_by)
           values ($1, 'voc', $2, 'task', $3, 'evidence_of', $4, $5)`,
          [WORKSPACE_ID, voc.id, taskId, msA, admin.id],
        );
      }
    }
    foreignWorkspace = fixtureRow(
      (
        await migrate.pool.query<{ id: string }>(
          'insert into core.workspaces (name) values ($1) returning id',
          [uid('task-area-foreign')],
        )
      ).rows,
    ).id;
    const foreignMs = await insertMsDirectly(migrate, foreignWorkspace, 'foreign', 'Foreign');
    systems.push(foreignMs);
    foreignArea = fixtureRow(
      (
        await migrate.pool.query<{ id: string }>(
          'insert into core.analytics_areas (workspace_id, managed_system_id, slug, name) values ($1, $2, $3, $4) returning id',
          [foreignWorkspace, foreignMs, 'same', 'Same'],
        )
      ).rows,
    ).id;
    const foreignCreator = await insertActorRow(migrate, {
      workspaceId: foreignWorkspace,
      externalId: uid('task-area-foreign'),
      roleLevel: 'admin',
    });
    actors.push(foreignCreator.id);
    await insertTaskRow(migrate, {
      workspaceId: foreignWorkspace,
      primaryManagedSystemId: foreignMs,
      analyticsAreaId: foreignArea,
      createdBy: foreignCreator.id,
    });
  });

  afterAll(async () => {
    if (migrate) {
      await migrate.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [
        actors,
      ]);
      await migrate.pool.query(
        'delete from core.entity_links where managed_system_id = any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query(
        'delete from task.tasks where primary_managed_system_id = any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query(
        'delete from voc.vocs where primary_managed_system_id = any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query(
        'delete from permission.permission_grants where actor_id = any($1::uuid[])',
        [actors],
      );
      await migrate.pool.query(
        'delete from core.analytics_areas where managed_system_id = any($1::uuid[])',
        [systems],
      );
      await deleteRecoveryFixtureParents(
        migrate,
        'delete from core.managed_systems where id = any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
        actors,
      ]);
      await migrate.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        actors.map((id) => `${WORKSPACE_ID}:${id}`),
      ]);
      await migrate.pool.query('delete from core.actors where id = any($1::uuid[])', [actors]);
      if (foreignWorkspace) {
        await migrate.pool.query('delete from core.display_counters where workspace_id = $1', [
          foreignWorkspace,
        ]);
        await deleteRecoveryFixtureParents(migrate, 'delete from core.workspaces where id = $1', [
          foreignWorkspace,
        ]);
      }
    }
    await app?.close();
    await db?.close();
    await migrate?.close();
  });

  it.each(['uuid', 'unset', 'archived', 'same-name-other-system'] as const)(
    'filters Area %s with exact total',
    async (kind) => {
      const area =
        kind === 'unset'
          ? 'unset'
          : kind === 'archived'
            ? archivedArea
            : kind === 'uuid'
              ? areaA
              : areaB;
      await membership(
        { analytics_area_id: area, ...(kind === 'unset' ? { managed_system_id: msA } : {}) },
        tasks.filter((row) => row.area === (area === 'unset' ? null : area)).map((row) => row.id),
      );
    },
  );
  it.each(['unknown', 'foreign', 'incompatible', 'developer-b'] as const)(
    'Area %s fails closed without existence errors',
    async (kind) => {
      await membership(
        {
          analytics_area_id:
            kind === 'unknown' ? randomUUID() : kind === 'foreign' ? foreignArea : areaA,
          ...(kind === 'incompatible' ? { managed_system_id: msB } : {}),
        },
        [],
        kind === 'developer-b' ? devB : admin,
      );
    },
  );
  it.each(['in-flight', 'overdue', 'reporter'] as const)(
    'filters %s and reconciles walked total',
    async (kind) => {
      const query =
        kind === 'in-flight'
          ? { status_group: 'in-flight' }
          : kind === 'overdue'
            ? { overdue: 'true' }
            : { reporter_update: 'needed' };
      const expected =
        kind === 'reporter'
          ? reporterNeeded
          : tasks
              .filter((row) =>
                kind === 'overdue' ? row.overdue : ['todo', 'doing', 'review'].includes(row.status),
              )
              .map((row) => row.id);
      await membership({ ...query, managed_system_id: msA }, expected, devA);
    },
  );
  it('intersects Area, status group, overdue, status, and the legacy public-update gap', async () => {
    await membership(
      {
        analytics_area_id: areaA,
        status_group: 'in-flight',
        overdue: 'true',
        status: 'todo',
        managed_system_id: msA,
      },
      tasks.filter((row) => row.status === 'todo' && row.overdue).map((row) => row.id),
    );
    await membership({ status: 'backlog', status_group: 'in-flight', managed_system_id: msA }, []);
    await membership(
      {
        analytics_area_id: areaA,
        reporter_update: 'needed',
        public_update: 'missing',
        managed_system_id: msA,
      },
      reporterNeeded,
    );
    await membership({ reporter_update: 'needed', overdue: 'true', managed_system_id: msA }, []);
  });
  it('keeps User forbidden even with finding.manage and an Area filter', async () => {
    const response = await get({ analytics_area_id: areaA }, user);
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('permission.denied');
  });
  it.each([
    'analytics_area_id=bad',
    'status_group=backlog',
    'overdue=false',
    'reporter_update=missing',
    'unknown=true',
  ])('rejects invalid query %s', async (query) => {
    const response = await app.inject({
      method: 'GET',
      url: `/tasks?${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}` },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation.failed');
  });
  it('ordinary filtered read writes no Task, link, VOC, or audit rows', async () => {
    const snapshot = async () =>
      (
        await migrate.pool.query(
          `select (select count(*) from task.tasks where primary_managed_system_id = $1) tasks,
        (select count(*) from voc.vocs where primary_managed_system_id = $1) vocs,
        (select count(*) from core.entity_links where managed_system_id = $1) links,
        (select count(*) from core.audit_log where actor_id = $2) audits`,
          [msA, devA.id],
        )
      ).rows;
    const before = await snapshot();
    await membership({ analytics_area_id: areaA, reporter_update: 'needed' }, reporterNeeded, devA);
    expect(await snapshot()).toEqual(before);
  });
});
