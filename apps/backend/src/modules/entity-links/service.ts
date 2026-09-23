import type {
  DetachedEntityLinkResponse,
  EntityLinkDto,
  EntityLinkEntityType,
  EntityLinkPair,
  EntityLinkRef,
  EntityLinkRelationType,
  EntityLinkTargetSummary,
  EntityLinkVisibilityState,
  TaskReporterSummary,
} from '@fops/shared';
import { isRegisteredEntityLinkPair, registeredEntityLinkPairs } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { type LinkVisibilityDecision, evaluateLinkVisibility } from './evaluate-visibility.js';
import type {
  EntityLinkProvider,
  EntityLinkProviderRegistry,
  EntityLinksActor,
  ReporterSummaryResult,
} from './provider-types.js';
import {
  type EntityLinkRow,
  type LinkEndpointRow,
  detachEntityLink,
  insertActiveEntityLink,
  selectActiveLinksForEndpoint,
  selectEntityLinkById,
  selectLinksByWorkspace,
} from './repo.js';

export type { EntityLinksActor, ReporterSummaryResult } from './provider-types.js';

export interface EntityLinksServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  providers: EntityLinkProviderRegistry;
}

function toAllowedDto(row: EntityLinkRow, targetSummary?: EntityLinkTargetSummary): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    target_type: row.target_type,
    target_id: row.target_id,
    ...(targetSummary !== undefined ? { target_summary: targetSummary } : {}),
    relation_type: row.relation_type,
    visibility: row.visibility,
    status: row.status,
    managed_system_id: row.managed_system_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    visibility_state: 'allowed',
  };
}

function toAuditMetadataDto(
  row: EntityLinkRow,
  visibilityState: Extract<EntityLinkVisibilityState, 'hidden' | 'denied'>,
): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    target_type: row.target_type,
    relation_type: row.relation_type,
    status: row.status,
    managed_system_id: row.managed_system_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    visibility_state: visibilityState,
  };
}

function toSummaryVisibleDto(row: EntityLinkRow, summary: TaskReporterSummary): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    target_type: row.target_type,
    relation_type: row.relation_type,
    status: row.status,
    managed_system_id: row.managed_system_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    visibility_state: 'summary_visible',
    summary,
  };
}

function toDtoForDecision(
  row: EntityLinkRow,
  decision: LinkVisibilityDecision,
  summary?: TaskReporterSummary,
  targetSummary?: EntityLinkTargetSummary,
): EntityLinkDto {
  if (decision === 'allowed') return toAllowedDto(row, targetSummary);
  if (decision === 'hidden' || decision === 'denied') return toAuditMetadataDto(row, decision);
  if (summary !== undefined) return toSummaryVisibleDto(row, summary);
  throw new HttpError(
    'internal.unexpected',
    'summary-visible entity link decision missing summary resolver',
  );
}

function toDetachedResponse(row: EntityLinkRow): DetachedEntityLinkResponse {
  if (row.status !== 'detached' || row.detached_at === null) {
    throw new HttpError('internal.unexpected', 'detached entity link row missing detach fields');
  }
  return {
    id: row.id,
    status: 'detached',
    detached_at: row.detached_at.toISOString(),
  };
}

/**
 * Create-time Managed System compatibility gate (#388). Both endpoints of an
 * entity link must resolve to the same Managed System; a mismatch is rejected
 * after endpoint authorization and before insert. This is the single
 * authoritative seam — the polymorphic entity_links table cannot express it
 * as a CHECK/FK.
 */
export function assertLinkManagedSystemCompatibility(
  sourceManagedSystemId: string,
  targetManagedSystemId: string,
  field: { path: (string | number)[] } = { path: ['target', 'id'] },
): void {
  if (sourceManagedSystemId !== targetManagedSystemId) {
    throw new HttpError(
      'validation.failed',
      'entity link source and target must belong to the same managed system',
      { fields: [{ path: field.path, code: 'managed_system_mismatch' }] },
    );
  }
}

function providerFor(
  providers: EntityLinkProviderRegistry,
  type: EntityLinkEntityType,
): EntityLinkProvider {
  return providers[type];
}

