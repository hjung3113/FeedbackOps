import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createVocClustersService, type VocClustersService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[create-cluster-display-id] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

describe.skipIf(!runIntegration)('cluster display_id assignment (#142)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let vocClustersService: VocClustersService;
  const workspaceId = randomUUID();
  let adminActorId: string | null = null;
  let managedSystemId: string | null = null;

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    vocClustersService = createVocClustersService({
      db: dbHandle.db,
      auditService: createAuditService(),
      checkService: createCheckService({ db: dbHandle.db }),
      idempotencyService: createIdempotencyService(),
    });

    await migrateHandle.pool.query(`insert into core.workspaces (id, name) values ($1, $2)`, [
      workspaceId,
      'Cluster Display ID Test Workspace',
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (
          workspace_id, external_id, email, display_name, role_level, actor_type
        )
       values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `cluster-display-admin-${workspaceId}`,
        `cluster-display-${workspaceId}@local`,
        'Cluster Display Admin',
      ],
    );
    adminActorId = actor.rows[0]?.id ?? null;
    if (!adminActorId) throw new Error('seed admin actor failed');

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'cluster-display-ms', 'Cluster Display MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? null;
    if (!managedSystemId) throw new Error('seed managed system failed');
  });

  afterAll(async () => {
    if (migrateHandle) {
      await migrateHandle.pool.query(
        `delete from voc_cluster.voc_clusters where workspace_id = $1`,
        [workspaceId],
      );
      if (adminActorId) {
        await migrateHandle.pool.query(`delete from core.idempotency_keys where actor_id = $1`, [
          adminActorId,
        ]);
      }
      await migrateHandle.pool.query(
        `delete from core.managed_systems where workspace_id = $1`,
        [workspaceId],
      );
      await migrateHandle.pool.query(`delete from core.audit_log where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.actors where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.display_counters where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.workspaces where id = $1`, [workspaceId]);
    }
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('assigns CLU display_id values to successive cluster creations in one workspace', async () => {
    if (!adminActorId || !managedSystemId) throw new Error('seed IDs missing');
    const actor = {
      actor_id: adminActorId,
      workspace_id: workspaceId,
      role_level: 'admin' as const,
    };

    const first = await vocClustersService.createCluster({
      actor,
      input: {
        title: 'First cluster',
        summary: 'First display-id cluster summary',
        primary_managed_system_id: managedSystemId,
      },
    });
    const second = await vocClustersService.createCluster({
      actor,
      input: {
        title: 'Second cluster',
        summary: 'Second display-id cluster summary',
        primary_managed_system_id: managedSystemId,
      },
    });

    expect(first.body.display_id).toBe('CLU-1000');
    expect(second.body.display_id).toBe('CLU-1001');
  });
});
