import {
  type AddVocClusterMemberRequest,
  type ApplyVocClusterPublicUpdateRequest,
  type CreateFindingFromVocClusterRequest,
  type LinkExistingFindingToVocClusterRequest,
  type UnlinkExistingFindingFromVocClusterRequest,
  type CreateVocClusterRequest,
  type ListSameManagedSystemCandidatePeersResponse,
  type ListVocClustersResponse,
  type UpdateVocClusterRequest,
  type VocClusterDto,
  type VocClusterMemberDto,
  type VocClusterPublicUpdateCandidateRequest,
  type VocClusterPublicUpdateOutcome,
  registeredEntityLinkPairSchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import {
  detachEntityLink,
  insertActiveEntityLink,
  selectActiveEntityLink,
} from '../entity-links/repo.js';
import { insertFinding } from '../findings/repo.js';
import { lockFindingById } from '../findings/repo.js';
import type { CheckService } from '../permissions/check-service.js';
import { actorScopeForCapability } from '../permissions/scope-service.js';
import type { ConversationService } from '../voc/conversation-service.js';
import { type Scope, actorReadScope } from '../voc/repo-read.js';
import { lockAnalyticsArea, lockManagedSystem, selectVocForUpdate } from '../voc/repo.js';
import {
  type CreatedFindingForClusterRow,
  type SameManagedSystemCandidatePeerRow,
  type VocClusterMemberRow,
  type VocClusterRow,
  deleteVocClusterMember,
  findVocClusterById,
  insertVocCluster,
  insertVocClusterMember,
  isAssignableClusterOwner,
  listCreatedFindingsForClusters,
  listSameManagedSystemCandidatePeers,
  listVocClusterMembers,
  listVocClusterMembersForClusters,
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
  postPublicUpdate?: ConversationService['postPublicUpdate'];
}

function memberToDto(row: VocClusterMemberRow): VocClusterMemberDto {
  return {
    voc_id: row.voc_id,
    added_by: row.added_by,
    added_at: row.added_at.toISOString(),
    ...(row.display_id !== undefined ? { display_id: row.display_id } : {}),
    ...(row.title !== undefined ? { title: row.title } : {}),
    ...(row.severity !== undefined ? { severity: row.severity } : {}),
    ...(row.reporter_facing_status !== undefined
      ? { reporter_facing_status: row.reporter_facing_status }
      : {}),
  };
}

function linkedFindingToDto(
  row: CreatedFindingForClusterRow,
): NonNullable<VocClusterDto['linked_findings']>[number] {
  return {
    id: row.id,
    display_id: row.display_id,
    status: row.status,
  };
}

function clusterToDto(
  row: VocClusterRow,
  members?: VocClusterMemberRow[],
  linkedFindings?: CreatedFindingForClusterRow[],
): VocClusterDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    confidence: row.confidence,
    rationale: row.rationale,
    owner_user_id: row.owner_user_id,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    created_by: row.created_by,
    confirmed_by: row.confirmed_by,
    confirmed_at: row.confirmed_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    member_count: row.member_count,
    ...(members !== undefined ? { members: members.map(memberToDto) } : {}),
    ...(linkedFindings !== undefined
      ? { linked_findings: linkedFindings.map(linkedFindingToDto) }
      : {}),
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

function isAuthorizedMember(
  readScope: Scope,
  actorId: string,
  member: Pick<VocClusterMemberRow, 'archived_at' | 'primary_managed_system_id' | 'reporter_id'>,
  clusterManagedSystemId: string,
): boolean {
  return (
    member.archived_at === null &&
    member.primary_managed_system_id === clusterManagedSystemId &&
    member.reporter_id !== undefined &&
    (readScope.kind === 'all' ||
      readScope.managedSystemIds.includes(member.primary_managed_system_id) ||
      member.reporter_id === actorId)
  );
}

function isAuthorizedCandidatePeer(
  readScope: Scope,
  actorId: string,
  candidate: SameManagedSystemCandidatePeerRow,
  clusterManagedSystemId: string,
): boolean {
  return isAuthorizedMember(readScope, actorId, candidate, clusterManagedSystemId);
}

function authorizedMembers(
  readScope: Scope,
  actorId: string,
  members: VocClusterMemberRow[],
  clusterManagedSystemId: string,
): VocClusterMemberRow[] {
  return members.filter((member) =>
    isAuthorizedMember(readScope, actorId, member, clusterManagedSystemId),
  );
}

function isInScope(scope: Scope, managedSystemId: string): boolean {
  return scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId);
}