// The registry is the DB/audit allowlist. Some registered tuples are written only by
// domain commands, whose compound authorization and audit obligations cannot be
// represented by the generic endpoints.
const genericEntityLinkPairs = registeredEntityLinkPairs.filter(
  (pair) =>
    !(
      pair.source_type === 'voc_cluster' &&
      pair.target_type === 'finding' &&
      pair.relation_type === 'evidence_of'
    ) &&
    // Survey-response tuples are command-only until C4 owns their compound
    // authorization, audit, and privacy obligations.
    pair.source_type !== 'survey_response',
);
const creatableEntityLinkPairs = genericEntityLinkPairs;
const listVisibleEntityLinkPairs = genericEntityLinkPairs;

function tupleListIncludes(
  pairs: readonly EntityLinkPair[],
  input: {
    sourceType: EntityLinkEntityType;
    targetType: EntityLinkEntityType;
    relationType: EntityLinkRelationType;
  },
): boolean {
  return pairs.some(
    (pair) =>
      pair.source_type === input.sourceType &&
      pair.target_type === input.targetType &&
      pair.relation_type === input.relationType,
  );
}

function isCreatableTuple(input: {
  sourceType: EntityLinkEntityType;
  targetType: EntityLinkEntityType;
  relationType: EntityLinkRelationType;
}): boolean {
  return (
    isRegisteredEntityLinkPair({
      source_type: input.sourceType,
      target_type: input.targetType,
      relation_type: input.relationType,
    }) && tupleListIncludes(creatableEntityLinkPairs, input)
  );
}

function isListVisibleTuple(input: {
  sourceType: EntityLinkEntityType;
  targetType: EntityLinkEntityType;
  relationType: EntityLinkRelationType;
}): boolean {
  return (
    isRegisteredEntityLinkPair({
      source_type: input.sourceType,
      target_type: input.targetType,
      relation_type: input.relationType,
    }) && tupleListIncludes(listVisibleEntityLinkPairs, input)
  );
}

async function resolveEndpointForRow(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'providers'>,
  actor: EntityLinksActor,
  endpoint: EntityLinkRef,
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
): Promise<LinkEndpointRow | null> {
  const key = `${endpoint.type}:${endpoint.id}`;
  if (resolvedByEndpoint.has(key)) return resolvedByEndpoint.get(key) ?? null;
  const provider = providerFor(deps.providers, endpoint.type);
  const row = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
  resolvedByEndpoint.set(key, row);
  return row;
}

async function evaluateRowVisibility(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService' | 'providers'>,
  actor: EntityLinksActor,
  row: EntityLinkRow,
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
  reporterSummaries: ReadonlyMap<string, ReporterSummaryResult>,
  sourceReadabilityByEndpoint: Map<string, boolean>,
): Promise<{ decision: LinkVisibilityDecision; summary?: TaskReporterSummary }> {
  const sourceRef = { type: row.source_type, id: row.source_id };
  const targetRef = { type: row.target_type, id: row.target_id };
  const [source, target] = await Promise.all([
    resolveEndpointForRow(deps, actor, sourceRef, resolvedByEndpoint),
    resolveEndpointForRow(deps, actor, targetRef, resolvedByEndpoint),
  ]);
  const sourceProvider = providerFor(deps.providers, row.source_type);
  const targetSummary: ReporterSummaryResult = reporterSummaries.get(
    `${row.target_type}:${row.target_id}`,
  ) ?? { available: false };
  const sourceKey = `${row.source_type}:${row.source_id}`;
  const cachedSourceReadable = sourceReadabilityByEndpoint.get(sourceKey);
  const [sourceReadable, targetReadable] = await Promise.all([
    cachedSourceReadable ?? (source ? sourceProvider.canRead(deps, actor, source) : false),
    target ? providerFor(deps.providers, row.target_type).canRead(deps, actor, target) : false,
  ]);
  sourceReadabilityByEndpoint.set(sourceKey, sourceReadable);

  const decision = evaluateLinkVisibility({
    visibility: row.visibility,
    actorContext: {
      actor_id: actor.actor_id,
      role_level: actor.role_level,
    },
    sourceReadable,
    targetReadable,
    targetSummaryAvailable: targetSummary.available,
    sourceReporterId: source?.reporter_id ?? null,
    targetReporterId: target?.reporter_id ?? null,
  });
  return targetSummary.available ? { decision, summary: targetSummary.summary } : { decision };
}

