// Triage high-tab integration tests (#411).
//
// The list and nav badge must agree that both high and critical VOCs belong to
// the high-priority triage queue. Fixtures use direct SQL so mutation rate
// limits do not affect this read-path coverage.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { insertTaskRequestRow } from '../../task-requests/__tests__/_seed-helpers.js';
import { insertTaskRow } from '../../tasks/__tests__/_seed-helpers.js';
import {
  cleanupReadTestTables,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-triage-high';

interface VocListBody {
  items: { id: string; display_id: string }[];
}

describe.skipIf(!runIntegration)('GET triage high tab (#411)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  let reporterId: string;

  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function createTriageActor(testName: string): Promise<string> {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(testName));
    await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'voc.read', null, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'voc.triage', null, adminActorId);
    return loginAs(app, actor.externalId);
  }

  async function displayIdOf(vocId: string): Promise<string> {
    const result = await dbHandle.pool.query<{ display_id: string }>(
      'select display_id from voc.vocs where id = $1',
      [vocId],
    );
    const displayId = result.rows[0]?.display_id;
    if (!displayId) throw new Error(`display ID missing for ${vocId}`);
    return displayId;
  }

  async function cleanupFixtures() {
    await migrateHandle.pool.query(
      `delete from core.entity_links
       where workspace_id = $1 and managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    // #513 N1: AC-4 seeds direct follow-up targets (finding/task/task_request).
    // Remove them before the shared helper deletes the managed systems they
    // reference.
    await migrateHandle.pool.query(
      `delete from finding.findings
       where primary_managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks
       where primary_managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task_request.task_requests
       where primary_managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    const admin = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const reporter = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    reporterId = reporter.rows[0]?.id ?? '';
    if (!adminActorId || !reporterId) throw new Error('seed actors missing');
  });

  beforeEach(cleanupFixtures);

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('AC-1 AC-2 AC-3: lists and counts high plus critical, but not medium, in triage high', async () => {
    const cookie = await createTriageActor('list-and-count');
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Triage high list and count',
    );
    const critical = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'Critical VOC',
      {
        severity: 'critical',
      },
    );
    const high = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'High VOC', {
      severity: 'high',
    });
    const medium = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, 'Medium VOC', {
      severity: 'medium',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage&tab=high',
      headers: headers(cookie),
    });

    expect(response.statusCode).toBe(200);
    const displayIds = new Set(
      (response.json() as VocListBody).items.map((item) => item.display_id),
    );
    const expected = new Set([await displayIdOf(critical.id), await displayIdOf(high.id)]);
    expect([...expected].filter((displayId) => !displayIds.has(displayId))).toEqual([]);
    expect(displayIds.has(await displayIdOf(medium.id))).toBe(false);

    const countResponse = await app.inject({
      method: 'GET',
      url: '/nav/counts',
      headers: headers(cookie),
    });

    expect(countResponse.statusCode).toBe(200);
    expect(countResponse.json<{ counts: Record<string, number> }>().counts['voc.tab.high']).toBe(2);
  });

  it('AC-4: preserves high-no-link as high and critical VOCs without follow-up links', async () => {
    const cookie = await createTriageActor('no-link');
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Triage high no link',
    );
    const critical = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'Critical unlinked',
      {
        severity: 'critical',
      },
    );
    const high = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'High unlinked',
      {
        severity: 'high',
      },
    );
    const medium = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'Medium unlinked',
      {
        severity: 'medium',
      },
    );

    // #513 N1: voc ↔ voc related_to is not a follow-up link. Both sides of
    // the pair stay in the tab.
    const relatedHigh = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'High related only',
      {
        severity: 'high',
      },
    );
    const relatedPeer = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'Related peer',
    );

    // Direct follow-up links take the VOC out of the tab.
    const findingHigh = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'High linked finding',
      {
        severity: 'high',
      },
    );
    const taskHigh = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'High linked task',
      {
        severity: 'high',
      },
    );
    const requestHigh = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'High linked task request',
      {
        severity: 'high',
      },
    );

    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceId: findingHigh.id,
      status: 'active',
      createdBy: adminActorId,
      title: 'AC-4 direct finding',
    });
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      status: 'todo',
      createdBy: adminActorId,
    });
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: requestHigh.id,
      primaryManagedSystemId: msId,
      requesterActorId: adminActorId,
    });

    const link = async (
      sourceType: string,
      sourceId: string,
      targetType: string,
      targetId: string,
      relationType: string,
    ) => {
      await migrateHandle.pool.query(
        `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values ($1, $2, $3, $4, $5, $6, 'internal_only', 'active', $7, $8)`,
        [
          WORKSPACE_ID,
          sourceType,
          sourceId,
          targetType,
          targetId,
          relationType,
          msId,
          adminActorId,
        ],
      );
    };
    await link('voc', relatedHigh.id, 'voc', relatedPeer.id, 'related_to');
    await link('voc', findingHigh.id, 'finding', finding.id, 'created_finding');
    await link('voc', taskHigh.id, 'task', task.id, 'evidence_of');
    await link('voc', requestHigh.id, 'task_request', request.id, 'requested_task');

    const response = await app.inject({
      method: 'GET',
      url: '/vocs?view=triage&tab=high-no-link',
      headers: headers(cookie),
    });

    expect(response.statusCode).toBe(200);
    const displayIds = new Set(
      (response.json() as VocListBody).items.map((item) => item.display_id),
    );
    const expected = new Set([
      await displayIdOf(critical.id),
      await displayIdOf(high.id),
      await displayIdOf(relatedHigh.id),
    ]);
    expect(displayIds).toEqual(expected);
    expect(displayIds.has(await displayIdOf(relatedPeer.id))).toBe(false);
    expect(displayIds.has(await displayIdOf(medium.id))).toBe(false);
    expect(displayIds.has(await displayIdOf(findingHigh.id))).toBe(false);
    expect(displayIds.has(await displayIdOf(taskHigh.id))).toBe(false);
    expect(displayIds.has(await displayIdOf(requestHigh.id))).toBe(false);
  });
});
