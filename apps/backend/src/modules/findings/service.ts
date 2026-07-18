import {
  type AddEvidenceHighlightRequest,
  type CreateFindingRequest,
  type EvidenceHighlightDto,
  type FindingDto,
  type FindingStatus,
  type LinkEvidenceRequest,
  type LinkTaskRequest,
  type ListEvidenceHighlightsResponse,
  type PatchFindingRequest,
  registeredEntityLinkPairSchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { insertActiveEntityLink, resolveVocEndpoint } from '../entity-links/repo.js';
import type { EntityLinksService } from '../entity-links/service.js';
import type { CheckService } from '../permissions/check-service.js';
import { lockTaskById } from '../tasks/repo.js';
import { lockAnalyticsArea, lockManagedSystem, selectVocForUpdate } from '../voc/repo.js';
import {
  checkFindingRead,
  checkFindingManage,
} from './authorization.js';
import {
  type FindingReadRow,
  findCreatedFindingSourceLink,
  findFindingById,
  listFindingsByWorkspace,
} from './repo-read.js';
import {
  type EvidenceHighlightRow,
  findVocSourceMeta,
  incrementFindingEvidenceCount,
  insertEvidenceHighlight,
  insertFinding,
  listEvidenceHighlightsByFinding,
  listVocSourceMeta,
  lockFindingById,
  updateFindingLinkedTask,
  updateFindingStatus,
} from './repo.js';

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
  entityLinksService: EntityLinksService;
}

const USER_DIRECTED_STATUS_TARGETS = ['draft', 'active', 'not_actionable'] as const;
const ALLOWED_STATUS_TRANSITIONS: Record<
  (typeof USER_DIRECTED_STATUS_TARGETS)[number],
  ReadonlyArray<(typeof USER_DIRECTED_STATUS_TARGETS)[number]>
> = {
  draft: ['active', 'not_actionable'],
  active: ['not_actionable'],
  not_actionable: ['active'],
};

function isUserDirectedStatusTarget(
  status: FindingStatus,
): status is (typeof USER_DIRECTED_STATUS_TARGETS)[number] {
  return USER_DIRECTED_STATUS_TARGETS.includes(
    status as (typeof USER_DIRECTED_STATUS_TARGETS)[number],
  );
}

function toDto(
  row: FindingReadRow,
  source?: Awaited<ReturnType<typeof findCreatedFindingSourceLink>>,
): FindingDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    display_id: row.display_id,
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
            type: source.source_type,
            id: source.source_id,
            relation_type: 'created_finding',
            link_id: source.link_id,
          },
        }
      : {}),
  };
}

function evidenceHighlightToDto(
  row: EvidenceHighlightRow,
  options: { includeQuote: boolean; source_title: string | null; source_meta: string | null },
): EvidenceHighlightDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    finding_id: row.finding_id,
    primary_managed_system_id: row.primary_managed_system_id,
    source_type: row.source_type,
    source_id: row.source_id,
    source_title: options.source_title,
    source_meta: options.source_meta,
    ...(options.includeQuote ? { quote_or_summary: row.quote_or_summary } : {}),
    analytics_area_id: row.analytics_area_id,
    sentiment: row.sentiment,
    importance: row.importance,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
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