async function actorFindingReadScope(
  db: Db | Tx,
  actor: VocClustersActor,
): Promise<Scope> {
  return actorScopeForCapability(db, actor, 'finding.read');
}

async function authorizedMembersByCluster(
  deps: Pick<VocClustersServiceDeps, 'db'>,
  actor: VocClustersActor,
  readScope: Scope,
  clusters: VocClusterRow[],
): Promise<Map<string, VocClusterMemberRow[]>> {
  const visibleByCluster = new Map<string, VocClusterMemberRow[]>();
  for (const cluster of clusters) visibleByCluster.set(cluster.id, []);
  if (clusters.length === 0 || actor.role_level === 'admin') return visibleByCluster;

  const members = await listVocClusterMembersForClusters(deps.db, {
    clusterIds: clusters.map((cluster) => cluster.id),
  });
  const clusterManagedSystemById = new Map(
    clusters.map((cluster) => [cluster.id, cluster.primary_managed_system_id]),
  );
  for (const member of members) {
    const clusterManagedSystemId = clusterManagedSystemById.get(member.cluster_id);
    if (
      clusterManagedSystemId !== undefined &&
      isAuthorizedMember(readScope, actor.actor_id, member, clusterManagedSystemId)
    )
      visibleByCluster.get(member.cluster_id)?.push(member);
  }
  return visibleByCluster;
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
    throw new HttpError('validation.failed', 'analytics_area does not belong to managed_system', {
      fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }],
    });
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

      if (
        args.input.owner_user_id !== undefined &&
        args.input.owner_user_id !== null &&
        !(await isAssignableClusterOwner(tx, {
          workspaceId: args.actor.workspace_id,
          actorId: args.input.owner_user_id,
        }))
      ) {
        throw new HttpError('validation.failed', 'owner_user_id is not an assignable user', {
          fields: [{ path: ['owner_user_id'], code: 'invalid' }],
        });
      }

      const row = await insertVocCluster(tx, {
        workspaceId: args.actor.workspace_id,
        title: args.input.title,
        summary: args.input.summary ?? null,
        severity: args.input.severity ?? null,
        confidence: args.input.confidence ?? null,
        rationale: args.input.rationale ?? null,
        ownerUserId: args.input.owner_user_id ?? null,
        primaryManagedSystemId: ms.id,
        createdBy: args.actor.actor_id,
      });
      await deps.auditService.record(tx, {
        workspace_id: args.actor.workspace_id,
        actor_id: args.actor.actor_id,
        event_type: 'voc_cluster_created',
        subject_type: 'voc_cluster',
        subject_id: row.id,
        summary: 'VOC cluster created',
        detail: {
          voc_cluster_id: row.id,
          primary_managed_system_id: row.primary_managed_system_id,
          title: row.title,
          summary_present: row.summary !== null,
          status: row.status,
        },
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
    const findingReadScope = await actorFindingReadScope(deps.db, args.actor);
    const readableRows = rows.filter((row) =>
      isInScope(findingReadScope, row.primary_managed_system_id),
    );
    const readScope = await actorReadScope(deps.db, args.actor);
    const membersByCluster = await authorizedMembersByCluster(
      deps,
      args.actor,
      readScope,
      readableRows,
    );
    const linkedFindings = await listCreatedFindingsForClusters(deps.db, {
      workspaceId: args.actor.workspace_id,
      clusterIds: readableRows.map((row) => row.id),
      findingReadScope,
    });
    const linkedFindingsByClusterId = new Map<string, CreatedFindingForClusterRow[]>();
    for (const finding of linkedFindings) {
      const existing = linkedFindingsByClusterId.get(finding.cluster_id) ?? [];
      existing.push(finding);
      linkedFindingsByClusterId.set(finding.cluster_id, existing);
    }
    return {
      items: readableRows.map((row) =>
        clusterToDto(
          {
            ...row,
            member_count:
              args.actor.role_level === 'admin'
                ? row.member_count
                : (membersByCluster.get(row.id)?.length ?? 0),
          },
          undefined,
          linkedFindingsByClusterId.get(row.id) ?? [],
        ),
      ),
    };
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
    const readScope = await actorReadScope(deps.db, args.actor);
    const members = authorizedMembers(
      readScope,
      args.actor.actor_id,
      await listVocClusterMembers(deps.db, { clusterId: row.id }),
      row.primary_managed_system_id,
    );
    const findingReadScope = await actorFindingReadScope(deps.db, args.actor);
    const linkedFindings = await listCreatedFindingsForClusters(deps.db, {
      workspaceId: args.actor.workspace_id,
      clusterIds: [row.id],
      findingReadScope,
    });
    return clusterToDto({ ...row, member_count: members.length }, members, linkedFindings);
  }

  async function listCandidatePeers(args: {
    actor: VocClustersActor;
    clusterId: string;
  }): Promise<ListSameManagedSystemCandidatePeersResponse> {
    const cluster = await findVocClusterById(deps.db, {
      workspaceId: args.actor.workspace_id,
      clusterId: args.clusterId,
    });
    if (!cluster) throw new HttpError('not_found.record', 'voc cluster not found');
    if (!(await canReadCluster(deps, args.actor, cluster.primary_managed_system_id))) {
      throw new HttpError('not_found.record', 'voc cluster not found');
    }

    const readScope = await actorReadScope(deps.db, args.actor);
    const candidates = (
      await listSameManagedSystemCandidatePeers(deps.db, {
        workspaceId: args.actor.workspace_id,
        clusterId: cluster.id,
        primaryManagedSystemId: cluster.primary_managed_system_id,
      })
    ).filter((candidate) =>
      isAuthorizedCandidatePeer(
        readScope,
        args.actor.actor_id,
        candidate,
        cluster.primary_managed_system_id,
      ),
    );

    return {
      candidate_basis: 'same_managed_system_active_voc',
      candidates: candidates.map((candidate) => ({
        voc_id: candidate.voc_id,
        display_id: candidate.display_id,
        title: candidate.title,
        severity: candidate.severity,
        reporter_facing_status: candidate.reporter_facing_status,
      })),
    };
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

      if (
        args.input.owner_user_id !== undefined &&
        args.input.owner_user_id !== null &&
        !(await isAssignableClusterOwner(tx, {
          workspaceId: args.actor.workspace_id,
          actorId: args.input.owner_user_id,
        }))
      ) {
        throw new HttpError('validation.failed', 'owner_user_id is not an assignable user', {
          fields: [{ path: ['owner_user_id'], code: 'invalid' }],
        });
      }

      const confirmsNow = cluster.status === 'draft' && args.input.status === 'confirmed';

      const updated = await updateVocCluster(tx, {
        workspaceId: args.actor.workspace_id,
        clusterId: cluster.id,
        ...(args.input.title !== undefined ? { title: args.input.title } : {}),
        ...(args.input.summary !== undefined ? { summary: args.input.summary } : {}),
        ...(args.input.severity !== undefined ? { severity: args.input.severity } : {}),
        ...(args.input.confidence !== undefined ? { confidence: args.input.confidence } : {}),
        ...(args.input.rationale !== undefined ? { rationale: args.input.rationale } : {}),
        ...(args.input.owner_user_id !== undefined
          ? { ownerUserId: args.input.owner_user_id }
          : {}),
        ...(args.input.status !== undefined ? { status: args.input.status } : {}),
        ...(confirmsNow ? { confirmedBy: args.actor.actor_id } : {}),
      });
      const changes: Partial<{
        title: { from: string; to: string };
        summary: { from: string | null; to: string | null };
        severity: { from: VocClusterRow['severity']; to: VocClusterRow['severity'] };
        confidence: { from: VocClusterRow['confidence']; to: VocClusterRow['confidence'] };
        rationale: { from: string | null; to: string | null };
        owner_user_id: { from: string | null; to: string | null };
        status: { from: VocClusterRow['status']; to: VocClusterRow['status'] };
        confirmed_by: { from: string | null; to: string | null };
        confirmed_at: { from: string | null; to: string | null };
      }> = {};
      if (cluster.title !== updated.title) {
        changes.title = { from: cluster.title, to: updated.title };
      }
      if (cluster.summary !== updated.summary) {
        changes.summary = { from: cluster.summary, to: updated.summary };
      }
      if (cluster.severity !== updated.severity) {
        changes.severity = { from: cluster.severity, to: updated.severity };
      }
      if (cluster.confidence !== updated.confidence) {
        changes.confidence = { from: cluster.confidence, to: updated.confidence };
      }
      if (cluster.rationale !== updated.rationale) {
        changes.rationale = { from: cluster.rationale, to: updated.rationale };
      }
      if (cluster.owner_user_id !== updated.owner_user_id) {
        changes.owner_user_id = { from: cluster.owner_user_id, to: updated.owner_user_id };
      }
      if (cluster.status !== updated.status) {
        changes.status = { from: cluster.status, to: updated.status };
      }
      if (cluster.confirmed_by !== updated.confirmed_by) {
        changes.confirmed_by = { from: cluster.confirmed_by, to: updated.confirmed_by };
      }
      if (cluster.confirmed_at?.getTime() !== updated.confirmed_at?.getTime()) {
        changes.confirmed_at = {
          from: cluster.confirmed_at?.toISOString() ?? null,
          to: updated.confirmed_at?.toISOString() ?? null,
        };
      }
      if (Object.keys(changes).length > 0) {
        await deps.auditService.record(tx, {
          workspace_id: args.actor.workspace_id,
          actor_id: args.actor.actor_id,
          event_type: 'voc_cluster_updated',
          subject_type: 'voc_cluster',
          subject_id: cluster.id,
          summary: 'VOC cluster updated',
          detail: {
            voc_cluster_id: cluster.id,
            primary_managed_system_id: updated.primary_managed_system_id,
            changes,
          },
        });
      }
      const readScope = await actorReadScope(tx, args.actor);
      const visibleMembers = authorizedMembers(
        readScope,
        args.actor.actor_id,
        await listVocClusterMembers(tx, { clusterId: cluster.id }),
        cluster.primary_managed_system_id,
      );
      return {
        status: 200,
        body: clusterToDto({ ...updated, member_count: visibleMembers.length }),
      };
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
      const readScope = await actorReadScope(tx, args.actor);
      const sourceReadable = isAuthorizedMember(
        readScope,
        args.actor.actor_id,
        {
          primary_managed_system_id: voc.primaryManagedSystemId,
          reporter_id: voc.reporterId,
          archived_at: voc.archivedAt,
        },
        voc.primaryManagedSystemId,
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

      const membershipAndVoc = (await listVocClusterMembers(tx, { clusterId: cluster.id })).find(
        (member) => member.voc_id === args.vocId,
      );
      const readScope = await actorReadScope(tx, args.actor);
      if (
        !membershipAndVoc ||
        !isAuthorizedMember(
          readScope,
          args.actor.actor_id,
          membershipAndVoc,
          cluster.primary_managed_system_id,
        )
      ) {
        throw new HttpError('not_found.record', 'voc cluster member not found');
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

  async function createPublicUpdateCandidate(args: {
    actor: VocClustersActor;
    clusterId: string;
    input: VocClusterPublicUpdateCandidateRequest;
  }) {
    const cluster = await findVocClusterById(deps.db, {
      workspaceId: args.actor.workspace_id,
      clusterId: args.clusterId,
    });
    if (!cluster) throw new HttpError('not_found.record', 'voc cluster not found');
    if (!(await canManageCluster(deps, args.actor, cluster.primary_managed_system_id))) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }
    return { candidate: args.input };
  }

  async function applyPublicUpdateCandidate(args: {
    actor: VocClustersActor;
    clusterId: string;
    input: ApplyVocClusterPublicUpdateRequest;
  }): Promise<{ outcomes: VocClusterPublicUpdateOutcome[] }> {
    const postPublicUpdate = deps.postPublicUpdate;
    if (!postPublicUpdate) throw new Error('postPublicUpdate dependency is not configured');
    const cluster = await findVocClusterById(deps.db, {
      workspaceId: args.actor.workspace_id,
      clusterId: args.clusterId,
    });
    if (!cluster) throw new HttpError('not_found.record', 'voc cluster not found');
    if (!(await canManageCluster(deps, args.actor, cluster.primary_managed_system_id))) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }
    const readScope = await actorReadScope(deps.db, args.actor);
    const members = authorizedMembers(
      readScope,
      args.actor.actor_id,
      await listVocClusterMembers(deps.db, { clusterId: cluster.id }),
      cluster.primary_managed_system_id,
    );
    const visibleIds = new Set(members.map((member) => member.voc_id));
    const outcomes: VocClusterPublicUpdateOutcome[] = [];
    for (const vocId of [...new Set(args.input.voc_ids)]) {
      if (!visibleIds.has(vocId)) {
        outcomes.push({ voc_id: vocId, status: 'skipped', reason: 'not_found' });
        continue;
      }
      try {
        await deps.db.transaction((tx) =>
          postPublicUpdate({
            tx,
            actor: args.actor,
            vocId,
            input: args.input.public_update,
          }),
        );
        outcomes.push({ voc_id: vocId, status: 'applied' });
      } catch (error) {
        if (error instanceof HttpError) {
          outcomes.push({ voc_id: vocId, status: 'skipped', reason: error.code });
          continue;
        }
        throw error;
      }
    }
    return { outcomes };
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
          if (!cluster) throw new HttpError('not_found.record', 'record not found');

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

  async function linkExistingFinding(args: {
    actor: VocClustersActor;
    clusterId: string;
    input: LinkExistingFindingToVocClusterRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{
    status: number;
    body: NonNullable<VocClusterDto['linked_findings']>[number];
  }> {
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
          if (!cluster) throw new HttpError('not_found.record', 'record not found');

          const findingReadScope = await actorFindingReadScope(tx, args.actor);
          if (!isInScope(findingReadScope, cluster.primary_managed_system_id)) {
            throw new HttpError('not_found.record', 'record not found');
          }

          const finding = await lockFindingById(tx, {
            workspaceId: args.actor.workspace_id,
            findingId: args.input.finding_id,
          });
          if (!finding || !isInScope(findingReadScope, finding.primary_managed_system_id)) {
            throw new HttpError('not_found.record', 'record not found');
          }

          const [clusterManageDecision, findingManageDecision] = await Promise.all([
            deps.checkService.checkCapability(
              args.actor,
              'finding.manage',
              {
                workspace_id: args.actor.workspace_id,
                managed_system_id: cluster.primary_managed_system_id,
              },
              { tx },
            ),
            deps.checkService.checkCapability(
              args.actor,
              'finding.manage',
              {
                workspace_id: args.actor.workspace_id,
                managed_system_id: finding.primary_managed_system_id,
              },
              { tx },
            ),
          ]);
          if (!clusterManageDecision.allow || !findingManageDecision.allow) {
            const missingScope = [clusterManageDecision, findingManageDecision].some(
              (decision) => !decision.allow && decision.reason === 'no_grant',
            );
            if (args.actor.role_level === 'developer' && missingScope) {
              throw new HttpError(
                'permission.scope_required',
                'finding.manage capability required; developer needs MS-scoped grant',
                {
                  requiredScope: [
                    ...new Set(
                      [
                        !clusterManageDecision.allow
                          ? cluster.primary_managed_system_id
                          : undefined,
                        !findingManageDecision.allow
                          ? finding.primary_managed_system_id
                          : undefined,
                      ].filter((id): id is string => id !== undefined),
                    ),
                  ],
                  requestable_permission: { permission: 'finding.manage' },
                },
              );
            }
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          const evidenceTuple = registeredEntityLinkPairSchema.parse({
            source_type: 'voc_cluster',
            target_type: 'finding',
            relation_type: 'evidence_of',
          });
          const link = await insertActiveEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            sourceType: evidenceTuple.source_type,
            sourceId: cluster.id,
            targetType: evidenceTuple.target_type,
            targetId: finding.id,
            relationType: evidenceTuple.relation_type,
            managedSystemId: cluster.primary_managed_system_id,
            createdBy: args.actor.actor_id,
            visibility: 'internal_only',
          });

          if (link.inserted) {
            await deps.auditService.record(tx, {
              workspace_id: args.actor.workspace_id,
              actor_id: args.actor.actor_id,
              event_type: 'finding_linked_to_voc_cluster',
              subject_type: 'finding',
              subject_id: finding.id,
              summary: 'Finding linked to VOC Cluster',
              detail: {
                finding_id: finding.id,
                voc_cluster_id: cluster.id,
                primary_managed_system_id: finding.primary_managed_system_id,
                relation_type: 'evidence_of',
              },
            });
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
                relation_type: 'evidence_of',
                visibility: 'internal_only',
              },
            });
          }

          return {
            status: link.inserted ? 201 : 200,
            body: { id: finding.id, display_id: finding.display_id, status: finding.status },
          };
        },
      );
    });
  }

  async function unlinkExistingFinding(args: {
    actor: VocClustersActor;
    clusterId: string;
    input: UnlinkExistingFindingFromVocClusterRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: null }> {
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
          if (!cluster) throw new HttpError('not_found.record', 'record not found');

          const findingReadScope = await actorFindingReadScope(tx, args.actor);
          if (!isInScope(findingReadScope, cluster.primary_managed_system_id)) {
            throw new HttpError('not_found.record', 'record not found');
          }

          const finding = await lockFindingById(tx, {
            workspaceId: args.actor.workspace_id,
            findingId: args.input.finding_id,
          });
          if (!finding || !isInScope(findingReadScope, finding.primary_managed_system_id)) {
            throw new HttpError('not_found.record', 'record not found');
          }

          const [clusterManageDecision, findingManageDecision] = await Promise.all([
            deps.checkService.checkCapability(
              args.actor,
              'finding.manage',
              {
                workspace_id: args.actor.workspace_id,
                managed_system_id: cluster.primary_managed_system_id,
              },
              { tx },
            ),
            deps.checkService.checkCapability(
              args.actor,
              'finding.manage',
              {
                workspace_id: args.actor.workspace_id,
                managed_system_id: finding.primary_managed_system_id,
              },
              { tx },
            ),
          ]);
          if (!clusterManageDecision.allow || !findingManageDecision.allow) {
            const missingScope = [clusterManageDecision, findingManageDecision].some(
              (decision) => !decision.allow && decision.reason === 'no_grant',
            );
            if (args.actor.role_level === 'developer' && missingScope) {
              throw new HttpError(
                'permission.scope_required',
                'finding.manage capability required; developer needs MS-scoped grant',
                {
                  requiredScope: [
                    ...new Set(
                      [
                        !clusterManageDecision.allow
                          ? cluster.primary_managed_system_id
                          : undefined,
                        !findingManageDecision.allow
                          ? finding.primary_managed_system_id
                          : undefined,
                      ].filter((id): id is string => id !== undefined),
                    ),
                  ],
                  requestable_permission: { permission: 'finding.manage' },
                },
              );
            }
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          const activeLink = await selectActiveEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            sourceType: 'voc_cluster',
            sourceId: cluster.id,
            targetType: 'finding',
            targetId: finding.id,
            relationType: 'evidence_of',
          });
          // Idempotency records are JSONB NOT NULL. Keep the transport response
          // empty (the route calls send() without a payload), while caching JSON null.
          if (!activeLink) return { status: 204 as const, body: null };

          const detached = await detachEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            linkId: activeLink.id,
            actorId: args.actor.actor_id,
            reason: args.input.reason,
          });
          if (!detached) return { status: 204 as const, body: null };

          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'finding_unlinked_from_voc_cluster',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding unlinked from VOC Cluster',
            detail: {
              link_id: detached.id,
              finding_id: finding.id,
              voc_cluster_id: cluster.id,
              primary_managed_system_id: finding.primary_managed_system_id,
              relation_type: 'evidence_of',
              reason: args.input.reason,
            },
          });
          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'entity_link.detached',
            subject_type: 'entity_link',
            subject_id: detached.id,
            summary: 'Entity link detached',
            detail: {
              link_id: detached.id,
              source: { type: detached.source_type, id: detached.source_id },
              target: { type: detached.target_type, id: detached.target_id },
              relation_type: detached.relation_type,
              reason: args.input.reason,
            },
          });
          return { status: 204 as const, body: null };
        },
      );
    });
  }

  return {
    createCluster,
    listClusters,
    getCluster,
    listCandidatePeers,
    updateCluster,
    addMember,
    removeMember,
    createPublicUpdateCandidate,
    applyPublicUpdateCandidate,
    createFindingFromCluster,
    linkExistingFinding,
    unlinkExistingFinding,
  };
}

export type VocClustersService = ReturnType<typeof createVocClustersService>;
