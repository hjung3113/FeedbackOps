import type {
  DetachedEntityLinkResponse,
  EntityLinkDto,
  EntityLinkRef,
  EntityLinkVisibilityState,
  TaskReporterSummary,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { type LinkVisibilityDecision, evaluateLinkVisibility } from './evaluate-visibility.js';
import {
  type EntityLinkRow,
  type LinkEndpointRow,
  detachVocRelatedToLink,
  insertActiveVocRelatedToLink,
  resolveVocEndpoint,
  selectActiveLinksForEndpoint,
  selectEntityLinkById,
  selectLinksByWorkspace,
} from './repo.js';

export interface EntityLinksActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface EntityLinksServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
}

function toAllowedDto(row: EntityLinkRow): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    target_type: row.target_type,
    target_id: row.target_id,
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
): EntityLinkDto {
  if (decision === 'allowed') return toAllowedDto(row);
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

async function assertVocReadScope(
  deps: Pick<EntityLinksServiceDeps, 'checkService'>,
  actor: EntityLinksActor,
  managedSystemId: string,
): Promise<boolean> {
  const decision = await deps.checkService.checkCapability(actor, 'voc.read', {
    workspace_id: actor.workspace_id,
    managed_system_id: managedSystemId,
  });
  return decision.allow;
}

async function resolveEndpointForRow(
  deps: Pick<EntityLinksServiceDeps, 'db'>,
  actor: EntityLinksActor,
  vocId: string,
  resolvedByVocId: Map<string, LinkEndpointRow | null>,
): Promise<LinkEndpointRow | null> {
  if (resolvedByVocId.has(vocId)) return resolvedByVocId.get(vocId) ?? null;
  const endpoint = await resolveVocEndpoint(deps.db, actor.workspace_id, vocId);
  resolvedByVocId.set(vocId, endpoint);
  return endpoint;
}

async function evaluateRowVisibility(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService'>,
  actor: EntityLinksActor,
  row: EntityLinkRow,
  resolvedByVocId: Map<string, LinkEndpointRow | null>,
): Promise<LinkVisibilityDecision> {
  if (
    row.source_type !== 'voc' ||
    row.target_type !== 'voc' ||
    row.relation_type !== 'related_to'
  ) {
    return 'hidden';
  }

  const [source, target] = await Promise.all([
    resolveEndpointForRow(deps, actor, row.source_id, resolvedByVocId),
    resolveEndpointForRow(deps, actor, row.target_id, resolvedByVocId),
  ]);
  const [sourceReadable, targetReadable] = await Promise.all([
    source ? assertVocReadScope(deps, actor, source.managed_system_id) : Promise.resolve(false),
    target ? assertVocReadScope(deps, actor, target.managed_system_id) : Promise.resolve(false),
  ]);

  return evaluateLinkVisibility({
    visibility: row.visibility,
    actorContext: {
      actor_id: actor.actor_id,
      role_level: actor.role_level,
    },
    sourceReadable,
    targetReadable,
    targetSummaryAvailable: false,
    sourceReporterId: source?.reporter_id ?? null,
    targetReporterId: target?.reporter_id ?? null,
  });
}

export function createEntityLinksService(deps: EntityLinksServiceDeps) {
  async function createLink(args: {
    actor: EntityLinksActor;
    source: EntityLinkRef;
    target: EntityLinkRef;
    relation_type: 'related_to';
    visibility?: 'internal_only';
  }): Promise<{ link: EntityLinkDto; status: 200 | 201 }> {
    const { actor, source, target } = args;
    const visibility = args.visibility ?? 'internal_only';

    if (source.type !== 'voc' || target.type !== 'voc' || args.relation_type !== 'related_to') {
      throw new HttpError('validation.failed', 'unsupported entity link tuple', {
        fields: [{ path: [], code: 'unsupported_tuple' }],
      });
    }
    if (visibility !== 'internal_only') {
      throw new HttpError('validation.failed', 'unsupported visibility', {
        fields: [{ path: ['visibility'], code: 'unsupported_visibility' }],
      });
    }
    if (source.id === target.id) {
      throw new HttpError('validation.failed', 'entity link source and target must differ', {
        fields: [{ path: ['target', 'id'], code: 'self_link' }],
      });
    }

    const [sourceRow, targetRow] = await Promise.all([
      resolveVocEndpoint(deps.db, actor.workspace_id, source.id),
      resolveVocEndpoint(deps.db, actor.workspace_id, target.id),
    ]);
    if (!sourceRow || !targetRow) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const sourceAllowed = await assertVocReadScope(deps, actor, sourceRow.managed_system_id);
    if (!sourceAllowed) {
      throw new HttpError('permission.denied', 'missing source VOC read scope');
    }

    const targetAllowed = await assertVocReadScope(deps, actor, targetRow.managed_system_id);
    if (!targetAllowed) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const result = await deps.db.transaction(async (tx) => {
      const inserted = await insertActiveVocRelatedToLink(tx, {
        workspaceId: actor.workspace_id,
        sourceId: source.id,
        targetId: target.id,
        managedSystemId: sourceRow.managed_system_id,
        createdBy: actor.actor_id,
        visibility,
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
    });

    return { link: toAllowedDto(result.row), status: result.inserted ? 201 : 200 };
  }

  async function listLinks(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
    side?: 'source' | 'target';
  }): Promise<EntityLinkDto[]> {
    const { actor, endpoint, side } = args;
    if (endpoint.type !== 'voc') {
      throw new HttpError('validation.failed', 'unsupported entity type', {
        fields: [{ path: ['type'], code: 'unsupported_entity_type' }],
      });
    }

    const focus = await resolveVocEndpoint(deps.db, actor.workspace_id, endpoint.id);
    if (!focus) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }
    const focusAllowed = await assertVocReadScope(deps, actor, focus.managed_system_id);
    if (!focusAllowed) {
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

    const resolvedByVocId = new Map<string, LinkEndpointRow | null>([[endpoint.id, focus]]);
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      const decision = await evaluateRowVisibility(deps, actor, row, resolvedByVocId);
      items.push(toDtoForDecision(row, decision));
    }
    return items;
  }

  async function listInventoryLinks(args: {
    actor: EntityLinksActor;
    statuses?: EntityLinkRow['status'][];
    relationType?: 'related_to';
    managedSystemId?: string;
  }): Promise<EntityLinkDto[]> {
    const { actor } = args;
    const rows = await selectLinksByWorkspace(deps.db, {
      workspaceId: actor.workspace_id,
      ...(args.statuses !== undefined ? { statuses: args.statuses } : {}),
      ...(args.relationType !== undefined ? { relationType: args.relationType } : {}),
      ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
    });

    const resolvedByVocId = new Map<string, LinkEndpointRow | null>();
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      const decision = await evaluateRowVisibility(deps, actor, row, resolvedByVocId);
      items.push(toDtoForDecision(row, decision));
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
    if (!link) {
      throw new HttpError('not_found.record', 'entity link not found');
    }
    if (
      link.source_type !== 'voc' ||
      link.target_type !== 'voc' ||
      link.relation_type !== 'related_to'
    ) {
      throw new HttpError('validation.failed', 'unsupported entity link tuple', {
        fields: [{ path: [], code: 'unsupported_tuple' }],
      });
    }
    const [sourceRow, targetRow] = await Promise.all([
      resolveVocEndpoint(deps.db, actor.workspace_id, link.source_id),
      resolveVocEndpoint(deps.db, actor.workspace_id, link.target_id),
    ]);
    if (!sourceRow || !targetRow) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const [sourceAllowed, targetAllowed] = await Promise.all([
      assertVocReadScope(deps, actor, sourceRow.managed_system_id),
      assertVocReadScope(deps, actor, targetRow.managed_system_id),
    ]);
    if (!sourceAllowed || !targetAllowed) {
      throw new HttpError('not_found.record', 'entity link not found');
    }
    if (link.status !== 'active') {
      throw new HttpError('conflict.stale_write', 'entity link is no longer active');
    }

    const detached = await deps.db.transaction(async (tx) => {
      const updated = await detachVocRelatedToLink(tx, {
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

  return { createLink, listLinks, listInventoryLinks, detachLink };
}

export type EntityLinksService = ReturnType<typeof createEntityLinksService>;