async function sourceVocReadable(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  input: { managedSystemId: string; reporterId: string | null },
  options: Parameters<FindingsServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (input.reporterId && actor.actor_id === input.reporterId) return true;
  const decision = await deps.checkService.checkCapability(
    actor,
    'voc.read',
    { workspace_id: actor.workspace_id, managed_system_id: input.managedSystemId },
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
  const decision = await checkFindingManage(deps.checkService, actor, managedSystemId, options);
  return decision.allow;
}

async function canReadFinding(
  deps: Pick<FindingsServiceDeps, 'checkService'>,
  actor: FindingsActor,
  managedSystemId: string,
): Promise<boolean> {
  const decision = await checkFindingRead(deps.checkService, actor, managedSystemId);
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

  async function assertHighlightSourceReadableForWrite(args: {
    actor: FindingsActor;
    tx: Tx;
    sourceType: AddEvidenceHighlightRequest['source_type'];
    sourceId: string | null | undefined;
  }): Promise<void> {
    if (args.sourceType === 'note') return;
    if (args.sourceType === 'survey_response') {
      throw new HttpError('validation.failed', 'survey_response evidence source is not available');
    }
    const sourceVoc = await selectVocForUpdate(
      args.tx,
      args.actor.workspace_id,
      args.sourceId ?? '',
    );
    if (!sourceVoc || sourceVoc.archivedAt !== null) {
      throw new HttpError('not_found.record', 'source voc not found');
    }
    const readable = await canReadSourceVoc(
      deps,
      args.actor,
      sourceVoc.primaryManagedSystemId,
      sourceVoc.reporterId,
      { tx: args.tx },
    );
    if (!readable) throw new HttpError('not_found.record', 'source voc not found');
  }

  async function addEvidenceHighlight(args: {
    actor: FindingsActor;
    findingId: string;
    input: AddEvidenceHighlightRequest;
  }): Promise<{ status: number; body: EvidenceHighlightDto }> {
    const { actor, findingId, input } = args;

    return deps.db.transaction(async (tx) => {
      const finding = await lockFindingById(tx, {
        workspaceId: actor.workspace_id,
        findingId,
      });
      if (!finding) throw new HttpError('not_found.record', 'finding not found');

      const canManage = await canManageFinding(deps, actor, finding.primary_managed_system_id, {
        tx,
      });
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      if (input.analytics_area_id) {
        const aa = await lockAnalyticsArea(tx, actor.workspace_id, input.analytics_area_id);
        if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
        if (aa.managed_system_id !== finding.primary_managed_system_id) {
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

      await assertHighlightSourceReadableForWrite({
        actor,
        tx,
        sourceType: input.source_type,
        sourceId: input.source_id,
      });

      const row = await insertEvidenceHighlight(tx, {
        workspaceId: actor.workspace_id,
        findingId: finding.id,
        primaryManagedSystemId: finding.primary_managed_system_id,
        sourceType: input.source_type,
        sourceId: input.source_id ?? null,
        quoteOrSummary: input.quote_or_summary,
        analyticsAreaId: input.analytics_area_id ?? null,
        sentiment: input.sentiment ?? null,
        importance: input.importance ?? null,
        createdBy: actor.actor_id,
      });
      await incrementFindingEvidenceCount(tx, {
        workspaceId: actor.workspace_id,
        findingId: finding.id,
      });

      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'evidence_highlight_added',
        subject_type: 'finding',
        subject_id: finding.id,
        summary: 'Evidence highlight added',
        detail: {
          finding_id: finding.id,
          evidence_highlight_id: row.id,
          source_type: row.source_type,
          source_id: row.source_id,
          primary_managed_system_id: finding.primary_managed_system_id,
        },
      });

      const sourceMeta =
        row.source_type === 'voc' && row.source_id
          ? await findVocSourceMeta(tx, {
              workspaceId: actor.workspace_id,
              vocId: row.source_id,
            })
          : null;

      return {
        status: 201,
        body: evidenceHighlightToDto(row, {
          includeQuote: true,
          source_title: sourceMeta?.title ?? null,
          source_meta: sourceMeta?.display_id ?? null,
        }),
      };
    });
  }

  async function canReadEvidenceHighlightSource(args: {
    actor: FindingsActor;
    row: EvidenceHighlightRow;
  }): Promise<boolean> {
    if (args.row.source_type === 'note') return true;
    if (args.row.source_type === 'survey_response') return false;
    if (!args.row.source_id) return false;

    const source = await resolveVocEndpoint(deps.db, args.actor.workspace_id, args.row.source_id);
    if (!source) return false;
    return sourceVocReadable(
      deps,
      args.actor,
      { managedSystemId: source.managed_system_id, reporterId: source.reporter_id },
      undefined,
    );
  }

  async function listEvidenceHighlights(args: {
    actor: FindingsActor;
    findingId: string;
  }): Promise<ListEvidenceHighlightsResponse> {
    const finding = await findFindingById(deps.db, {
      workspaceId: args.actor.workspace_id,
      findingId: args.findingId,
    });
    if (!finding) throw new HttpError('not_found.record', 'finding not found');

    const readable = await canReadFinding(deps, args.actor, finding.primary_managed_system_id);
    if (!readable) throw new HttpError('permission.denied', 'finding.read capability required');

    const rows = await listEvidenceHighlightsByFinding(deps.db, {
      workspaceId: args.actor.workspace_id,
      findingId: finding.id,
    });
    const items: EvidenceHighlightDto[] = [];
    const visibility: Array<{ row: EvidenceHighlightRow; includeQuote: boolean }> = [];
    for (const row of rows) {
      const includeQuote = await canReadEvidenceHighlightSource({ actor: args.actor, row });
      visibility.push({ row, includeQuote });
    }
    const readableVocIds = [
      ...new Set(
        visibility
          .filter(
            ({ row, includeQuote }) => includeQuote && row.source_type === 'voc' && row.source_id,
          )
          .map(({ row }) => row.source_id as string),
      ),
    ];
    const sourceMetaRows = await listVocSourceMeta(deps.db, {
      workspaceId: args.actor.workspace_id,
      vocIds: readableVocIds,
    });
    const sourceMetaById = new Map(sourceMetaRows.map((meta) => [meta.id, meta]));

    for (const { row, includeQuote } of visibility) {
      const sourceMeta =
        includeQuote && row.source_type === 'voc' && row.source_id
          ? sourceMetaById.get(row.source_id)
          : null;
      items.push(
        evidenceHighlightToDto(row, {
          includeQuote,
          source_title: sourceMeta?.title ?? null,
          source_meta: sourceMeta?.display_id ?? null,
        }),
      );
    }
    return { items };
  }

  async function linkEvidence(args: {
    actor: FindingsActor;
    findingId: string;
    input: LinkEvidenceRequest;
  }): Promise<{ status: number; body: { id: string; relation_type: 'evidence_of' } }> {
    const { actor, findingId, input } = args;

    return deps.db.transaction(async (tx) => {
      const finding = await lockFindingById(tx, {
        workspaceId: actor.workspace_id,
        findingId,
      });
      if (!finding) throw new HttpError('not_found.record', 'finding not found');

      const canManage = await canManageFinding(deps, actor, finding.primary_managed_system_id, {
        tx,
      });
      if (!canManage) {
        throw new HttpError('permission.denied', 'finding.manage capability required');
      }

      const result = await deps.entityLinksService
        .createLink({
          actor,
          source: { type: 'voc', id: input.source_id },
          target: { type: 'finding', id: finding.id },
          relation_type: 'evidence_of',
          visibility: 'internal_only',
          tx,
        })
        .catch((err: unknown) => {
          if (err instanceof HttpError && err.code === 'permission.denied') {
            throw new HttpError('not_found.record', 'source voc not found');
          }
          throw err;
        });

      return {
        status: result.status,
        body: { id: result.link.id, relation_type: 'evidence_of' },
      };
    });
  }

  async function patchFinding(args: {
    actor: FindingsActor;
    findingId: string;
    input: PatchFindingRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: FindingDto }> {
    const { actor, findingId, input, idempotencyKey, requestHash } = args;

    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const finding = await lockFindingById(tx, {
            workspaceId: actor.workspace_id,
            findingId,
          });
          if (!finding) throw new HttpError('not_found.record', 'finding not found');

          const canManage = await canManageFinding(deps, actor, finding.primary_managed_system_id, {
            tx,
          });
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          if (!isUserDirectedStatusTarget(input.status)) {
            throw new HttpError(
              'validation.failed',
              'finding status target is not user-directed in this slice',
              { fields: [{ path: ['status'], code: 'unsupported_target' }] },
            );
          }

          const source = await findCreatedFindingSourceLink(tx, {
            workspaceId: actor.workspace_id,
            findingId: finding.id,
          });

          if (input.status === finding.status) {
            return { status: 200, body: toDto(finding, source) };
          }

          if (!isUserDirectedStatusTarget(finding.status)) {
            throw new HttpError(
              'validation.failed',
              'finding status cannot transition from its current state in this slice',
              { fields: [{ path: ['status'], code: 'invalid_transition' }] },
            );
          }

          const allowedTargets = ALLOWED_STATUS_TRANSITIONS[finding.status];
          if (!allowedTargets.includes(input.status)) {
            throw new HttpError('validation.failed', 'invalid finding status transition', {
              fields: [{ path: ['status'], code: 'invalid_transition' }],
            });
          }

          const updated = await updateFindingStatus(tx, {
            workspaceId: actor.workspace_id,
            findingId: finding.id,
            status: input.status,
          });

          const detail: Record<string, unknown> = {
            finding_id: finding.id,
            from_status: finding.status,
            to_status: updated.status,
            primary_managed_system_id: finding.primary_managed_system_id,
          };
          if (input.reason !== undefined) detail.reason = input.reason;

          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'finding_status_changed',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding status changed',
            detail,
          });

          return { status: 200, body: toDto(updated, source) };
        },
      );
    });
  }

  async function linkTask(args: {
    actor: FindingsActor;
    findingId: string;
    input: LinkTaskRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: FindingDto }> {
    const { actor, findingId, input, idempotencyKey, requestHash } = args;

    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const finding = await lockFindingById(tx, {
            workspaceId: actor.workspace_id,
            findingId,
          });
          if (!finding) throw new HttpError('not_found.record', 'finding not found');

          const canManage = await canManageFinding(deps, actor, finding.primary_managed_system_id, {
            tx,
          });
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          const task = await lockTaskById(tx, {
            workspaceId: actor.workspace_id,
            taskId: input.task_id,
          });
          if (!task) throw new HttpError('not_found.record', 'task not found');
          if (task.primary_managed_system_id !== finding.primary_managed_system_id) {
            throw new HttpError('permission.denied', 'task is outside finding scope');
          }

          if (finding.linked_task_id !== null) {
            if (finding.linked_task_id === task.id) {
              const source = await findCreatedFindingSourceLink(tx, {
                workspaceId: actor.workspace_id,
                findingId: finding.id,
              });
              return { status: 200, body: toDto(finding, source) };
            }
            throw new HttpError('validation.failed', 'finding is already linked to a task', {
              fields: [{ path: ['linked_task_id'], code: 'already_linked' }],
            });
          }

          const updated = await updateFindingLinkedTask(tx, {
            workspaceId: actor.workspace_id,
            findingId: finding.id,
            taskId: task.id,
          });
          const source = await findCreatedFindingSourceLink(tx, {
            workspaceId: actor.workspace_id,
            findingId: finding.id,
          });

          const tuple = registeredEntityLinkPairSchema.parse({
            source_type: 'finding',
            target_type: 'task',
            relation_type: 'requested_task',
          });
          const link = await insertActiveEntityLink(tx, {
            workspaceId: actor.workspace_id,
            sourceType: tuple.source_type,
            sourceId: finding.id,
            targetType: tuple.target_type,
            targetId: task.id,
            relationType: tuple.relation_type,
            managedSystemId: finding.primary_managed_system_id,
            createdBy: actor.actor_id,
            visibility: 'internal_only',
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
                source: { type: 'finding', id: finding.id },
                target: { type: 'task', id: task.id },
                relation_type: 'requested_task',
                visibility: 'internal_only',
              },
            });
          }

          await deps.auditService.record(tx, {
            workspace_id: actor.workspace_id,
            actor_id: actor.actor_id,
            event_type: 'finding_task_linked',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding linked to existing Task',
            detail: {
              finding_id: finding.id,
              task_id: task.id,
              primary_managed_system_id: finding.primary_managed_system_id,
            },
          });

          return { status: 200, body: toDto(updated, source) };
        },
      );
    });
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

  return {
    createFindingFromVoc,
    getFinding,
    listFindings,
    addEvidenceHighlight,
    listEvidenceHighlights,
    linkEvidence,
    patchFinding,
    linkTask,
  };
}

export type FindingsService = ReturnType<typeof createFindingsService>;
