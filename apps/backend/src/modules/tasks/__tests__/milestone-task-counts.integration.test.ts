// #514 B1c — one grouped child-count query for a list of Milestone ids.
//
// Buckets (design slice B1 formula + §7 item 4 proposal, stated next to the
// formula in milestones/service.ts): released_done = done + released;
// in_flight = doing + review + reopened (reopened-as-in_flight is the §7
// item 4 proposal); queued = backlog + todo; total = child count;
// percent = total === 0 ? 0 : round(100 * released_done / total).
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
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';
import { countTasksByMilestone } from '../index.js';
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-milestone-counts';

describe.skipIf(!runIntegration)('grouped milestone task counts (#514 B1c)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let managedSystemId: string;
  let fullMilestoneId: string;
  let secondMilestoneId: string;
  let emptyMilestoneId: string;

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
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function insertMilestone(title: string): Promise<string> {
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

  async function seedFixtures(): Promise<void> {
    managedSystemId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Counts MS');
    fullMilestoneId = await insertMilestone('Full milestone');
    secondMilestoneId = await insertMilestone('Second populated milestone');
    emptyMilestoneId = await insertMilestone('Empty milestone');

    const statuses = ['done', 'released', 'reopened', 'doing', 'backlog', 'todo'] as const;
    for (const status of statuses) {
      await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: managedSystemId,
        title: `Task ${status}`,
        status,
        milestoneId: fullMilestoneId,
        createdBy: adminActorId,
      });
    }

    await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: managedSystemId,
      title: 'Second milestone todo task',
      status: 'todo',
      milestoneId: secondMilestoneId,
      createdBy: adminActorId,
    });
  }

  it('one call over two populated ids returns both independent groups', async () => {
    const counts = await countTasksByMilestone(dbHandle.db, {
      workspaceId: WORKSPACE_ID,
      milestoneIds: [fullMilestoneId, secondMilestoneId],
    });

    expect(counts.get(fullMilestoneId)).toEqual({
      released_done: 2, // done + released
      in_flight: 2, // doing + reopened (reopened is §7 item 4's proposal)
      queued: 2, // backlog + todo
      total: 6,
    });
    expect(counts.get(secondMilestoneId)).toEqual({
      released_done: 0,
      in_flight: 0,
      queued: 1,
      total: 1,
    });
  });

  it('detail route fills zeros for a Milestone the GROUP BY omitted', async () => {
    const counts = await countTasksByMilestone(dbHandle.db, {
      workspaceId: WORKSPACE_ID,
      milestoneIds: [emptyMilestoneId],
    });
    expect(counts.has(emptyMilestoneId)).toBe(false);

    const res = await app.inject({
      method: 'GET',
      url: `/milestones/${emptyMilestoneId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ progress: unknown }>().progress).toEqual({
      released_done: 0,
      in_flight: 0,
      queued: 0,
      total: 0,
      percent: 0,
    });
  });

  it('detail route computes percent from done+released over total', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/milestones/${fullMilestoneId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ progress: unknown }>().progress).toEqual({
      released_done: 2,
      in_flight: 2,
      queued: 2,
      total: 6,
      percent: 33,
    });
  });
});
