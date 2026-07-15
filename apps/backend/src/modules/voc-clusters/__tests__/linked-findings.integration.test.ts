import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db } from '../../../db/client.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { createCheckService } from '../../permissions/check-service.js';
import { type VocClustersService, createVocClustersService } from '../service.js';
import {
  cleanupVocClusterFixtures,
  grantCapability,
  insertActorRow,
  insertVocClusterRow,
} from './_seed-helpers.js';

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
  const fixtureActorIds: string[] = [];
  const fixtureManagedSystemIds: string[] = [];
  const fixtureClusterIds: string[] = [];
  const fixtureFindingIds: string[] = [];
  const fixtureVocIds: string[] = [];
  const fixtureGrantIds: string[] = [];

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
    fixtureActorIds.push(adminActorId);

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'cluster-linked-ms', 'Cluster Linked MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? '';
    if (!managedSystemId) throw new Error('seed managed system failed');
    fixtureManagedSystemIds.push(managedSystemId);
  });

  afterAll(async () => {
    if (migrateHandle) {
      await cleanupVocClusterFixtures(migrateHandle, {
        workspaceId,
        actorIds: fixtureActorIds,
        managedSystemIds: fixtureManagedSystemIds,
        clusterIds: fixtureClusterIds,
        findingIds: fixtureFindingIds,
        vocIds: fixtureVocIds,
        permissionGrantIds: fixtureGrantIds,
        deleteWorkspace: true,
      });
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
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId,
      title,
      primaryManagedSystemId: managedSystemId,
      createdBy: adminActorId,
    });
    fixtureClusterIds.push(cluster.id);
    return cluster;
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
    fixtureVocIds.push(id);
    return { id };
  }

  async function seedClusterMember(clusterId: string, vocId: string): Promise<void> {
    await migrateHandle.pool.query(
      `insert into voc_cluster.voc_cluster_members (cluster_id, voc_id, added_by)
       values ($1, $2, $3)`,
      [clusterId, vocId, adminActorId],
    );
  }

  async function seedFinding(title: string, primaryManagedSystemId: string, sourceId: string) {
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId,
      primaryManagedSystemId,
      title,
      sourceType: 'voc_cluster',
      sourceId,
      status: 'active',
      createdBy: adminActorId,
    });
    fixtureFindingIds.push(finding.id);
    return finding;
  }

  async function seedFindingLink(
    clusterId: string,
    findingId: string,
    relationType: 'created_finding' | 'evidence_of' = 'created_finding',
  ): Promise<void> {
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values ($1, 'voc_cluster', $2, 'finding', $3, $4, 'internal_only', 'active', $5, $6)`,
      [workspaceId, clusterId, findingId, relationType, managedSystemId, adminActorId],
    );
  }

  it('getCluster includes id, display_id, and status for findings created from the cluster', async () => {
    const cluster = await seedCluster('Linked detail cluster');
    const finding = await seedFinding('Linked detail finding', managedSystemId, cluster.id);
    await seedFindingLink(cluster.id, finding.id);

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

  it('listClusters resolves scoped authorization in a row-count-invariant number of database operations', async () => {
    const scopedDeveloper = await insertActorRow(migrateHandle, {
      workspaceId,
      externalId: `cluster-linked-scoped-${workspaceId}`,
      roleLevel: 'developer',
    });
    fixtureGrantIds.push(
      (
        await grantCapability(migrateHandle, {
          workspaceId,
          actorId: scopedDeveloper.id,
          capability: 'finding.read',
          managedSystemId,
          grantedByActorId: adminActorId,
        })
      ).id,
    );
    fixtureActorIds.push(scopedDeveloper.id);
    const scopedActor = {
      actor_id: scopedDeveloper.id,
      workspace_id: workspaceId,
      role_level: 'developer' as const,
    };
    const countDatabaseOperations = async () => {
      let count = 0;
      const countingDb = new Proxy(dbHandle.db, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (
            typeof value !== 'function' ||
            !['execute', 'select', 'insert', 'update', 'delete', 'transaction'].includes(
              String(prop),
            )
          ) {
            return value;
          }
          return (...args: unknown[]) => {
            count += 1;
            return Reflect.apply(value, target, args);
          };
        },
      }) as Db;
      const countingService = createVocClustersService({
        db: countingDb,
        auditService: createAuditService(),
        checkService: createCheckService({ db: countingDb }),
        idempotencyService: createIdempotencyService(),
      });
      const list = await countingService.listClusters({ actor: scopedActor, managedSystemId });
      return { count, list };
    };

    const baselineClusters = await Promise.all([
      seedCluster('Scoped query baseline 1'),
      seedCluster('Scoped query baseline 2'),
    ]);
    const unreadableMs = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, `cluster-linked-unreadable-${workspaceId}`, 'Cluster Linked Unreadable MS'],
    );
    const unreadableManagedSystemId = unreadableMs.rows[0]?.id;
    if (!unreadableManagedSystemId) throw new Error('seed unreadable managed system failed');
    fixtureManagedSystemIds.push(unreadableManagedSystemId);
    const baselineReadableFindings = await Promise.all(
      baselineClusters.map((cluster, index) =>
        seedFinding(`Scoped baseline readable ${index + 1}`, managedSystemId, cluster.id),
      ),
    );
    const baselineUnreadableFindings = await Promise.all(
      baselineClusters.map((cluster, index) =>
        seedFinding(
          `Scoped baseline unreadable ${index + 1}`,
          unreadableManagedSystemId,
          cluster.id,
        ),
      ),
    );
    await Promise.all([
      ...baselineClusters.map((cluster, index) =>
        seedFindingLink(cluster.id, baselineReadableFindings[index]!.id, 'created_finding'),
      ),
      ...baselineClusters.map((cluster, index) =>
        seedFindingLink(cluster.id, baselineUnreadableFindings[index]!.id, 'evidence_of'),
      ),
    ]);
    const baseline = await countDatabaseOperations();
    const expandedClusters = await Promise.all([
      seedCluster('Scoped query expanded 1'),
      seedCluster('Scoped query expanded 2'),
      seedCluster('Scoped query expanded 3'),
    ]);
    const expandedReadableFindings = await Promise.all(
      expandedClusters.map((cluster, index) =>
        seedFinding(`Scoped expanded readable ${index + 1}`, managedSystemId, cluster.id),
      ),
    );
    const expandedUnreadableFindings = await Promise.all(
      expandedClusters.map((cluster, index) =>
        seedFinding(
          `Scoped expanded unreadable ${index + 1}`,
          unreadableManagedSystemId,
          cluster.id,
        ),
      ),
    );
    await Promise.all([
      ...expandedClusters.map((cluster, index) =>
        seedFindingLink(cluster.id, expandedReadableFindings[index]!.id, 'evidence_of'),
      ),
      ...expandedClusters.map((cluster, index) =>
        seedFindingLink(cluster.id, expandedUnreadableFindings[index]!.id, 'created_finding'),
      ),
    ]);
    const expanded = await countDatabaseOperations();

    expect(baseline.list.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(baselineClusters.map((cluster) => cluster.id)),
    );
    expect(expanded.list.items.length).toBeGreaterThan(baseline.list.items.length);
    for (const [index, cluster] of baselineClusters.entries()) {
      const linkedFindings = baseline.list.items.find(
        (item) => item.id === cluster.id,
      )?.linked_findings;
      expect(linkedFindings?.map((finding) => finding.id)).toContain(
        baselineReadableFindings[index]!.id,
      );
      expect(linkedFindings?.map((finding) => finding.id)).not.toContain(
        baselineUnreadableFindings[index]!.id,
      );
    }
    for (const [index, cluster] of expandedClusters.entries()) {
      const linkedFindings = expanded.list.items.find(
        (item) => item.id === cluster.id,
      )?.linked_findings;
      expect(linkedFindings?.map((finding) => finding.id)).toContain(
        expandedReadableFindings[index]!.id,
      );
      expect(linkedFindings?.map((finding) => finding.id)).not.toContain(
        expandedUnreadableFindings[index]!.id,
      );
    }
    expect(expanded.count).toBe(baseline.count);
  });

  it('getCluster and listClusters return an empty linked_findings array when no findings exist', async () => {
    const cluster = await seedCluster('No linked findings cluster');

    const detail = await vocClustersService.getCluster({ actor: actor(), clusterId: cluster.id });
    const list = await vocClustersService.listClusters({ actor: actor(), managedSystemId });

    expect(detail.linked_findings).toEqual([]);
    expect(list.items.find((item) => item.id === cluster.id)?.linked_findings).toEqual([]);
  });
});
