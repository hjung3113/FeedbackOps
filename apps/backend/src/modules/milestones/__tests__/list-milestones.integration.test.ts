// #514 A5 — Milestone list authorization: per-row finding.manage filter,
// managed_system_id=all means caller scope, status tab filters.
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
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-milestone-list';

describe.skipIf(!runIntegration)('milestone list (#514 A5)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let userCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id from core.actors
        where workspace_id = $1 and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor not found');
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
      `delete from core.audit_log
        where workspace_id = $1 and event_type in ('milestone_created', 'milestone_updated')`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from task.milestones
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  /** Admin-created milestone via the API on the given Managed System. */
  async function seedMilestone(msId: string, title: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/milestones',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        title,
        why: `${title} why`,
        primary_managed_system_id: msId,
        start_date: '2026-10-01',
        target_date: '2026-12-31',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  /** Developer whose finding.manage covers only managedSystemIds. */
  async function seedScopedDeveloper(managedSystemIds: string[]): Promise<string> {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    for (const msId of managedSystemIds) {
      await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'finding.manage', msId, adminActorId);
    }
    return loginAs(app, actor.externalId);
  }

  function listMilestones(cookie: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/milestones${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('list: omits Milestones whose Managed System the caller cannot manage; no list-wide 403', async () => {
    const msInScope = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'In scope');
    const msOutOfScope = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Out of scope',
    );
    await seedMilestone(msInScope, 'In-scope milestone');
    await seedMilestone(msOutOfScope, 'Out-of-scope milestone');
    const devCookie = await seedScopedDeveloper([msInScope]);

    const res = await listMilestones(devCookie);
    expect(res.statusCode).toBe(200);
    const titles = res
      .json<{ items: Array<{ title: string; primary_managed_system_id: string }> }>()
      .items.map((item) => item.title);
    expect(titles).toContain('In-scope milestone');
    expect(titles).not.toContain('Out-of-scope milestone');
  });

  it('list: managed_system_id=all is the caller scope, not the whole workspace', async () => {
    const msInScope = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'In scope');
    const msOther = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other');
    await seedMilestone(msInScope, 'Scoped milestone');
    await seedMilestone(msOther, 'Other-MS milestone');
    const devCookie = await seedScopedDeveloper([msInScope]);

    const res = await listMilestones(devCookie, '?managed_system_id=all');
    expect(res.statusCode).toBe(200);
    const titles = res.json<{ items: Array<{ title: string }> }>().items.map((i) => i.title);
    expect(titles).toEqual(['Scoped milestone']);
  });

  it('list: status filters return only that stored status (filter, not a transition rule)', async () => {
    const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Filter MS');
    const planningId = await seedMilestone(ms, 'Planning milestone');
    const inFlightId = await seedMilestone(ms, 'In-flight milestone');
    const blockedId = await seedMilestone(ms, 'Blocked milestone');
    await migrateHandle.pool.query(
      `update task.milestones set status = 'in_progress' where id = $1`,
      [inFlightId],
    );
    await migrateHandle.pool.query(`update task.milestones set status = 'blocked' where id = $1`, [
      blockedId,
    ]);
    const adminAll = await listMilestones(adminCookie);
    expect(adminAll.statusCode).toBe(200);
    expect(adminAll.json<{ items: unknown[] }>().items).toHaveLength(3);

    const inProgress = await listMilestones(adminCookie, '?status=in_progress');
    expect(
      inProgress
        .json<{ items: Array<{ title: string; status: string }> }>()
        .items.map((i) => i.title),
    ).toEqual(['In-flight milestone']);

    const blocked = await listMilestones(adminCookie, '?status=blocked');
    expect(blocked.json<{ items: Array<{ title: string }> }>().items.map((i) => i.title)).toEqual([
      'Blocked milestone',
    ]);
    expect(planningId).not.toBe(inFlightId);
  });

  it('list: a User is denied', async () => {
    const res = await listMilestones(userCookie);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('permission.denied');
  });
});
