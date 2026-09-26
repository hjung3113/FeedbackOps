// #514 A9 — source Finding reader on Milestone detail.
// linked_milestone_id has no application writer; tests set it by SQL only.
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

const SLUG_PREFIX = 'it-milestone-source';

describe.skipIf(!runIntegration)('milestone source finding (#514 A9)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  // Per-test fixtures: cleanupFixtures (via cleanupReadTestTables) deletes the
  // prefixed Managed Systems and mock-dev-read actors, so the MS, Developer,
  // grant, and session are (re)created after each cleanup, never before it.
  let msId: string;
  let devCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id from core.actors
        where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
    msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Source MS');
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`${SLUG_PREFIX}-dev`));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'finding.manage', msId, adminActorId);
    devCookie = await loginAs(app, dev.externalId);
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
      `delete from finding.findings
        where workspace_id = $1 and display_id like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}-%`],
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

  async function seedMilestone(title: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/milestones',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${devCookie}`,
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

  // SQL-only seeding of linked_milestone_id: no application writer exists.
  async function seedLinkedFinding(
    milestoneId: string,
    title: string,
    createdAt: string,
    evidenceCount = 0,
  ): Promise<string> {
    const res = await migrateHandle.pool.query<{ id: string }>(
      `insert into finding.findings (
          workspace_id, display_id, primary_managed_system_id, title, summary,
          source_type, severity, evidence_count, linked_milestone_id, created_by
        )
       values ($1, $2, $3, $4, $5, 'manual', 'low', $6, $7, $8)
       returning id`,
      [
        WORKSPACE_ID,
        `${SLUG_PREFIX}-${randomUUID().slice(0, 8)}`,
        msId,
        `${title} summary`,
        evidenceCount,
        milestoneId,
        adminActorId,
      ],
    );
    await migrateHandle.pool.query('update finding.findings set created_at = $2 where id = $1', [
      res.rows[0]?.id,
      createdAt,
    ]);
    return res.rows[0]?.id ?? '';
  }

  function getMilestone(milestoneId: string) {
    return app.inject({
      method: 'GET',
      url: `/milestones/${milestoneId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
  }

  it('get: source_finding is null when no Finding links to the Milestone', async () => {
    const id = await seedMilestone('Unlinked milestone');
    const res = await getMilestone(id);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ source_finding: unknown }>().source_finding).toBeNull();
  });

  it('get: linked Finding returns { id, display_id, title, summary, evidence_count }', async () => {
    const id = await seedMilestone('Linked milestone');
    const findingId = await seedLinkedFinding(id, 'Source finding', '2026-09-01T10:00:00Z', 3);

    const res = await getMilestone(id);
    expect(res.statusCode).toBe(200);
    const source = res.json<{
      source_finding: {
        id: string;
        display_id: string;
        title: string;
        summary: string;
        evidence_count: number;
      } | null;
    }>().source_finding;
    expect(source).not.toBeNull();
    expect(source?.id).toBe(findingId);
    expect(source?.display_id).toMatch(/^FIN-/);
    expect(source?.title).toBe('Source finding');
    expect(source?.summary).toBe('Source finding summary');
    expect(source?.evidence_count).toBe(3);
  });

  it('get: two linked Findings — earliest created_at wins, no 409', async () => {
    const id = await seedMilestone('Two-link milestone');
    const laterId = await seedLinkedFinding(id, 'Later finding', '2026-09-05T10:00:00Z');
    const earlierId = await seedLinkedFinding(id, 'Earlier finding', '2026-09-02T10:00:00Z');

    const res = await getMilestone(id);
    expect(res.statusCode).toBe(200);
    const source = res.json<{ source_finding: { id: string } | null }>().source_finding;
    expect(source?.id).toBe(earlierId);
    expect(source?.id).not.toBe(laterId);
  });
});
