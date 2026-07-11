import {
  type AddVocClusterMemberRequest,
  type CreateFindingFromVocClusterRequest,
  type CreateVocClusterRequest,
  type ListVocClustersResponse,
  type UpdateVocClusterRequest,
  type VocClusterDto,
  type VocClusterMemberDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { insertActiveEntityLink } from '../entity-links/repo.js';
import { insertFinding } from '../findings/repo.js';
import type { CheckService } from '../permissions/check-service.js';
import { lockAnalyticsArea, lockManagedSystem, selectVocForUpdate } from '../voc/repo.js';
import {
  type VocClusterMemberRow,
  type VocClusterRow,
  deleteVocClusterMember,
  findVocClusterById,
  insertVocCluster,
  insertVocClusterMember,
  listVocClusterMembers,
  listVocClustersByWorkspace,
  lockVocClusterById,
  updateVocCluster,
} from './repo.js';

export interface VocClustersActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface VocClustersServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
}

function memberToDto(row: VocClusterMemberRow): VocClusterMemberDto {
  return {
    voc_id: row.voc_id,
    added_by: row.added_by,
    added_at: row.added_at.toISOString(),
  };
}

function clusterToDto(row: VocClusterRow, members?: VocClusterMemberRow[]): VocClusterDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    ...(members !== undefined ? { members: members.map(memberToDto) } : {}),
  };
}

async function canReadCluster(
  deps: Pick<VocClustersServiceDeps, 'checkService'>,
  actor: VocClustersActor,
  managedSystemId: string,
): Promise<boolean> {
  if (actor.role_level === 'admin') return true;
  if (actor.role_level !== 'developer') return false;
  const decision = await deps.checkService.checkCapability(actor, 'finding.read', {
    workspace_id: actor.workspace_id,
    managed_system_id: managedSystemId,
  });
  return decision.allow;
}

async function canManageCluster(
  deps: Pick<VocClustersServiceDeps, 'checkService'>,
  actor: VocClustersActor,
  managedSystemId: string,
  options?: Parameters<VocClustersServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (actor.role_level === 'admin') return true;
  if (actor.role_level !== 'developer') return false;
  const decision = await deps.checkService.checkCapability(
    actor,
    'finding.manage',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
  return decision.allow;
}

async function canReadSourceVoc(
  deps: Pick<VocClustersServiceDeps, 'checkService'>,
  actor: VocClustersActor,
  managedSystemId: string,
  reporterId: string,
  options?: Parameters<VocClustersServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (actor.role_level === 'admin') return true;
  if (actor.actor_id === reporterId) return true;
  const decision = await deps.checkService.checkCapability(
    actor,
    'voc.read',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
  return decision.allow;
}

async function assertTargetAnalyticsArea(args: {
  tx: Tx;
  workspaceId: string;
  analyticsAreaId: string | undefined;
  managedSystemId: string;
}): Promise<void> {
  if (!args.analyticsAreaId) return;
  const aa = await lockAnalyticsArea(args.tx, args.workspaceId, args.analyticsAreaId);
  if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
  if (aa.managed_system_id !== args.managedSystemId) {
    throw new HttpError(
      'validation.failed',
      'analytics_area does not belong to managed_system',
      { fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }] },
    );
  }
  if (aa.archived_at !== null) {
    throw new HttpError('conflict.parent_archived', 'analytics area archived', {
      fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
    });
  }
}

