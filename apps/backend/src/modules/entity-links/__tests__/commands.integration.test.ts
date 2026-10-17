import { lockRecoveryCommand } from '../../../db/recovery-command-lock.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
// Entity Links application seam (#391) — createEntityLink, findActiveEntityLink,
// detachEntityLink — exercised inside db.transaction directly (not via HTTP).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role is
// required because core.entity_links is append-only to fops_app. Domain rows
// are written inside a rolled-back transaction, so only seed rows (MS, actor)
// need cleanup.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sql } from 'drizzle-orm';
import { type DbHandle, createDb } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { recoveryIdentity } from '../../dashboard/identity.js';
import { createOwnerRecoveryRecorder } from '../../dashboard/truth.js';
import { createEntityLink, detachEntityLink, findActiveEntityLink } from '../commands.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-el-cmd';
const ACTOR_SUFFIX = 'elcmd';

class Rollback extends Error {}

describe.skipIf(!runIntegration)('entity-links command seam (#391)', () => {
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
    for (const table of ['finding.findings', 'voc.vocs']) {
      await migrateHandle.pool.query(
        `DELETE FROM ${table} WHERE workspace_id=$1::uuid AND primary_managed_system_id IN (SELECT id FROM core.managed_systems WHERE workspace_id=$1::uuid AND slug LIKE $2::text)`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
    }
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await deleteRecoveryFixtureParents(
      migrateHandle,
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
        // Caller contract: the owning command takes the workspace recovery lock first.
        await lockRecoveryCommand(tx, WORKSPACE_ID);
        await fn(tx);
        throw new Rollback('rollback');
      }),
    ).rejects.toThrow(Rollback);
  }

  it('records link repair/detach/recreate occurrences atomically at the owner seam', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Recovery links MS',
    );
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      actorId,
      'High recovery VOC',
    );
    await migrateHandle.pool.query("UPDATE voc.vocs SET severity='high' WHERE id=$1::uuid", [
      voc.id,
    ]);
    const finding = await insertFindingRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceId: voc.id,
      createdBy: actorId,
    });
    const recorder = createOwnerRecoveryRecorder();
    const token = recoveryIdentity('high-severity-unlinked', voc.id);
    await inRolledBackTx(async (tx) => {
      const input = {
        workspaceId: WORKSPACE_ID,
        sourceType: 'voc' as const,
        sourceId: voc.id,
        targetType: 'finding' as const,
        targetId: finding.id,
        relationType: 'created_finding' as const,
        managedSystemId: msId,
        createdBy: actorId,
        visibility: 'internal_only' as const,
      };
      const subjects = [
        { type: 'voc' as const, id: voc.id },
        { type: 'finding' as const, id: finding.id },
      ];
      const before = await recorder.capture(tx, WORKSPACE_ID, subjects);
      const link = await createEntityLink(tx, input);
      await recorder.finish(tx, before, actorId, 'createLink');
      const detach = await recorder.capture(tx, WORKSPACE_ID, subjects);
      await detachEntityLink(tx, {
        workspaceId: WORKSPACE_ID,
        linkId: link.row.id,
        actorId,
        reason: 'Reopen',
      });
      await recorder.finish(tx, detach, actorId, 'detachLink');
      const reclose = await recorder.capture(tx, WORKSPACE_ID, subjects);
      await createEntityLink(tx, input);
      await recorder.finish(tx, reclose, actorId, 'createLink');
      expect(
        (
          await tx.execute(
            sql`SELECT occurrence,state FROM dashboard.recovery_identities WHERE workspace_id=${WORKSPACE_ID}::uuid AND recovery_item_id=${token}`,
          )
        ).rows,
      ).toEqual([{ occurrence: 2, state: 'resolved' }]);
      expect(
        (
          await tx.execute(
            sql`SELECT occurrence FROM dashboard.recovery_history WHERE workspace_id=${WORKSPACE_ID}::uuid AND recovery_item_id=${token} ORDER BY occurrence`,
          )
        ).rows,
      ).toEqual([{ occurrence: 1 }, { occurrence: 2 }]);
    });
    expect(
      (
        await dbHandle.pool.query(
          'SELECT occurrence FROM dashboard.recovery_history WHERE workspace_id=$1::uuid AND recovery_item_id=$2',
          [WORKSPACE_ID, token],
        )
      ).rows,
    ).toEqual([]);
  });

  it('concurrent ordinary creates return one canonical active ID and one inserted outcome', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Concurrent MS');
    const input = {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc' as const,
      sourceId: randomUUID(),
      targetType: 'finding' as const,
      targetId: randomUUID(),
      relationType: 'created_finding' as const,
      managedSystemId: msId,
      createdBy: actorId,
      visibility: 'internal_only' as const,
    };
    const results = await Promise.all([
      dbHandle.db.transaction((tx) => createEntityLink(tx, input)),
      dbHandle.db.transaction((tx) => createEntityLink(tx, input)),
    ]);
    expect(results.map((r) => r.inserted).sort()).toEqual([false, true]);
    expect(results[0]?.row.id).toBe(results[1]?.row.id);
    const canonical = await migrateHandle.pool.query(
      'select id from core.entity_links where workspace_id = $1 and source_id = $2::uuid',
      [WORKSPACE_ID, input.sourceId],
    );
    expect(canonical.rows).toEqual([{ id: results[0]?.row.id }]);
  });

  it('create/find/detach round trip; detached link is no longer active', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Seam MS');
    const sourceId = randomUUID();
    const targetId = randomUUID();

    await inRolledBackTx(async (tx) => {
      const input = {
        workspaceId: WORKSPACE_ID,
        sourceType: 'voc_cluster' as const,
        sourceId,
        targetType: 'finding' as const,
        targetId,
        relationType: 'evidence_of' as const,
        managedSystemId: msId,
        createdBy: actorId,
        visibility: 'internal_only' as const,
      };

      const created = await createEntityLink(tx, input);
      expect(created.inserted).toBe(true);

      const duplicate = await createEntityLink(tx, input);
      expect(duplicate.inserted).toBe(false);
      expect(duplicate.row.id).toBe(created.row.id);

      const found = await findActiveEntityLink(tx, input);
      expect(found?.id).toBe(created.row.id);

      const detached = await detachEntityLink(tx, {
        workspaceId: WORKSPACE_ID,
        linkId: created.row.id,
        actorId,
        reason: 'seam test detach',
      });
      expect(detached?.status).toBe('detached');

      expect(await findActiveEntityLink(tx, input)).toBeNull();

      // The partial unique index only covers active links, so re-creating
      // after detach yields a fresh active row.
      const recreated = await createEntityLink(tx, input);
      expect(recreated.inserted).toBe(true);
      expect(recreated.row.id).not.toBe(created.row.id);
    });

    const persisted = await migrateHandle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from core.entity_links
        where workspace_id = $1 and source_id = $2::uuid`,
      [WORKSPACE_ID, sourceId],
    );
    expect(persisted.rows[0]?.count).toBe('0');
  });
});
