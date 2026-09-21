// Findings application seam (#391) — createFindingFromVocCluster,
// lockFindingForUpdate, linkTaskToFinding — exercised inside db.transaction
// directly (not via HTTP).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role
// is required for fixture cleanup. Domain rows are written inside transactions
// that roll back, so only seed rows (MS, actor) need cleanup.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { insertDevActor, insertMsDirectly, uid } from '../../voc/__tests__/_seed-helpers.js';
import { insertTaskRow } from '../../tasks/__tests__/_seed-helpers.js';
import {
  createFindingFromVocCluster,
  linkTaskToFinding,
  lockFindingForUpdate,
} from '../commands.js';
import { insertFindingRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-findings-cmd';
const ACTOR_SUFFIX = 'fcmd';

class Rollback extends Error {}

describe.skipIf(!runIntegration)('findings command seam (#391)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    await cleanupFixtures();
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, ACTOR_SUFFIX);
    actorId = actor.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    // FK-safe order: children before parents.
    await migrateHandle.pool.query(
      `delete from finding.findings
        where workspace_id = $1
          and primary_managed_system_id in (
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
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.actors where workspace_id = $1 and external_id like $2`,
      [WORKSPACE_ID, `mock-dev-read-${ACTOR_SUFFIX}%`],
    );
  }

  async function inRolledBackTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
    await expect(
      dbHandle.db.transaction(async (tx) => {
        await fn(tx);
        throw new Rollback('rollback');
      }),
    ).rejects.toThrow(Rollback);
  }

  it('createFindingFromVocCluster inserts a voc_cluster-sourced finding', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Seam MS');

    await inRolledBackTx(async (tx) => {
      const finding = await createFindingFromVocCluster(tx, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        title: 'Seam finding',
        summary: 'Finding created through the #391 seam',
        sourceId: randomUUID(),
        severity: 'high',
        confidence: 'medium',
        analyticsAreaId: null,
        createdBy: actorId,
      });
      expect(finding.workspace_id).toBe(WORKSPACE_ID);
      expect(finding.source_type).toBe('voc_cluster');
      expect(finding.status).toBe('draft');
      expect(finding.display_id.length).toBeGreaterThan(0);
      expect(finding.linked_task_id).toBeNull();
    });

    const persisted = await dbHandle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from finding.findings
        where workspace_id = $1 and title = 'Seam finding'`,
      [WORKSPACE_ID],
    );
    expect(persisted.rows[0]?.count).toBe('0');
  });

  it('linkTaskToFinding sets linked_task_id only while it is null', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Seam MS');
    const seeded = await insertFindingRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceId: randomUUID(),
      createdBy: actorId,
    });
    const task1 = await insertTaskRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Seam task 1',
      createdBy: actorId,
    });
    const task2 = await insertTaskRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Seam task 2',
      createdBy: actorId,
    });

    await inRolledBackTx(async (tx) => {
      const locked = await lockFindingForUpdate(tx, {
        workspaceId: WORKSPACE_ID,
        findingId: seeded.id,
      });
      expect(locked?.id).toBe(seeded.id);
      expect(locked?.linked_task_id).toBeNull();

      const first = await linkTaskToFinding(tx, {
        workspaceId: WORKSPACE_ID,
        findingId: seeded.id,
        taskId: task1.id,
      });
      expect(first?.linked_task_id).toBe(task1.id);

      const second = await linkTaskToFinding(tx, {
        workspaceId: WORKSPACE_ID,
        findingId: seeded.id,
        taskId: task2.id,
      });
      // First link wins; the second call must leave it in place.
      expect(second?.linked_task_id).toBe(task1.id);

      const reread = await lockFindingForUpdate(tx, {
        workspaceId: WORKSPACE_ID,
        findingId: seeded.id,
      });
      expect(reread?.linked_task_id).toBe(task1.id);
    });

    const persisted = await dbHandle.pool.query<{ linked_task_id: string | null }>(
      `select linked_task_id::text from finding.findings where id = $1::uuid`,
      [seeded.id],
    );
    expect(persisted.rows[0]?.linked_task_id).toBeNull();
  });
});
