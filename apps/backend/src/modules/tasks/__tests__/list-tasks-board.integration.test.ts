// #1178 — GET /tasks contract the bounded Task board consumes: comma priority /
// assignee / milestone_id lists, status_group=open, exact per-status totals.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly, insertTeamDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { cleanupReadTestTables } from '../../../test-support/voc-fixtures.js';
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-board-1178';

type Seeded = { id: string; title: string };

describe.skipIf(!runIntegration)('Task board list contract (#1178)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let devCookie: string;
  let devActorId: string;
  let msA: string;
  let msB: string;
  let teamId: string;
  let milestoneA: string;
  let milestoneB: string;
  const tasks = new Map<string, Seeded>();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const actor = await db.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminActorId = actor.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed actors not found');
    await cleanup();
    msA = await insertMsDirectly(db, WORKSPACE_ID, uid(SLUG_PREFIX), 'Board A');
    msB = await insertMsDirectly(db, WORKSPACE_ID, uid(SLUG_PREFIX), 'Board B');
    const dev = await insertDevActor(db, WORKSPACE_ID, uid(SLUG_PREFIX));
    devActorId = dev.id;
    await grantCapability(db, WORKSPACE_ID, dev.id, 'finding.manage', msA, adminActorId);
    devCookie = await loginAs(app, dev.externalId);
    teamId = await insertTeamDirectly(migrate, WORKSPACE_ID, uid(SLUG_PREFIX));
    milestoneA = await insertMilestone(msA, 'Board milestone A');
    milestoneB = await insertMilestone(msA, 'Board milestone B');
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await migrate?.pool.query('delete from core.teams where workspace_id = $1 and name like $2', [
      WORKSPACE_ID,
      `${SLUG_PREFIX}%`,
    ]);
    await app?.close();
    await db?.close();
    await migrate?.close();
  });

  async function cleanup(): Promise<void> {
    if (!migrate) return;
    for (const table of ['task.tasks', 'task.milestones']) {
      await migrate.pool.query(
        `delete from ${table}
          where workspace_id = $1
            and primary_managed_system_id in (
              select id from core.managed_systems where workspace_id = $1 and slug like $2
            )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
    }
    await cleanupReadTestTables(db, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function insertMilestone(managedSystemId: string, title: string): Promise<string> {
    const result = await migrate.pool.query<{ id: string }>(
      `insert into task.milestones (
          workspace_id, display_id, primary_managed_system_id, title, why,
          owner_actor_id, start_date, target_date, created_by
        )
       values ($1, $2, $3, $4, 'why', $5, '2026-10-01', '2026-12-31', $5)
       returning id`,
      [WORKSPACE_ID, `MLS-${randomUUID().slice(0, 8)}`, managedSystemId, title, adminActorId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('insert milestone failed');
    return id;
  }

  async function seed(): Promise<void> {
    const rows: Array<{
      key: string;
      ms: string;
      status: 'backlog' | 'todo' | 'doing' | 'review' | 'done' | 'released' | 'reopened';
      priority: 'low' | 'medium' | 'high' | 'urgent';
      assignee?: string;
      team?: boolean;
      milestone?: string;
    }> = [
      { key: 'b-low', ms: msA, status: 'backlog', priority: 'low' },
      {
        key: 'b-high-admin-msA',
        ms: msA,
        status: 'backlog',
        priority: 'high',
        assignee: adminActorId,
        milestone: milestoneA,
      },
      {
        key: 'b-urgent-dev-msA',
        ms: msA,
        status: 'backlog',
        priority: 'urgent',
        assignee: devActorId,
        milestone: milestoneB,
      },
      { key: 'b-med-team', ms: msA, status: 'backlog', priority: 'medium', team: true },
      { key: 'b-high-msB', ms: msB, status: 'backlog', priority: 'high' },
      { key: 't-high', ms: msA, status: 'todo', priority: 'high' },
      { key: 'doing-med', ms: msA, status: 'doing', priority: 'medium' },
      { key: 'review-low', ms: msA, status: 'review', priority: 'low' },
      { key: 'reopened-urgent', ms: msA, status: 'reopened', priority: 'urgent' },
      { key: 'done-high', ms: msA, status: 'done', priority: 'high' },
      { key: 'released-high', ms: msA, status: 'released', priority: 'high' },
    ];
    for (const row of rows) {
      const inserted = await insertTaskRow(migrate, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: row.ms,
        title: row.key,
        status: row.status,
        priority: row.priority,
        assigneeActorId: row.assignee ?? null,
        milestoneId: row.milestone ?? null,
        createdBy: adminActorId,
      });
      if (row.team) {
        await migrate.pool.query('update task.tasks set assignee_team_id = $2 where id = $1', [
          inserted.id,
          teamId,
        ]);
      }
      tasks.set(row.key, { id: inserted.id, title: row.key });
    }
  }

  function get(query: Record<string, string>, cookie = adminCookie) {
    return app.inject({
      method: 'GET',
      url: `/tasks?${new URLSearchParams({ managed_system_id: 'all', ...query })}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  // Seeded fixtures only: the shared workspace may hold other Tasks.
  async function titles(query: Record<string, string>, cookie = adminCookie): Promise<string[]> {
    const response = await get({ ...query, limit: '100' }, cookie);
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: Array<{ id: string; title: string }>;
      page: { total?: number };
    }>();
    const mine = [...tasks.values()];
    const found = body.items.filter((item) => mine.some((row) => row.id === item.id));
    expect(body.page.total).toBeGreaterThanOrEqual(found.length);
    return found.map((item) => item.title).sort();
  }

  it('priority=high,urgent keeps only those priorities and a total over the same predicate', async () => {
    const response = await get({ status: 'backlog', priority: 'high,urgent', limit: '1' });
    expect(response.statusCode).toBe(200);
    const exact = await migrate.pool.query<{ n: number }>(
      `select count(*)::int as n from task.tasks
        where workspace_id = $1 and status = 'backlog' and priority in ('high', 'urgent')`,
      [WORKSPACE_ID],
    );
    expect(response.json().page.total).toBe(exact.rows[0]?.n);
    expect(await titles({ status: 'backlog', priority: 'high,urgent' })).toEqual([
      'b-high-admin-msA',
      'b-high-msB',
      'b-urgent-dev-msA',
    ]);
  });

  it('status_group=open excludes done and released and leaves in-flight as todo/doing/review', async () => {
    const open = await titles({ status_group: 'open' });
    expect(open).toContain('reopened-urgent');
    expect(open).toContain('b-low');
    expect(open).not.toContain('done-high');
    expect(open).not.toContain('released-high');
    expect(await titles({ status_group: 'in-flight' })).toEqual([
      'doing-med',
      'review-low',
      't-high',
    ]);
  });

  it('assignee accepts a comma list of actors, me and unassigned with OR semantics', async () => {
    expect(await titles({ status: 'backlog', assignee: `${adminActorId},${devActorId}` })).toEqual([
      'b-high-admin-msA',
      'b-urgent-dev-msA',
    ]);
    expect(await titles({ status: 'backlog', assignee: `me,${devActorId}` })).toEqual([
      'b-high-admin-msA',
      'b-urgent-dev-msA',
    ]);
    const unassigned = await titles({ status: 'backlog', assignee: 'unassigned' });
    expect(unassigned).toEqual(['b-high-msB', 'b-low']);
    expect(unassigned).not.toContain('b-med-team');
    expect(await titles({ status: 'backlog', assignee: `unassigned,${devActorId}` })).toEqual([
      'b-high-msB',
      'b-low',
      'b-urgent-dev-msA',
    ]);
  });

  it('legacy single assignee and assignee_team_id still intersect', async () => {
    expect(await titles({ status: 'backlog', assignee: adminActorId })).toEqual([
      'b-high-admin-msA',
    ]);
    expect(await titles({ status: 'backlog', assignee_team_id: teamId })).toEqual(['b-med-team']);
    expect(
      await titles({ status: 'backlog', assignee: adminActorId, assignee_team_id: teamId }),
    ).toEqual([]);
  });

  it('milestone_id accepts exact ids, any and none with OR semantics', async () => {
    expect(
      await titles({ status: 'backlog', milestone_id: `${milestoneA},${milestoneB}` }),
    ).toEqual(['b-high-admin-msA', 'b-urgent-dev-msA']);
    expect(await titles({ status: 'backlog', milestone_id: milestoneA })).toEqual([
      'b-high-admin-msA',
    ]);
    expect(await titles({ status: 'backlog', milestone_id: 'any' })).toEqual([
      'b-high-admin-msA',
      'b-urgent-dev-msA',
    ]);
    expect(await titles({ status: 'backlog', milestone_id: 'none' })).toEqual([
      'b-high-msB',
      'b-low',
      'b-med-team',
    ]);
    expect(await titles({ status: 'backlog', milestone_id: `none,${milestoneA}` })).toEqual([
      'b-high-admin-msA',
      'b-high-msB',
      'b-low',
      'b-med-team',
    ]);
  });

  it.each([
    ['priority', 'high,bogus'],
    ['priority', 'low,medium,high,urgent,low2'],
    ['assignee', 'not-a-uuid'],
    ['assignee', 'me,nobody'],
    ['milestone_id', 'bogus,any'],
    ['milestone_id', ''],
    ['status_group', 'closed'],
  ])('rejects %s=%s with validation.failed at the field', async (field, value) => {
    const response = await get({ [field]: value });
    expect(response.statusCode).toBe(422);
    const body = response.json<{ code: string; detail: { fields: Array<{ path: string[] }> } }>();
    expect(body.code).toBe('validation.failed');
    expect(body.detail.fields.map((f) => f.path)).toContainEqual([field]);
  });

  it('rejects more than 20 selected assignees', async () => {
    const many = Array.from({ length: 21 }, () => randomUUID()).join(',');
    const response = await get({ assignee: many });
    expect(response.statusCode).toBe(422);
  });

  it('a scoped Developer sees per-status totals for in-scope Tasks only, and limit=2 walks every Task once', async () => {
    const adminTotal = (await get({ status: 'backlog', limit: '1' })).json().page.total as number;
    const scoped = await get({ status: 'backlog', limit: '1' }, devCookie);
    expect(scoped.statusCode).toBe(200);
    const inScope = await migrate.pool.query<{ n: number }>(
      `select count(*)::int as n from task.tasks
        where workspace_id = $1 and status = 'backlog' and primary_managed_system_id = $2`,
      [WORKSPACE_ID, msA],
    );
    expect(scoped.json().page.total).toBe(inScope.rows[0]?.n);
    expect(scoped.json().page.total).toBeLessThan(adminTotal);

    const walked: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await get(
        { status: 'backlog', limit: '2', ...(cursor === undefined ? {} : { cursor }) },
        devCookie,
      );
      const body = page.json<{ items: Array<{ id: string }>; page: { cursor?: string } }>();
      walked.push(...body.items.map((item) => item.id));
      cursor = body.page.cursor;
    } while (cursor !== undefined);
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked).toHaveLength(inScope.rows[0]?.n ?? -1);
    expect(walked).not.toContain(tasks.get('b-high-msB')?.id);
  });
});