async function preloadReporterSummaries(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService' | 'providers'>,
  actor: EntityLinksActor,
  rows: readonly EntityLinkRow[],
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
): Promise<{
  reporterSummaries: Map<string, ReporterSummaryResult>;
  sourceReadabilityByEndpoint: Map<string, boolean>;
}> {
  const sourceReadabilityByEndpoint = new Map<string, boolean>();
  if (actor.role_level !== 'user') {
    return { reporterSummaries: new Map(), sourceReadabilityByEndpoint };
  }

  const summaryCandidateRows = rows.filter(
    (row) =>
      row.visibility === 'summary_visible' &&
      row.target_type === 'task' &&
      isListVisibleTuple({
        sourceType: row.source_type,
        targetType: row.target_type,
        relationType: row.relation_type,
      }),
  );
  const sourceRefs = new Map(
    summaryCandidateRows.map((row) => [
      `${row.source_type}:${row.source_id}`,
      { type: row.source_type, id: row.source_id } satisfies EntityLinkRef,
    ]),
  );
  const sourceReadability = await Promise.all(
    [...sourceRefs].map(async ([key, sourceRef]) => {
      const source = await resolveEndpointForRow(deps, actor, sourceRef, resolvedByEndpoint);
      const readable = source
        ? await providerFor(deps.providers, sourceRef.type).canRead(deps, actor, source)
        : false;
      return [key, readable] as const;
    }),
  );
  for (const [key, readable] of sourceReadability) sourceReadabilityByEndpoint.set(key, readable);

  const taskIds = [
    ...new Set(
      summaryCandidateRows
        .filter((row) => sourceReadabilityByEndpoint.get(`${row.source_type}:${row.source_id}`))
        .map((row) => row.target_id),
    ),
  ];
  const summaries = await deps.providers.task.getReporterSummaries?.(
    deps.db,
    actor.workspace_id,
    taskIds,
  );
  return {
    reporterSummaries: new Map(
      [...(summaries ?? new Map<string, ReporterSummaryResult>())].map(([id, summary]) => [
        `task:${id}`,
        summary,
      ]),
    ),
    sourceReadabilityByEndpoint,
  };
}

async function getTargetInternalSummary(
  providers: EntityLinkProviderRegistry,
  db: Db | Tx,
  actor: EntityLinksActor,
  row: Pick<EntityLinkRow, 'target_type' | 'target_id'>,
): Promise<EntityLinkTargetSummary | undefined> {
  const summary = await providerFor(providers, row.target_type).getInternalSummary(
    db,
    actor.workspace_id,
    row.target_id,
  );
  return summary ?? undefined;
}

