// Task list managed_system_id filter (#395).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';
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
    const omittedIds = omitted.json<{ items: Array<{ id: string }> }>().items.map((i) => i.id);
    expect(omittedIds).toContain(taskAId);
    expect(omittedIds).toContain(taskBId);
  });

  it('AC-395-3: managed_system_id=not-a-uuid fails validation with 422', async () => {
    const res = await listTasks('not-a-uuid');
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });
});
