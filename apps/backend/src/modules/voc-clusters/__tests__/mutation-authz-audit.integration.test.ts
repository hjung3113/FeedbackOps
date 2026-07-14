import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { type VocClustersService, createVocClustersService } from '../service.js';
import {
  grantCapability,
  insertActorRow,
  insertVocClusterMemberRow,
  insertVocClusterRow,
  insertVocRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[voc-clusters mutation authz audit] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

type AuditRow = {
  workspace_id: string;
  actor_id: string;
  event_type: string;
  subject_type: string;
  subject_id: string;
  detail: Record<string, unknown>;
};

describe.skipIf(!runIntegration)('VOC cluster mutation authorization and audit rows (#149)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let vocClustersService: VocClustersService;
  const workspaceId = randomUUID();
  let adminActorId: string;
  let deniedDeveloperActorId: string;
  let plainUserActorId: string;
  let managerActorId: string;
  let targetOnlyManagerActorId: string;
  let managedSystemId: string;
  let targetManagedSystemId: string;

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
      'VOC Cluster Mutation Authz Audit Test Workspace',
    ]);

    adminActorId = (
      await insertActorRow(migrateHandle, {
        workspaceId,
        externalId: `cluster-authz-admin-${workspaceId}`,
        displayName: 'Cluster Authz Admin',
        roleLevel: 'admin',
      })
    ).id;
    deniedDeveloperActorId = (
      await insertActorRow(migrateHandle, {
        workspaceId,
        externalId: `cluster-authz-denied-dev-${workspaceId}`,
        displayName: 'Cluster Authz Denied Developer',
        roleLevel: 'developer',
      })
    ).id;
    plainUserActorId = (
      await insertActorRow(migrateHandle, {
        workspaceId,
        externalId: `cluster-authz-user-${workspaceId}`,
        displayName: 'Cluster Authz User',
        roleLevel: 'user',
      })
    ).id;
    managerActorId = (
      await insertActorRow(migrateHandle, {
        workspaceId,
        externalId: `cluster-authz-manager-${workspaceId}`,
        displayName: 'Cluster Authz Manager',
        roleLevel: 'developer',
      })
    ).id;
    targetOnlyManagerActorId = (
      await insertActorRow(migrateHandle, {
        workspaceId,
        externalId: `cluster-authz-target-manager-${workspaceId}`,
        displayName: 'Cluster Authz Target Manager',
        roleLevel: 'developer',
      })
    ).id;

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'cluster-authz-ms', 'Cluster Authz MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? '';
    if (!managedSystemId) throw new Error('seed managed system failed');
    const targetMs = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'cluster-authz-target-ms', 'Cluster Authz Target MS'],
    );
    targetManagedSystemId = targetMs.rows[0]?.id ?? '';
    if (!targetManagedSystemId) throw new Error('seed target managed system failed');

    await grantCapability(migrateHandle, {
      workspaceId,
      actorId: managerActorId,
      capability: 'finding.manage',
      managedSystemId,
      grantedByActorId: adminActorId,
    });
    await grantCapability(migrateHandle, {
      workspaceId,
      actorId: managerActorId,
      capability: 'voc.read',
      managedSystemId,
      grantedByActorId: adminActorId,
    });
    await grantCapability(migrateHandle, {
      workspaceId,
      actorId: targetOnlyManagerActorId,
      capability: 'finding.manage',
      managedSystemId: targetManagedSystemId,
      grantedByActorId: adminActorId,
    });
  });

  beforeEach(async () => {
    await cleanupMutationFixtures();
  });

  afterAll(async () => {
    await cleanupMutationFixtures();
    if (migrateHandle) {
      await migrateHandle.pool.query(
        'delete from permission.permission_grants where workspace_id = $1',
        [workspaceId],
      );
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

  async function cleanupMutationFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query('delete from core.entity_links where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from core.audit_log where workspace_id = $1', [
      workspaceId,
    ]);
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
    await migrateHandle.pool.query('delete from voc_cluster.voc_clusters where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from voc.vocs where workspace_id = $1', [workspaceId]);
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys
        where actor_id in (
          select id from core.actors where workspace_id = $1
        )`,
      [workspaceId],
    );
  }

  function deniedDeveloper() {
    return {
      actor_id: deniedDeveloperActorId,
      workspace_id: workspaceId,
      role_level: 'developer' as const,
    };
  }

  function plainUser() {
    return {
      actor_id: plainUserActorId,
      workspace_id: workspaceId,
      role_level: 'user' as const,
    };
  }

  function manager() {
    return {
      actor_id: managerActorId,
      workspace_id: workspaceId,
      role_level: 'developer' as const,
    };
  }

  function targetOnlyManager() {
    return {
      actor_id: targetOnlyManagerActorId,
      workspace_id: workspaceId,
      role_level: 'developer' as const,
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

  async function seedVoc(title: string) {
    return insertVocRow(migrateHandle, {
      workspaceId,
      primaryManagedSystemId: managedSystemId,
      reporterId: adminActorId,
      title,
    });
  }

  async function auditCount(): Promise<number> {
    const res = await migrateHandle.pool.query<{ n: number }>(
      'select count(*)::int as n from core.audit_log where workspace_id = $1',
      [workspaceId],
    );
    return res.rows[0]?.n ?? 0;
  }

  async function auditRows(eventTypes: readonly string[]): Promise<AuditRow[]> {
    const res = await migrateHandle.pool.query<AuditRow>(
      `select workspace_id, actor_id, event_type, subject_type, subject_id, detail
         from core.audit_log
        where workspace_id = $1
          and event_type = any($2::text[])
        order by created_at asc, id asc`,
      [workspaceId, eventTypes],
    );
    return res.rows;
  }

  async function tableCount(sql: string, values: unknown[]): Promise<number> {
    const res = await migrateHandle.pool.query<{ n: number }>(sql, values);
    return res.rows[0]?.n ?? 0;
  }

  it('denies createCluster without finding.manage and persists no cluster or audit row', async () => {
    await expect(
      vocClustersService.createCluster({
        actor: deniedDeveloper(),
        input: {
          title: 'Denied create cluster',
          summary: 'Should not persist',
          primary_managed_system_id: managedSystemId,
        },
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });

    expect(
      await tableCount(
        `select count(*)::int as n
           from voc_cluster.voc_clusters
          where workspace_id = $1 and title = $2`,
        [workspaceId, 'Denied create cluster'],
      ),
    ).toBe(0);
    expect(await auditCount()).toBe(0);
  });

  it('denies updateCluster without finding.manage and leaves cluster state plus audit rows unchanged', async () => {
    const cluster = await seedCluster('Original cluster title');

    await expect(
      vocClustersService.updateCluster({
        actor: deniedDeveloper(),
        clusterId: cluster.id,
        input: { title: 'Denied updated title', status: 'confirmed' },
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });

    const res = await migrateHandle.pool.query<{ title: string; status: string }>(
      'select title, status from voc_cluster.voc_clusters where id = $1',
      [cluster.id],
    );
    expect(res.rows[0]).toEqual({ title: 'Original cluster title', status: 'draft' });
    expect(await auditCount()).toBe(0);
  });

  it('denies addMember without finding.manage and persists no member or audit row', async () => {
    const cluster = await seedCluster('Denied add member cluster');
    const voc = await seedVoc('Denied add member VOC');

    await expect(
      vocClustersService.addMember({
        actor: deniedDeveloper(),
        clusterId: cluster.id,
        input: { voc_id: voc.id },
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });

    expect(
      await tableCount(
        `select count(*)::int as n
           from voc_cluster.voc_cluster_members
          where cluster_id = $1 and voc_id = $2`,
        [cluster.id, voc.id],
      ),
    ).toBe(0);
    expect(await auditCount()).toBe(0);
  });

  it('denies removeMember without finding.manage and leaves the member plus audit rows unchanged', async () => {
    const cluster = await seedCluster('Denied remove member cluster');
    const voc = await seedVoc('Denied remove member VOC');
    await insertVocClusterMemberRow(migrateHandle, {
      clusterId: cluster.id,
      vocId: voc.id,
      addedBy: adminActorId,
    });

    await expect(
      vocClustersService.removeMember({
        actor: deniedDeveloper(),
        clusterId: cluster.id,
        vocId: voc.id,
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });

    expect(
      await tableCount(
        `select count(*)::int as n
           from voc_cluster.voc_cluster_members
          where cluster_id = $1 and voc_id = $2`,
        [cluster.id, voc.id],
      ),
    ).toBe(1);
    expect(await auditCount()).toBe(0);
  });

  it('denies createFindingFromCluster without finding.manage and persists no finding, entity link, or audit row', async () => {
    const cluster = await seedCluster('Denied create finding cluster');

    await expect(
      vocClustersService.createFindingFromCluster({
        actor: targetOnlyManager(),
        clusterId: cluster.id,
        input: {
          title: 'Denied cluster finding',
          summary: 'Should not persist',
          severity: 'medium',
          primary_managed_system_id: targetManagedSystemId,
        },
        idempotencyKey: randomUUID(),
        requestHash: 'denied-create-finding-from-cluster',
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });

    expect(
      await tableCount(
        `select count(*)::int as n
           from finding.findings
          where workspace_id = $1 and source_type = 'voc_cluster' and source_id = $2`,
        [workspaceId, cluster.id],
      ),
    ).toBe(0);
    expect(
      await tableCount(
        `select count(*)::int as n
           from core.entity_links
          where workspace_id = $1 and source_type = 'voc_cluster' and source_id = $2`,
        [workspaceId, cluster.id],
      ),
    ).toBe(0);
    expect(await auditCount()).toBe(0);
  });

  it('denies listClusters to a non-developer reader before any audit or state change', async () => {
    await seedCluster('Read denied cluster');

    await expect(
      vocClustersService.listClusters({ actor: plainUser(), managedSystemId }),
    ).rejects.toMatchObject({ code: 'permission.denied' });

    expect(await auditCount()).toBe(0);
  });

  it('records voc_cluster_created audit row for an authorized createCluster', async () => {
    const result = await vocClustersService.createCluster({
      actor: manager(),
      input: {
        title: 'Audited created cluster',
        summary: 'Created cluster summary',
        primary_managed_system_id: managedSystemId,
      },
    });

    expect(result.status).toBe(201);
    const rows = await auditRows(['voc_cluster_created']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspace_id: workspaceId,
      actor_id: managerActorId,
      event_type: 'voc_cluster_created',
      subject_type: 'voc_cluster',
      subject_id: result.body.id,
    });
    expect(rows[0]?.detail).toMatchObject({
      voc_cluster_id: result.body.id,
      primary_managed_system_id: managedSystemId,
      title: 'Audited created cluster',
      summary_present: true,
      status: 'draft',
    });
  });

  it('records voc_cluster_updated audit row for an authorized updateCluster', async () => {
    const cluster = await seedCluster('Audited update cluster');

    const result = await vocClustersService.updateCluster({
      actor: manager(),
      clusterId: cluster.id,
      input: {
        title: 'Audited updated cluster',
        summary: 'Updated cluster summary',
        status: 'confirmed',
      },
    });

    expect(result.status).toBe(200);
    const rows = await auditRows(['voc_cluster_updated']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspace_id: workspaceId,
      actor_id: managerActorId,
      event_type: 'voc_cluster_updated',
      subject_type: 'voc_cluster',
      subject_id: cluster.id,
    });
    expect(rows[0]?.detail).toMatchObject({
      voc_cluster_id: cluster.id,
      primary_managed_system_id: managedSystemId,
      changes: {
        title: { from: 'Audited update cluster', to: 'Audited updated cluster' },
        summary: { from: null, to: 'Updated cluster summary' },
        status: { from: 'draft', to: 'confirmed' },
      },
    });
  });

  it('records voc_cluster_member_added audit row for an authorized addMember', async () => {
    const cluster = await seedCluster('Audited add member cluster');
    const voc = await seedVoc('Audited add member VOC');

    const result = await vocClustersService.addMember({
      actor: manager(),
      clusterId: cluster.id,
      input: { voc_id: voc.id },
    });

    expect(result.status).toBe(201);
    const rows = await auditRows(['voc_cluster_member_added']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspace_id: workspaceId,
      actor_id: managerActorId,
      event_type: 'voc_cluster_member_added',
      subject_type: 'voc_cluster',
      subject_id: cluster.id,
    });
    expect(rows[0]?.detail).toMatchObject({
      voc_cluster_id: cluster.id,
      voc_id: voc.id,
      primary_managed_system_id: managedSystemId,
    });
  });

  it('records voc_cluster_member_removed audit row for an authorized removeMember', async () => {
    const cluster = await seedCluster('Audited remove member cluster');
    const voc = await seedVoc('Audited remove member VOC');
    await insertVocClusterMemberRow(migrateHandle, {
      clusterId: cluster.id,
      vocId: voc.id,
      addedBy: adminActorId,
    });

    const result = await vocClustersService.removeMember({
      actor: manager(),
      clusterId: cluster.id,
      vocId: voc.id,
    });

    expect(result.status).toBe(204);
    const rows = await auditRows(['voc_cluster_member_removed']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspace_id: workspaceId,
      actor_id: managerActorId,
      event_type: 'voc_cluster_member_removed',
      subject_type: 'voc_cluster',
      subject_id: cluster.id,
    });
    expect(rows[0]?.detail).toMatchObject({
      voc_cluster_id: cluster.id,
      voc_id: voc.id,
      primary_managed_system_id: managedSystemId,
    });
  });

  it('records finding_created_from_voc_cluster and entity_link.created audit rows for an authorized createFindingFromCluster', async () => {
    const cluster = await seedCluster('Audited create finding cluster');

    const result = await vocClustersService.createFindingFromCluster({
      actor: manager(),
      clusterId: cluster.id,
      input: {
        title: 'Audited cluster finding',
        summary: 'Finding created from audited cluster',
        severity: 'high',
      },
      idempotencyKey: randomUUID(),
      requestHash: 'audited-create-finding-from-cluster',
    });

    expect(result.status).toBe(201);
    const findingId = result.body.id;
    const rows = await auditRows(['finding_created_from_voc_cluster', 'entity_link.created']);
    expect(rows).toHaveLength(2);

    const findingAudit = rows.find((row) => row.event_type === 'finding_created_from_voc_cluster');
    expect(findingAudit).toMatchObject({
      workspace_id: workspaceId,
      actor_id: managerActorId,
      event_type: 'finding_created_from_voc_cluster',
      subject_type: 'finding',
      subject_id: findingId,
    });
    expect(findingAudit?.detail).toMatchObject({
      finding_id: findingId,
      source_voc_cluster_id: cluster.id,
      primary_managed_system_id: managedSystemId,
      source_type: 'voc_cluster',
    });

    const linkAudit = rows.find((row) => row.event_type === 'entity_link.created');
    expect(linkAudit).toMatchObject({
      workspace_id: workspaceId,
      actor_id: managerActorId,
      event_type: 'entity_link.created',
      subject_type: 'entity_link',
    });
    expect(linkAudit?.detail).toMatchObject({
      source: { type: 'voc_cluster', id: cluster.id },
      target: { type: 'finding', id: findingId },
      relation_type: 'created_finding',
      visibility: 'internal_only',
    });
    expect(linkAudit?.subject_id).toBe(linkAudit?.detail.link_id);
  });
});