export function createEntityLinksService(deps: EntityLinksServiceDeps) {
  async function createLink(args: {
    actor: EntityLinksActor;
    source: EntityLinkRef;
    target: EntityLinkRef;
    relation_type: EntityLinkRelationType;
    visibility?: 'internal_only' | 'summary_visible';
    /** Internal-only capability; HTTP routes never supply this. */
    internalWritePath?: 'task_request_conversion';
    tx?: Tx;
  }): Promise<{ link: EntityLinkDto; status: 200 | 201 }> {
    const { actor, source, target } = args;
    const visibility = args.visibility ?? 'internal_only';

    if (
      !isCreatableTuple({
        sourceType: source.type,
        targetType: target.type,
        relationType: args.relation_type,
      })
    ) {
      throw new HttpError('validation.failed', 'unsupported entity link tuple', {
        fields: [{ path: [], code: 'unsupported_tuple' }],
      });
    }
    const isConversionSummaryLink =
      visibility === 'summary_visible' &&
      args.internalWritePath === 'task_request_conversion' &&
      source.type === 'voc' &&
      target.type === 'task' &&
      args.relation_type === 'evidence_of';
    if (visibility !== 'internal_only' && !isConversionSummaryLink) {
      throw new HttpError('validation.failed', 'unsupported visibility', {
        fields: [{ path: ['visibility'], code: 'unsupported_visibility' }],
      });
    }
    if (source.id === target.id) {
      throw new HttpError('validation.failed', 'entity link source and target must differ', {
        fields: [{ path: ['target', 'id'], code: 'self_link' }],
      });
    }

    const db = args.tx ?? deps.db;
    const sourceProvider = providerFor(deps.providers, source.type);
    const targetProvider = providerFor(deps.providers, target.type);
    const [sourceRow, targetRow] = await Promise.all([
      sourceProvider.assertExists(db, actor.workspace_id, source.id),
      targetProvider.assertExists(db, actor.workspace_id, target.id),
    ]);
    if (!sourceRow || !targetRow) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const sourceAllowed = await sourceProvider.canRead(deps, actor, sourceRow);
    if (!sourceAllowed) {
      throw new HttpError('permission.denied', 'missing source VOC read scope');
    }

    const targetAllowed =
      targetProvider.canCreateTarget !== undefined
        ? await targetProvider.canCreateTarget(deps, actor, targetRow)
        : await targetProvider.canRead(deps, actor, targetRow);
    if (!targetAllowed) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    assertLinkManagedSystemCompatibility(sourceRow.managed_system_id, targetRow.managed_system_id);

    const persist = async (tx: Tx) => {
      const inserted = await insertActiveEntityLink(tx, {
        workspaceId: actor.workspace_id,
        sourceType: source.type,
        sourceId: source.id,
        targetType: target.type,
        targetId: target.id,
        relationType: args.relation_type,
        managedSystemId: sourceRow.managed_system_id,
        createdBy: actor.actor_id,
        visibility,
        ...(args.internalWritePath !== undefined
          ? { internalWritePath: args.internalWritePath }
          : {}),
      });

      if (inserted.inserted) {
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: 'entity_link.created',
          subject_type: 'entity_link',
          subject_id: inserted.row.id,
          summary: 'Entity link created',
          detail: {
            link_id: inserted.row.id,
            source,
            target,
            relation_type: args.relation_type,
            visibility,
          },
        });
      }

      return inserted;
    };

    const result = args.tx ? await persist(args.tx) : await deps.db.transaction(persist);

    const targetSummary = await getTargetInternalSummary(deps.providers, db, actor, result.row);

    return {
      link: toAllowedDto(result.row, targetSummary),
      status: result.inserted ? 201 : 200,
    };
  }

  async function canReadEndpoint(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
  }): Promise<boolean> {
    const { actor, endpoint } = args;
    const provider = providerFor(deps.providers, endpoint.type);
    const focus = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
    if (!focus) return false;
    return provider.canRead(deps, actor, focus);
  }

  async function listLinks(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
    side?: 'source' | 'target';
    /** Default 'not_found': GET /entity-links must not leak existence. */
    onUnreadableFocus?: 'not_found' | 'empty';
  }): Promise<EntityLinkDto[]> {
    const { actor, endpoint, side } = args;
    const provider = providerFor(deps.providers, endpoint.type);
    const focus = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
    if (!focus) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }
    const focusAllowed = await provider.canRead(deps, actor, focus);
    if (!focusAllowed) {
      if (args.onUnreadableFocus === 'empty') {
        return [];
      }
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const listArgs = {
      workspaceId: actor.workspace_id,
      endpointType: endpoint.type,
      endpointId: endpoint.id,
    };
    const rows = await selectActiveLinksForEndpoint(
      deps.db,
      side === undefined ? listArgs : { ...listArgs, side },
    );

    const resolvedByEndpoint = new Map<string, LinkEndpointRow | null>([
      [`${endpoint.type}:${endpoint.id}`, focus],
    ]);
    const { reporterSummaries, sourceReadabilityByEndpoint } = await preloadReporterSummaries(
      deps,
      actor,
      rows,
      resolvedByEndpoint,
    );
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      if (
        !isListVisibleTuple({
          sourceType: row.source_type,
          targetType: row.target_type,
          relationType: row.relation_type,
        })
      ) {
        continue;
      }
      const { decision, summary } = await evaluateRowVisibility(
        deps,
        actor,
        row,
        resolvedByEndpoint,
        reporterSummaries,
        sourceReadabilityByEndpoint,
      );
      const targetSummary =
        decision === 'allowed'
          ? await getTargetInternalSummary(deps.providers, deps.db, actor, row)
          : undefined;
      items.push(toDtoForDecision(row, decision, summary, targetSummary));
    }
    return items;
  }

  async function listInventoryLinks(args: {
    actor: EntityLinksActor;
    statuses?: EntityLinkRow['status'][];
    relationType?: EntityLinkRelationType;
    managedSystemId?: string;
  }): Promise<EntityLinkDto[]> {
    const { actor } = args;
    const rows = await selectLinksByWorkspace(deps.db, {
      workspaceId: actor.workspace_id,
      ...(args.statuses !== undefined ? { statuses: args.statuses } : {}),
      ...(args.relationType !== undefined ? { relationType: args.relationType } : {}),
      ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
    });

    const resolvedByEndpoint = new Map<string, LinkEndpointRow | null>();
    const { reporterSummaries, sourceReadabilityByEndpoint } = await preloadReporterSummaries(
      deps,
      actor,
      rows,
      resolvedByEndpoint,
    );
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      if (
        !isListVisibleTuple({
          sourceType: row.source_type,
          targetType: row.target_type,
          relationType: row.relation_type,
        })
      ) {
        continue;
      }
      const { decision, summary } = await evaluateRowVisibility(
        deps,
        actor,
        row,
        resolvedByEndpoint,
        reporterSummaries,
        sourceReadabilityByEndpoint,
      );
      const targetSummary =
        decision === 'allowed'
          ? await getTargetInternalSummary(deps.providers, deps.db, actor, row)
          : undefined;
      items.push(toDtoForDecision(row, decision, summary, targetSummary));
    }
    return items;
  }

  async function detachLink(args: {
    actor: EntityLinksActor;
    linkId: string;
    reason: string;
  }): Promise<DetachedEntityLinkResponse> {
    const { actor, linkId, reason } = args;

    const link = await selectEntityLinkById(deps.db, {
      workspaceId: actor.workspace_id,
      linkId,
    });
    if (
      !link ||
      !isCreatableTuple({
        sourceType: link.source_type,
        targetType: link.target_type,
        relationType: link.relation_type,
      })
    ) {
      throw new HttpError('not_found.record', 'entity link not found');
    }
    const sourceProvider = providerFor(deps.providers, link.source_type);
    const targetProvider = providerFor(deps.providers, link.target_type);
    const [sourceRow, targetRow] = await Promise.all([
      sourceProvider.getPermissionSubject(deps.db, actor.workspace_id, link.source_id),
      targetProvider.getPermissionSubject(deps.db, actor.workspace_id, link.target_id),
    ]);
    if (!sourceRow || !targetRow) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const [sourceAllowed, targetAllowed] = await Promise.all([
      sourceProvider.canRead(deps, actor, sourceRow),
      targetProvider.canRead(deps, actor, targetRow),
    ]);
    if (!sourceAllowed || !targetAllowed) {
      throw new HttpError('not_found.record', 'entity link not found');
    }
    if (link.status !== 'active') {
      throw new HttpError('conflict.stale_write', 'entity link is no longer active');
    }

    const detached = await deps.db.transaction(async (tx) => {
      const updated = await detachEntityLink(tx, {
        workspaceId: actor.workspace_id,
        linkId,
        actorId: actor.actor_id,
        reason,
      });
      if (!updated) {
        throw new HttpError('conflict.stale_write', 'entity link is no longer active');
      }

      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'entity_link.detached',
        subject_type: 'entity_link',
        subject_id: updated.id,
        summary: 'Entity link detached',
        detail: {
          link_id: updated.id,
          source: { type: updated.source_type, id: updated.source_id },
          target: { type: updated.target_type, id: updated.target_id },
          relation_type: updated.relation_type,
          reason,
        },
      });

      return updated;
    });

    return toDetachedResponse(detached);
  }

  return { createLink, canReadEndpoint, listLinks, listInventoryLinks, detachLink };
}

export type EntityLinksService = ReturnType<typeof createEntityLinksService>;