export function createVocClustersService(deps: VocClustersServiceDeps) {
  async function createCluster(args: {
    actor: VocClustersActor;
    input: CreateVocClusterRequest;
  }): Promise<{ status: number; body: VocClusterDto }> {
    return deps.db.transaction(async (tx) => {
      const ms = await lockManagedSystem(
        tx,
        args.actor.workspace_id,
        args.input.primary_managed_system_id,
      );
      if (!ms) throw new HttpError('not_found.record', 'managed system not found');
      if (ms.archived_at !== null) {
        throw new HttpError('conflict.parent_archived', 'managed system archived', {
          fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
        });
      }

      const canManage = await canManageCluster(deps, args.actor, ms.id, { tx });
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      const row = await insertVocCluster(tx, {
        workspaceId: args.actor.workspace_id,
        title: args.input.title,
        summary: args.input.summary ?? null,
        primaryManagedSystemId: ms.id,
        createdBy: args.actor.actor_id,
      });
      return { status: 201, body: clusterToDto(row) };
    });
  }

  async function listClusters(args: {
    actor: VocClustersActor;
    managedSystemId?: string;
  }): Promise<ListVocClustersResponse> {
    if (args.actor.role_level !== 'admin' && args.actor.role_level !== 'developer') {
      throw new HttpError('permission.denied', 'finding.read capability required');
    }
    const rows = await listVocClustersByWorkspace(deps.db, {
      workspaceId: args.actor.workspace_id,
      ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
    });
    const items: VocClusterDto[] = [];
    for (const row of rows) {
      const readable = await canReadCluster(deps, args.actor, row.primary_managed_system_id);
      if (!readable) continue;
      items.push(clusterToDto(row));
    }
    return { items };
  }

  async function getCluster(args: {
    actor: VocClustersActor;
    clusterId: string;
  }): Promise<VocClusterDto> {
    const row = await findVocClusterById(deps.db, {
      workspaceId: args.actor.workspace_id,
      clusterId: args.clusterId,
    });
    if (!row) throw new HttpError('not_found.record', 'voc cluster not found');
    const readable = await canReadCluster(deps, args.actor, row.primary_managed_system_id);
    if (!readable) throw new HttpError('not_found.record', 'voc cluster not found');
    const members = await listVocClusterMembers(deps.db, { clusterId: row.id });
    return clusterToDto(row, members);
  }

  async function updateCluster(args: {
    actor: VocClustersActor;
    clusterId: string;
    input: UpdateVocClusterRequest;
  }): Promise<{ status: number; body: VocClusterDto }> {
    return deps.db.transaction(async (tx) => {
      const cluster = await lockVocClusterById(tx, {
        workspaceId: args.actor.workspace_id,
        clusterId: args.clusterId,
      });
      if (!cluster) throw new HttpError('not_found.record', 'voc cluster not found');

      const canManage = await canManageCluster(
        deps,
        args.actor,
        cluster.primary_managed_system_id,
        { tx },
      );
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      const updated = await updateVocCluster(tx, {
        workspaceId: args.actor.workspace_id,
        clusterId: cluster.id,
        ...(args.input.title !== undefined ? { title: args.input.title } : {}),
        ...(args.input.summary !== undefined ? { summary: args.input.summary } : {}),
        ...(args.input.status !== undefined ? { status: args.input.status } : {}),
      });
      return { status: 200, body: clusterToDto(updated) };
    });
  }

  async function addMember(args: {
    actor: VocClustersActor;
    clusterId: string;
    input: AddVocClusterMemberRequest;
  }): Promise<{ status: number; body: VocClusterMemberDto }> {
    return deps.db.transaction(async (tx) => {
      const cluster = await lockVocClusterById(tx, {
        workspaceId: args.actor.workspace_id,
        clusterId: args.clusterId,
      });
      if (!cluster) throw new HttpError('not_found.record', 'voc cluster not found');

      const canManage = await canManageCluster(
        deps,
        args.actor,
        cluster.primary_managed_system_id,
        { tx },
      );
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      const voc = await selectVocForUpdate(tx, args.actor.workspace_id, args.input.voc_id);
      if (!voc || voc.archivedAt !== null) throw new HttpError('not_found.record', 'voc not found');
      const sourceReadable = await canReadSourceVoc(
        deps,
        args.actor,
        voc.primaryManagedSystemId,
        voc.reporterId,
        { tx },
      );
      if (!sourceReadable) throw new HttpError('not_found.record', 'voc not found');
      if (voc.primaryManagedSystemId !== cluster.primary_managed_system_id) {
        throw new HttpError('validation.failed', 'voc is outside cluster managed system', {
          fields: [{ path: ['voc_id'], code: 'out_of_scope' }],
        });
      }

      const result = await insertVocClusterMember(tx, {
        clusterId: cluster.id,
        vocId: voc.id,
        addedBy: args.actor.actor_id,
      });

      if (result.inserted) {
        await deps.auditService.record(tx, {
          workspace_id: args.actor.workspace_id,
          actor_id: args.actor.actor_id,
          event_type: 'voc_cluster_member_added',
          subject_type: 'voc_cluster',
          subject_id: cluster.id,
          summary: 'VOC added to cluster',
          detail: {
            voc_cluster_id: cluster.id,
            voc_id: voc.id,
            primary_managed_system_id: cluster.primary_managed_system_id,
          },
        });
      }

      return { status: result.inserted ? 201 : 200, body: memberToDto(result.row) };
    });
  }

  async function removeMember(args: {
    actor: VocClustersActor;
    clusterId: string;
    vocId: string;
  }): Promise<{ status: 204; body: null }> {
    return deps.db.transaction(async (tx) => {
      const cluster = await lockVocClusterById(tx, {
        workspaceId: args.actor.workspace_id,
        clusterId: args.clusterId,
      });
      if (!cluster) throw new HttpError('not_found.record', 'voc cluster not found');

      const canManage = await canManageCluster(
        deps,
        args.actor,
        cluster.primary_managed_system_id,
        { tx },
      );
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      const deleted = await deleteVocClusterMember(tx, {
        clusterId: cluster.id,
        vocId: args.vocId,
      });
      if (!deleted) throw new HttpError('not_found.record', 'voc cluster member not found');

      await deps.auditService.record(tx, {
        workspace_id: args.actor.workspace_id,
        actor_id: args.actor.actor_id,
        event_type: 'voc_cluster_member_removed',
        subject_type: 'voc_cluster',
        subject_id: cluster.id,
        summary: 'VOC removed from cluster',
        detail: {
          voc_cluster_id: cluster.id,
          voc_id: args.vocId,
          primary_managed_system_id: cluster.primary_managed_system_id,
        },
      });

      return { status: 204, body: null };
    });
  }

  async function createFindingFromCluster(args: {
    actor: VocClustersActor;
    clusterId: string;
    input: CreateFindingFromVocClusterRequest;
    idempotencyKey: string;
    requestHash: string;
  }) {
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const cluster = await lockVocClusterById(tx, {
            workspaceId: args.actor.workspace_id,
            clusterId: args.clusterId,
          });
          if (!cluster) throw new HttpError('not_found.record', 'voc cluster not found');

          const canManageClusterScope = await canManageCluster(
            deps,
            args.actor,
            cluster.primary_managed_system_id,
            { tx },
          );
          if (!canManageClusterScope) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          const targetManagedSystemId =
            args.input.primary_managed_system_id ?? cluster.primary_managed_system_id;
          const targetMs = await lockManagedSystem(
            tx,
            args.actor.workspace_id,
            targetManagedSystemId,
          );
          if (!targetMs) throw new HttpError('not_found.record', 'managed system not found');
          if (targetMs.archived_at !== null) {
            throw new HttpError('conflict.parent_archived', 'managed system archived', {
              fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
            });
          }

          const canManageFindingScope = await canManageCluster(
            deps,
            args.actor,
            targetManagedSystemId,
            { tx },
          );
          if (!canManageFindingScope) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          await assertTargetAnalyticsArea({
            tx,
            workspaceId: args.actor.workspace_id,
            analyticsAreaId: args.input.analytics_area_id,
            managedSystemId: targetManagedSystemId,
          });

          const finding = await insertFinding(tx, {
            workspaceId: args.actor.workspace_id,
            primaryManagedSystemId: targetManagedSystemId,
            title: args.input.title,
            summary: args.input.summary,
            sourceType: 'voc_cluster',
            sourceId: cluster.id,
            severity: args.input.severity,
            confidence: args.input.confidence ?? null,
            analyticsAreaId: args.input.analytics_area_id ?? null,
            createdBy: args.actor.actor_id,
          });

          const createdFindingTuple = registeredEntityLinkPairSchema.parse({
            source_type: 'voc_cluster',
            target_type: 'finding',
            relation_type: 'created_finding',
          });

          const link = await insertActiveEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            sourceType: createdFindingTuple.source_type,
            sourceId: cluster.id,
            targetType: createdFindingTuple.target_type,
            targetId: finding.id,
            relationType: createdFindingTuple.relation_type,
            managedSystemId: cluster.primary_managed_system_id,
            createdBy: args.actor.actor_id,
            visibility: 'internal_only',
          });

          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'finding_created_from_voc_cluster',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding created from VOC Cluster',
            detail: {
              finding_id: finding.id,
              source_voc_cluster_id: cluster.id,
              primary_managed_system_id: targetManagedSystemId,
              source_type: 'voc_cluster',
            },
          });

          if (link.inserted) {
            await deps.auditService.record(tx, {
              workspace_id: args.actor.workspace_id,
              actor_id: args.actor.actor_id,
              event_type: 'entity_link.created',
              subject_type: 'entity_link',
              subject_id: link.row.id,
              summary: 'Entity link created',
              detail: {
                link_id: link.row.id,
                source: { type: 'voc_cluster', id: cluster.id },
                target: { type: 'finding', id: finding.id },
                relation_type: 'created_finding',
                visibility: 'internal_only',
              },
            });
          }

          return {
            status: 201,
            body: {
              id: finding.id,
              workspace_id: finding.workspace_id,
              primary_managed_system_id: finding.primary_managed_system_id,
              title: finding.title,
              summary: finding.summary,
              source_type: finding.source_type,
              source_id: finding.source_id,
              evidence_count: finding.evidence_count,
              severity: finding.severity,
              confidence: finding.confidence,
              status: finding.status,
              analytics_area_id: finding.analytics_area_id,
              linked_task_id: finding.linked_task_id,
              linked_milestone_id: finding.linked_milestone_id,
              created_by: finding.created_by,
              created_at: finding.created_at.toISOString(),
              updated_at: finding.updated_at.toISOString(),
              source: {
                type: 'voc_cluster' as const,
                id: cluster.id,
                relation_type: 'created_finding' as const,
                link_id: link.row.id,
              },
            },
          };
        },
      );
    });
  }

  return {
    createCluster,
    listClusters,
    getCluster,
    updateCluster,
    addMember,
    removeMember,
    createFindingFromCluster,
  };
}

export type VocClustersService = ReturnType<typeof createVocClustersService>;
