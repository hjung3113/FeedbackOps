import {
  type CreateFindingRequest,
  type FindingDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { insertActiveEntityLink } from '../entity-links/repo.js';
import type { CheckService } from '../permissions/check-service.js';
import { lockAnalyticsArea, lockManagedSystem, selectVocForUpdate } from '../voc/repo.js';
import {
  type FindingReadRow,
  findCreatedFindingSourceLink,
  findFindingById,
  listFindingsByWorkspace,
} from './repo-read.js';
import { insertFinding } from './repo.js';

export interface FindingsActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface FindingsServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
}

function toDto(
  row: FindingReadRow,
  source?: Awaited<ReturnType<typeof findCreatedFindingSourceLink>>,
): FindingDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    primary_managed_system_id: row.primary_managed_system_id,
    title: row.title,
    summary: row.summary,
    source_type: row.source_type,
    source_id: row.source_id,
    evidence_count: row.evidence_count,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    analytics_area_id: row.analytics_area_id,
    linked_task_id: row.linked_task_id,
    linked_milestone_id: row.linked_milestone_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    ...(source
      ? {
          source: {
            type: 'voc',
            id: source.source_id,
            relation_type: 'created_finding',
            link_id: source.link_id,
          },
        }
      : {}),
  };
}

async function canReadSourceVoc(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  managedSystemId: string,
  reporterId: string,
  options: Parameters<FindingsServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (actor.actor_id === reporterId) return true;
  const decision = await deps.checkService.checkCapability(
    actor,
    'voc.read',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
  return decision.allow;
}

async function canManageFinding(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  managedSystemId: string,
  options: Parameters<FindingsServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (actor.role_level === 'admin') return true;
  const decision = await deps.checkService.checkCapability(
    actor,
    'finding.manage',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
  return decision.allow;
}

async function canReadFinding(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
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

export function createFindingsService(deps: FindingsServiceDeps) {
  async function createFindingFromVoc(args: {
    actor: FindingsActor;
    vocId: string;
    input: CreateFindingRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: FindingDto }> {
    const { actor, vocId, input, idempotencyKey, requestHash } = args;

    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const sourceVoc = await selectVocForUpdate(tx, actor.workspace_id, vocId);
          if (!sourceVoc || sourceVoc.archivedAt !== null) {
            throw new HttpError('not_found.record', 'voc not found');
          }

          const sourceReadable = await canReadSourceVoc(
            deps,
            actor,
            sourceVoc.primaryManagedSystemId,
            sourceVoc.reporterId,
            {
              tx,
            },
          );
          if (!sourceReadable) {
            throw new HttpError('not_found.record', 'voc not found');
          }

          const targetManagedSystemId =
            input.primary_managed_system_id ?? sourceVoc.primaryManagedSystemId;
          const targetMs = await lockManagedSystem(tx, actor.workspace_id, targetManagedSystemId);
          if (!targetMs) throw new HttpError('not_found.record', 'managed system not found');
          if (targetMs.archived_at !== null) {
            throw new HttpError('conflict.parent_archived', 'managed system archived', {
              fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
            });
          }

          const canManage = await canManageFinding(deps, actor, targetManagedSystemId, { tx });
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          if (input.analytics_area_id) {
            const aa = await lockAnalyticsArea(tx, actor.workspace_id, input.analytics_area_id);
            if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
            if (aa.managed_system_id !== targetManagedSystemId) {
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

          const finding = await insertFinding(tx, {
            workspaceId: actor.workspace_id,
            primaryManagedSystemId: targetManagedSystemId,
            title: input.title,
            summary: input.summary,
            sourceType: 'voc',
            sourceId: sourceVoc.id,
            severity: input.severity,
            confidence: input.confidence ?? null,
            analyticsAreaId: input.analytics_area_id ?? null,
            createdBy: actor.actor_id,
          });

          const createdFindingTuple = registeredEntityLinkPairSchema.parse({
            source_type: 'voc',
            target_type: 'finding',
            relation_type: 'created_finding',
          });

          const link = await insertActiveEntityLink(tx, {
            workspaceId: actor.workspace_id,
            sourceType: createdFindingTuple.source_type,
            sourceId: sourceVoc.id,
            targetType: createdFindingTuple.target_type,
            targetId: finding.id,
            relationType: createdFindingTuple.relation_type,
            managedSystemId: sourceVoc.primaryManagedSystemId,
            createdBy: actor.actor_id,
            visibility: 'internal_only',
          });

          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'finding_created_from_voc',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding created from VOC',
            detail: {
              finding_id: finding.id,
              source_voc_id: sourceVoc.id,
              primary_managed_system_id: targetManagedSystemId,
              source_type: 'voc',
            },
          });

          if (link.inserted) {
            await deps.auditService.record(tx, {
              workspace_id: actor.workspace_id,
              actor_id: actor.actor_id,
              event_type: 'entity_link.created',
              subject_type: 'entity_link',
              subject_id: link.row.id,
              summary: 'Entity link created',
              detail: {
                link_id: link.row.id,
                source: { type: 'voc', id: sourceVoc.id },
                target: { type: 'finding', id: finding.id },
                relation_type: 'created_finding',
                visibility: 'internal_only',
              },
            });
          }

          return {
            status: 201,
            body: toDto(finding, {
              link_id: link.row.id,
              source_type: 'voc',
              source_id: sourceVoc.id,
              relation_type: 'created_finding',
            }),
          };
        },
      );
    });
  }

  async function getFinding(args: {
    actor: FindingsActor;
    findingId: string;
  }): Promise<FindingDto> {
    const row = await findFindingById(deps.db, {
      workspaceId: args.actor.workspace_id,
      findingId: args.findingId,
    });
    if (!row) throw new HttpError('not_found.record', 'finding not found');
    const readable = await canReadFinding(deps, args.actor, row.primary_managed_system_id);
    if (!readable) throw new HttpError('permission.denied', 'finding.read capability required');
    const source = await findCreatedFindingSourceLink(deps.db, {
      workspaceId: args.actor.workspace_id,
      findingId: row.id,
    });
    return toDto(row, source);
  }

  async function listFindings(args: {
    actor: FindingsActor;
    managedSystemId?: string;
  }): Promise<{ items: FindingDto[] }> {
    if (args.actor.role_level !== 'admin' && args.actor.role_level !== 'developer') {
      throw new HttpError('permission.denied', 'finding.read capability required');
    }

    const rows = await listFindingsByWorkspace(deps.db, {
      workspaceId: args.actor.workspace_id,
      ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
    });
    const items: FindingDto[] = [];
    for (const row of rows) {
      const readable = await canReadFinding(deps, args.actor, row.primary_managed_system_id);
      if (!readable) continue;
      items.push(toDto(row));
    }
    return { items };
  }

  return { createFindingFromVoc, getFinding, listFindings };
}

export type FindingsService = ReturnType<typeof createFindingsService>;
