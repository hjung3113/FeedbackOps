import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db } from '../../../db/client.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { createCheckService } from '../../permissions/check-service.js';
import { type VocClustersService, createVocClustersService } from '../service.js';
import { insertVocClusterRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[linked-findings] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

describe.skipIf(!runIntegration)('VOC cluster linked findings contract (#130)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let vocClustersService: VocClustersService;
  const workspaceId = randomUUID();
  let adminActorId: string;
  let managedSystemId: string;

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    vocClustersService = createVocClustersService({
      db: dbHandle.db,
      auditService: createAuditService(),
      checkService: createCheckService({ db: dbHandle.db }),
      idempotencyService: createIdempotencyService(),
    });

    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'Cluster Linked Findings Test Workspace',
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (
          workspace_id, external_id, email, display_name, role_level, actor_type
        )
       values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `cluster-linked-admin-${workspaceId}`,
        `cluster-linked-${workspaceId}@local`,
        'Cluster Linked Admin',
      ],
    );
    adminActorId = actor.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor failed');

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'cluster-linked-ms', 'Cluster Linked MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? '';
    if (!managedSystemId) throw new Error('seed managed system failed');
  });

  afterAll(async () => {
    if (migrateHandle) {
      await migrateHandle.pool.query('delete from finding.findings where workspace_id = $1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        `delete from voc_cluster.voc_cluster_members
          where cluster_id in (
            select id from voc_cluster.voc_clusters where workspace_id = $1
          )`,
        [workspaceId],
      );
      await migrateHandle.pool.query(
        'delete from voc_cluster.voc_clusters where workspace_id = $1',
        [workspaceId],
      );
      await migrateHandle.pool.query('delete from voc.vocs where workspace_id = $1', [workspaceId]);
      await migrateHandle.pool.query('delete from core.managed_systems where workspace_id = $1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.actors where workspace_id = $1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.display_counters where workspace_id = $1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    }
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  function actor() {
    return {
      actor_id: adminActorId,
      workspace_id: workspaceId,
      role_level: 'admin' as const,
    };
  }

  async function seedCluster(title: string) {
    return insertVocClusterRow(migrateHandle, {
      workspaceId,
      title,
      primaryManagedSystemId: managedSystemId,
      createdBy: adminActorId,
    });
  }

  async function seedVoc(title: string): Promise<{ id: string }> {
    const res = await migrateHandle.pool.query<{ id: string }>(
      `insert into voc.vocs (
          workspace_id, primary_managed_system_id, reporter_id, display_id, title,
          description_rich_content, source_context, reporter_facing_status, triage_state
        )
       values (
          $1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
          'direct_use', 'received', 'untriaged'
        )
       returning id`,
      [workspaceId, managedSystemId, adminActorId, title],
    );
    const id = res.rows[0]?.id;
    if (!id) throw new Error(`seed voc failed for title=${title}`);
    return { id };
  }

  async function seedClusterMember(clusterId: string, vocId: string): Promise<void> {
    await migrateHandle.pool.query(
      `insert into voc_cluster.voc_cluster_members (cluster_id, voc_id, added_by)
       values ($1, $2, $3)`,
      [clusterId, vocId, adminActorId],
    );
  }

  it('getCluster includes id, display_id, and status for findings created from the cluster', async () => {
    const cluster = await seedCluster('Linked detail cluster');
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId,
      primaryManagedSystemId: managedSystemId,
      title: 'Linked detail finding',
      sourceType: 'voc_cluster',
      sourceId: cluster.id,
      status: 'active',
      createdBy: adminActorId,
    });

    const detail = await vocClustersService.getCluster({ actor: actor(), clusterId: cluster.id });

    expect(detail.linked_findings).toEqual([
      { id: finding.id, display_id: finding.display_id, status: 'active' },
    ]);
  });

  it('listClusters returns member_count for populated and empty clusters in the same response', async () => {
    const withMembers = await seedCluster('Member count list cluster');
    const empty = await seedCluster('Empty member count list cluster');
    const vocs = await Promise.all([
      seedVoc('Member count VOC 1'),
      seedVoc('Member count VOC 2'),
      seedVoc('Member count VOC 3'),
    ]);
    for (const voc of vocs) {
      await seedClusterMember(withMembers.id, voc.id);
    }

    const list = await vocClustersService.listClusters({ actor: actor(), managedSystemId });

    expect(list.items.find((item) => item.id === withMembers.id)?.member_count).toBe(3);
    expect(list.items.find((item) => item.id === empty.id)?.member_count).toBe(0);
  });

  it('getCluster returns member_count matching the members array length', async () => {
    const cluster = await seedCluster('Member count detail cluster');
    const vocs = await Promise.all([
      seedVoc('Member count detail VOC 1'),
      seedVoc('Member count detail VOC 2'),
    ]);
    for (const voc of vocs) {
      await seedClusterMember(cluster.id, voc.id);
    }

    const detail = await vocClustersService.getCluster({ actor: actor(), clusterId: cluster.id });

    expect(detail.member_count).toBe(2);
    expect(detail.member_count).toBe(detail.members?.length);
  });

  it('listClusters batches linked finding lookup and returns arrays for clusters with and without findings', async () => {
    const withFinding = await seedCluster('Linked list cluster');
    const withoutFinding = await seedCluster('Unlinked list cluster');
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId,
      primaryManagedSystemId: managedSystemId,
      title: 'Linked list finding',
      sourceType: 'voc_cluster',
      sourceId: withFinding.id,
      status: 'not_actionable',
      createdBy: adminActorId,
    });

    let executeCount = 0;
    const countingDb = new Proxy(dbHandle.db, {
      get(target, prop, receiver) {
        if (prop !== 'execute') return Reflect.get(target, prop, receiver);
        return (...args: Parameters<Db['execute']>) => {
          executeCount += 1;
          return target.execute(...args);
        };
      },
    }) as Db;
    const countingService = createVocClustersService({
      db: countingDb,
      auditService: createAuditService(),
      checkService: createCheckService({ db: countingDb }),
      idempotencyService: createIdempotencyService(),
    });

    const list = await countingService.listClusters({ actor: actor(), managedSystemId });

    expect(executeCount).toBe(2);
    expect(list.items.find((item) => item.id === withFinding.id)?.linked_findings).toEqual([
      { id: finding.id, display_id: finding.display_id, status: 'not_actionable' },
    ]);
    expect(list.items.find((item) => item.id === withoutFinding.id)?.linked_findings).toEqual([]);
  });

  it('getCluster and listClusters return an empty linked_findings array when no findings exist', async () => {
    const cluster = await seedCluster('No linked findings cluster');

    const detail = await vocClustersService.getCluster({ actor: actor(), clusterId: cluster.id });
    const list = await vocClustersService.listClusters({ actor: actor(), managedSystemId });

    expect(detail.linked_findings).toEqual([]);
    expect(list.items.find((item) => item.id === cluster.id)?.linked_findings).toEqual([]);
  });
});
