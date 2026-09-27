// #514 B1a — GET /tasks milestone_id filter through the real route.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-milestone-list';

describe.skipIf(!runIntegration)('task list milestone_id filter (#514 B1a)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let milestoneId: string;
  let taskOnMilestoneIds: string[];
  let taskOnOtherMilestoneId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');

    const actors = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors
        where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor not found');
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
      `delete from task.milestones
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
    const managedSystemId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Milestone filter MS',
    );
    milestoneId = await insertMilestone(managedSystemId, 'Requested milestone');
    const otherMilestoneId = await insertMilestone(managedSystemId, 'Other milestone');

    const targetTasks = await Promise.all(
      ['Task on requested milestone A', 'Task on requested milestone B'].map((title) =>
        insertTaskRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: managedSystemId,
          title,
          milestoneId,
          createdBy: adminActorId,
        }),
      ),
    );
    taskOnMilestoneIds = targetTasks.map((task) => task.id);

    const otherTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: managedSystemId,
      title: 'Task on another milestone',
      milestoneId: otherMilestoneId,
      createdBy: adminActorId,
    });
    taskOnOtherMilestoneId = otherTask.id;
  }

  async function insertMilestone(managedSystemId: string, title: string): Promise<string> {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into task.milestones (
          workspace_id, display_id, primary_managed_system_id, title, why,
          owner_actor_id, start_date, target_date, created_by
        )
       values ($1, $2, $3, $4, 'why', $5, '2026-10-01', '2026-12-31', $5)
       returning id`,
      [WORKSPACE_ID, `MLS-${randomUUID().slice(0, 8)}`, managedSystemId, title, adminActorId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`insert milestone failed for title=${title}`);
    return id;
  }

  function listTasks(cookie: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/tasks${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('returns exactly the Tasks assigned to the requested Milestone', async () => {
    const res = await listTasks(adminCookie, `?milestone_id=${milestoneId}`);

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ id: string }> }>();
    expect(body.items.map((item) => item.id).sort()).toEqual([...taskOnMilestoneIds].sort());
  });

  it('returns 200 and omits rows whose Managed System the Developer cannot manage', async () => {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    const devCookie = await loginAs(app, actor.externalId);
    const res = await listTasks(devCookie, `?milestone_id=${milestoneId}`);

    expect(res.statusCode).toBe(200);
    expect(res.json<{ items: Array<{ id: string }> }>()).toEqual({ items: [] });
  });

  it('keeps the current unfiltered list when milestone_id is omitted', async () => {
    const res = await listTasks(adminCookie);

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ id: string }> }>();
    expect(body.items.map((item) => item.id).sort()).toEqual(
      [...taskOnMilestoneIds, taskOnOtherMilestoneId].sort(),
    );
  });

  it('returns an empty list for an unknown valid Milestone UUID', async () => {
    const res = await listTasks(adminCookie, `?milestone_id=${randomUUID()}`);

    expect(res.statusCode).toBe(200);
    expect(res.json<{ items: Array<{ id: string }> }>()).toEqual({ items: [] });
  });
});
