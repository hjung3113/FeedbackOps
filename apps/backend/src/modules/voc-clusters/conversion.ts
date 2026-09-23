import {
  type CreateFindingFromVocClusterRequest,
  type LinkExistingFindingToVocClusterRequest,
  type UnlinkExistingFindingFromVocClusterRequest,
  type VocClusterDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';

import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { lockAnalyticsArea } from '../analytics-areas/index.js';
import {
  createEntityLink,
  detachEntityLink,
  findActiveEntityLink,
} from '../entity-links/commands.js';
import { assertLinkManagedSystemCompatibility } from '../entity-links/service.js';
import {
  actorFindingReadScope,
  checkFindingManage,
  isFindingInReadScope,
} from '../findings/authorization.js';
import { createFindingFromVocCluster, lockFindingForUpdate } from '../findings/commands.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import { lockVocClusterById } from './repo.js';
import type { VocClustersActor, VocClustersServiceDeps } from './service.js';

export function createVocClusterConversion(
  deps: VocClustersServiceDeps,
  canManageCluster: (
    deps: Pick<VocClustersServiceDeps, 'checkService'>,
    actor: VocClustersActor,
    managedSystemId: string,
    options?: Parameters<VocClustersServiceDeps['checkService']['checkCapability']>[3],
  ) => Promise<boolean>,
) {
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

          assertLinkManagedSystemCompatibility(
            cluster.primary_managed_system_id,
            targetManagedSystemId,
            {
              path: ['primary_managed_system_id'],
            },
          );

          await assertTargetAnalyticsArea({
            tx,
            workspaceId: args.actor.workspace_id,
            analyticsAreaId: args.input.analytics_area_id,
            managedSystemId: targetManagedSystemId,
          });

          const finding = await createFindingFromVocCluster(tx, {
            workspaceId: args.actor.workspace_id,
            primaryManagedSystemId: targetManagedSystemId,
            title: args.input.title,
            summary: args.input.summary,
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

          const link = await createEntityLink(tx, {
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

          const findingReadScope = await actorFindingReadScope(tx, args.actor, {
            requireElevatedRole: true,
          });
          if (!isFindingInReadScope(findingReadScope, cluster.primary_managed_system_id)) {
            throw new HttpError('not_found.record', 'record not found');
          }

          const finding = await lockFindingForUpdate(tx, {
            workspaceId: args.actor.workspace_id,
            findingId: args.input.finding_id,
          });
          if (
            !finding ||
            !isFindingInReadScope(findingReadScope, finding.primary_managed_system_id)
          ) {
            throw new HttpError('not_found.record', 'record not found');
          }

          const [clusterManageDecision, findingManageDecision] = await Promise.all([
            checkFindingManage(
              deps.checkService,
              args.actor,
              cluster.primary_managed_system_id,
              { requireElevatedRole: true },
              {
                tx,
              },
            ),
            checkFindingManage(
              deps.checkService,
              args.actor,
              finding.primary_managed_system_id,
              { requireElevatedRole: true },
              {
                tx,
              },
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

          assertLinkManagedSystemCompatibility(
            cluster.primary_managed_system_id,
            finding.primary_managed_system_id,
            { path: ['finding_id'] },
          );

          const evidenceTuple = registeredEntityLinkPairSchema.parse({
            source_type: 'voc_cluster',
            target_type: 'finding',
            relation_type: 'evidence_of',
          });
          const link = await createEntityLink(tx, {
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
  }): Promise<{ status: number; body: Record<string, never> }> {
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

          const findingReadScope = await actorFindingReadScope(tx, args.actor, {
            requireElevatedRole: true,
          });
          if (!isFindingInReadScope(findingReadScope, cluster.primary_managed_system_id)) {
            throw new HttpError('not_found.record', 'record not found');
          }

          const finding = await lockFindingForUpdate(tx, {
            workspaceId: args.actor.workspace_id,
            findingId: args.input.finding_id,
          });
          if (
            !finding ||
            !isFindingInReadScope(findingReadScope, finding.primary_managed_system_id)
          ) {
            throw new HttpError('not_found.record', 'record not found');
          }

          // Admin is workspace-wide by role. Developer grants are checked only
          // after both endpoints have passed finding.read, preserving the
          // non-disclosing link-command authorization order.
          if (args.actor.role_level !== 'admin') {
            const [clusterManageDecision, findingManageDecision] = await Promise.all([
              checkFindingManage(
                deps.checkService,
                args.actor,
                cluster.primary_managed_system_id,
                { requireElevatedRole: true },
                {
                  tx,
                },
              ),
              checkFindingManage(
                deps.checkService,
                args.actor,
                finding.primary_managed_system_id,
                { requireElevatedRole: true },
                {
                  tx,
                },
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
          }

          const activeLink = await findActiveEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            sourceType: 'voc_cluster',
            sourceId: cluster.id,
            targetType: 'finding',
            targetId: finding.id,
            relationType: 'evidence_of',
          });
          // Idempotency records are JSONB NOT NULL. Keep the transport response
          // empty (the route calls send() without a payload), while caching an empty object.
          if (!activeLink) return { status: 204 as const, body: {} };

          const detached = await detachEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            linkId: activeLink.id,
            actorId: args.actor.actor_id,
            reason: args.input.reason,
          });
          if (!detached) return { status: 204 as const, body: {} };

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
          return { status: 204 as const, body: {} };
        },
      );
    });
  }

  return { createFindingFromCluster, linkExistingFinding, unlinkExistingFinding };
}
