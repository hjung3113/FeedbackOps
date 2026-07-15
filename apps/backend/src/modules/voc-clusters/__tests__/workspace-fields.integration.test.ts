import { randomUUID } from 'node:crypto';

import { createVocClusterRequestSchema, updateVocClusterRequestSchema } from '@fops/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { type VocClustersService, createVocClustersService } from '../service.js';
import { insertActorRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

describe.skipIf(!runIntegration)('VOC cluster workspace fields', () => {
  let appDb: DbHandle;
  let migrateDb: DbHandle;
  let service: VocClustersService;
  const workspaceId = randomUUID();
  let managedSystemId: string;
  let adminId: string;
  let ownerId: string;

  beforeAll(async () => {
    appDb = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    service = createVocClustersService({
      db: appDb.db,
      auditService: createAuditService(),
      checkService: createCheckService({ db: appDb.db }),
      idempotencyService: createIdempotencyService(),
    });
    await migrateDb.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'VOC cluster workspace fields test',
    ]);
    adminId = (
      await insertActorRow(migrateDb, {
        workspaceId,
        externalId: `cluster-fields-admin-${workspaceId}`,
        roleLevel: 'admin',
      })
    ).id;
    ownerId = (
      await insertActorRow(migrateDb, {
        workspaceId,
        externalId: `cluster-fields-owner-${workspaceId}`,
        roleLevel: 'developer',
      })
    ).id;
    const ms = await migrateDb.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3) returning id`,
      [workspaceId, `cluster-fields-${workspaceId}`, 'Cluster fields MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? '';
  });

  beforeEach(async () => {
    await migrateDb.pool.query('delete from core.audit_log where workspace_id = $1', [workspaceId]);
    await migrateDb.pool.query('delete from voc_cluster.voc_clusters where workspace_id = $1', [
      workspaceId,
    ]);
  });

  afterAll(async () => {
    await migrateDb.pool.query('delete from core.audit_log where workspace_id = $1', [workspaceId]);
    await migrateDb.pool.query('delete from voc_cluster.voc_clusters where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateDb.pool.query('delete from core.display_counters where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateDb.pool.query('delete from core.managed_systems where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateDb.pool.query('delete from core.actors where workspace_id = $1', [workspaceId]);
    await migrateDb.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    await appDb.close();
    await migrateDb.close();
  });

  const actor = () => ({
    actor_id: adminId,
    workspace_id: workspaceId,
    role_level: 'admin' as const,
  });

  async function create(title: string, extra: Record<string, unknown> = {}) {
    return service.createCluster({
      actor: actor(),
      input: createVocClusterRequestSchema.parse({
        title,
        primary_managed_system_id: managedSystemId,
        ...extra,
      }),
    });
  }

  it('creates all workspace fields and returns them on detail', async () => {
    const result = await create('All workspace fields', {
      summary: 'Summary',
      severity: 'critical',
      confidence: 'high',
      rationale: 'Repeated impact across accounts',
      owner_user_id: ownerId,
    });
    const detail = await service.getCluster({ actor: actor(), clusterId: result.body.id });

    expect(detail).toMatchObject({
      severity: 'critical',
      confidence: 'high',
      rationale: 'Repeated impact across accounts',
      owner_user_id: ownerId,
      confirmed_by: null,
      confirmed_at: null,
    });
  });

  it('creates no fabricated defaults and exposes nullable fields in list and detail', async () => {
    const result = await create('No workspace fields');
    const list = await service.listClusters({ actor: actor(), managedSystemId });
    const detail = await service.getCluster({ actor: actor(), clusterId: result.body.id });
    const nullShape = {
      severity: null,
      confidence: null,
      rationale: null,
      owner_user_id: null,
      confirmed_by: null,
      confirmed_at: null,
    };

    expect(list.items[0]).toMatchObject(nullShape);
    expect(detail).toMatchObject(nullShape);
  });

  it('updates writable workspace fields and records their audit changes', async () => {
    const cluster = await create('Update workspace fields');
    const updated = await service.updateCluster({
      actor: actor(),
      clusterId: cluster.body.id,
      input: {
        severity: 'high',
        confidence: 'medium',
        rationale: 'Corroborated by three VOCs',
        owner_user_id: ownerId,
      },
    });
    const audit = await migrateDb.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
       where workspace_id = $1 and event_type = 'voc_cluster_updated'`,
      [workspaceId],
    );

    expect(updated.body).toMatchObject({
      severity: 'high',
      confidence: 'medium',
      rationale: 'Corroborated by three VOCs',
      owner_user_id: ownerId,
    });
    expect(audit.rows[0]?.detail).toMatchObject({
      changes: {
        severity: { from: null, to: 'high' },
        confidence: { from: null, to: 'medium' },
        rationale: { from: null, to: 'Corroborated by three VOCs' },
        owner_user_id: { from: null, to: ownerId },
      },
    });
  });

  it('rejects direct writes to confirmation provenance', () => {
    for (const field of ['confirmed_by', 'confirmed_at'] as const) {
      expect(
        updateVocClusterRequestSchema.safeParse({
          [field]: field === 'confirmed_by' ? ownerId : new Date().toISOString(),
        }).success,
      ).toBe(false);
    }
  });

  it('atomically records actor and timestamp on draft confirmation and audits provenance', async () => {
    const cluster = await create('Confirm cluster');
    const updated = await service.updateCluster({
      actor: actor(),
      clusterId: cluster.body.id,
      input: { status: 'confirmed' },
    });
    const stored = await migrateDb.pool.query<{
      status: string;
      confirmed_by: string | null;
      confirmed_at: Date | null;
    }>('select status, confirmed_by, confirmed_at from voc_cluster.voc_clusters where id = $1', [
      cluster.body.id,
    ]);
    const audit = await migrateDb.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
       where subject_id = $1 and event_type = 'voc_cluster_updated'`,
      [cluster.body.id],
    );

    expect(updated.body.confirmed_by).toBe(adminId);
    expect(updated.body.confirmed_at).not.toBeNull();
    expect(stored.rows[0]).toMatchObject({ status: 'confirmed', confirmed_by: adminId });
    expect(stored.rows[0]?.confirmed_at).not.toBeNull();
    expect(audit.rows[0]?.detail).toMatchObject({
      changes: {
        status: { from: 'draft', to: 'confirmed' },
        confirmed_by: { from: null, to: adminId },
        confirmed_at: { from: null, to: updated.body.confirmed_at },
      },
    });
  });

  it('does not overwrite provenance when confirming an already confirmed cluster', async () => {
    const cluster = await create('Reconfirm cluster');
    const first = await service.updateCluster({
      actor: actor(),
      clusterId: cluster.body.id,
      input: { status: 'confirmed' },
    });
    const second = await service.updateCluster({
      actor: { ...actor(), actor_id: ownerId, role_level: 'admin' },
      clusterId: cluster.body.id,
      input: { status: 'confirmed' },
    });

    expect(second.body.confirmed_by).toBe(adminId);
    expect(second.body.confirmed_at).toBe(first.body.confirmed_at);
  });

  it.each([
    ['severity', 'urgent', 'voc_clusters_severity_check'],
    ['confidence', 'certain', 'voc_clusters_confidence_check'],
  ] as const)('rejects invalid %s at DTO and DB CHECK levels', async (field, value, constraint) => {
    expect(
      createVocClusterRequestSchema.safeParse({
        title: 'Invalid enum DTO',
        primary_managed_system_id: managedSystemId,
        [field]: value,
      }).success,
    ).toBe(false);

    await expect(
      migrateDb.pool.query(
        `insert into voc_cluster.voc_clusters
          (workspace_id, display_id, title, primary_managed_system_id, created_by, ${field})
         values ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, `CL-${randomUUID()}`, 'Invalid enum DB', managedSystemId, adminId, value],
      ),
    ).rejects.toMatchObject({ constraint });
  });

  it('rejects a nonexistent owner_user_id', async () => {
    await expect(create('Bad owner', { owner_user_id: randomUUID() })).rejects.toMatchObject({
      code: 'validation.failed',
    });
  });

  it('reads rows created without workspace field values as NULL', async () => {
    const row = await migrateDb.pool.query<{ id: string }>(
      `insert into voc_cluster.voc_clusters
        (workspace_id, display_id, title, summary, status, primary_managed_system_id, created_by)
       values ($1, core.next_display_id($1::uuid, 'cluster'), $2, null, 'draft', $3, $4)
       returning id`,
      [workspaceId, 'Pre-migration-shaped row', managedSystemId, adminId],
    );
    const detail = await service.getCluster({ actor: actor(), clusterId: row.rows[0]?.id ?? '' });

    expect(detail).toMatchObject({
      severity: null,
      confidence: null,
      rationale: null,
      owner_user_id: null,
      confirmed_by: null,
      confirmed_at: null,
    });
  });
});
