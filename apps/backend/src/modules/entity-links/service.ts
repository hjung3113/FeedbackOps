import type {
  DetachedEntityLinkResponse,
  EntityLinkDto,
  EntityLinkEntityType,
  EntityLinkRef,
  EntityLinkRelationType,
  EntityLinkVisibilityState,
  TaskReporterSummary,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { type FindingReadRow, findFindingById } from '../findings/repo-read.js';
import type { CheckService } from '../permissions/check-service.js';
import { findTaskRequestById, type TaskRequestRow } from '../task-requests/repo.js';
import { findVocClusterById } from '../voc-clusters/repo.js';
import { type LinkVisibilityDecision, evaluateLinkVisibility } from './evaluate-visibility.js';
import {
  type EntityLinkRow,
  type LinkEndpointRow,
  detachEntityLink,
  insertActiveEntityLink,
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

type ReporterSummaryResult =
  | { available: false }
  | { available: true; summary: TaskReporterSummary };

interface EntityLinkProvider {
  entityType: EntityLinkEntityType;
  assertExists(db: Db, workspaceId: string, id: string): Promise<LinkEndpointRow | null>;
  getPermissionSubject(db: Db, workspaceId: string, id: string): Promise<LinkEndpointRow | null>;
  canRead(
    deps: Pick<EntityLinksServiceDeps, 'checkService'>,
    actor: EntityLinksActor,
    subject: LinkEndpointRow,
  ): Promise<boolean>;
  canCreateTarget?(
    deps: Pick<EntityLinksServiceDeps, 'checkService'>,
    actor: EntityLinksActor,
    subject: LinkEndpointRow,
  ): Promise<boolean>;
  getReporterSummary(id: string): Promise<ReporterSummaryResult>;
  getInternalSummary(db: Db, workspaceId: string, id: string): Promise<unknown | null>;
  listExpectedLinks(id: string): Promise<EntityLinkRef[]>;
}

function findingToInternalSummary(row: FindingReadRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    evidence_count: row.evidence_count,
  };
}

function taskRequestToInternalSummary(row: TaskRequestRow): Record<string, unknown> {
  return {
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    evidence_summary: row.evidence_summary,
    requested_outcome: row.requested_outcome,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    requester_actor_id: row.requester_actor_id,
  };
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
  subject: LinkEndpointRow,
): Promise<boolean> {
  if (subject.reporter_id && actor.actor_id === subject.reporter_id) return true;
  const decision = await deps.checkService.checkCapability(actor, 'voc.read', {
    workspace_id: actor.workspace_id,
    managed_system_id: subject.managed_system_id,
  });
  return decision.allow;
}

async function assertFindingReadScope(
  deps: Pick<EntityLinksServiceDeps, 'checkService'>,
  actor: EntityLinksActor,
  managedSystemId: string,
): Promise<boolean> {
  if (actor.role_level === 'admin') return true;
  const decision = await deps.checkService.checkCapability(actor, 'finding.read', {
    workspace_id: actor.workspace_id,
    managed_system_id: managedSystemId,
  });
  return decision.allow;
}

async function assertFindingManageScope(
  deps: Pick<EntityLinksServiceDeps, 'checkService'>,
  actor: EntityLinksActor,
  managedSystemId: string,
): Promise<boolean> {
  if (actor.role_level === 'admin') return true;
  const decision = await deps.checkService.checkCapability(actor, 'finding.manage', {
    workspace_id: actor.workspace_id,
    managed_system_id: managedSystemId,
  });
  return decision.allow;
}

const unavailableReporterSummary = async (): Promise<ReporterSummaryResult> => ({
  available: false,
});

const entityLinkProviders: Record<EntityLinkEntityType, EntityLinkProvider> = {
  voc: {
    entityType: 'voc',
    assertExists: resolveVocEndpoint,
    getPermissionSubject: resolveVocEndpoint,
    canRead: assertVocReadScope,
    getReporterSummary: unavailableReporterSummary,
    getInternalSummary: async () => null,
    listExpectedLinks: async () => [],
  },
  finding: {
    entityType: 'finding',
    assertExists: async (db, workspaceId, id) => {
      const finding = await findFindingById(db, { workspaceId, findingId: id });
      if (!finding) return null;
      return {
        workspace_id: finding.workspace_id,
        managed_system_id: finding.primary_managed_system_id,
        reporter_id: null,
      };
    },
    getPermissionSubject: async (db, workspaceId, id) => {
      const finding = await findFindingById(db, { workspaceId, findingId: id });
      if (!finding) return null;
      return {
        workspace_id: finding.workspace_id,
        managed_system_id: finding.primary_managed_system_id,
        reporter_id: null,
      };
    },
    canRead: (deps, actor, subject) =>
      assertFindingReadScope(deps, actor, subject.managed_system_id),
    canCreateTarget: (deps, actor, subject) =>
      assertFindingManageScope(deps, actor, subject.managed_system_id),
    getReporterSummary: unavailableReporterSummary,
    getInternalSummary: async (db, workspaceId, id) => {
      const finding = await findFindingById(db, { workspaceId, findingId: id });
      return finding ? findingToInternalSummary(finding) : null;
    },
    listExpectedLinks: async () => [],
  },
  voc_cluster: {
    entityType: 'voc_cluster',
    assertExists: async (db, workspaceId, id) => {
      const cluster = await findVocClusterById(db, { workspaceId, clusterId: id });
      if (!cluster) return null;
      return {
        workspace_id: cluster.workspace_id,
        managed_system_id: cluster.primary_managed_system_id,
        reporter_id: null,
      };
    },
    getPermissionSubject: async (db, workspaceId, id) => {
      const cluster = await findVocClusterById(db, { workspaceId, clusterId: id });
      if (!cluster) return null;
      return {
        workspace_id: cluster.workspace_id,
        managed_system_id: cluster.primary_managed_system_id,
        reporter_id: null,
      };
    },
    canRead: (deps, actor, subject) =>
      assertFindingReadScope(deps, actor, subject.managed_system_id),
    canCreateTarget: (deps, actor, subject) =>
      assertFindingManageScope(deps, actor, subject.managed_system_id),
    getReporterSummary: unavailableReporterSummary,
    getInternalSummary: async () => null,
    listExpectedLinks: async () => [],
  },
  task_request: {
    entityType: 'task_request',
    assertExists: async (db, workspaceId, id) => {
      const request = await findTaskRequestById(db, { workspaceId, taskRequestId: id });
      if (!request) return null;
      return {
        workspace_id: request.workspace_id,
        managed_system_id: request.primary_managed_system_id,
        reporter_id: null,
      };
    },
    getPermissionSubject: async (db, workspaceId, id) => {
      const request = await findTaskRequestById(db, { workspaceId, taskRequestId: id });
      if (!request) return null;
      return {
        workspace_id: request.workspace_id,
        managed_system_id: request.primary_managed_system_id,
        reporter_id: null,
      };
    },
    canRead: (deps, actor, subject) =>
      assertFindingReadScope(deps, actor, subject.managed_system_id),
    canCreateTarget: (deps, actor, subject) =>
      assertFindingManageScope(deps, actor, subject.managed_system_id),
    getReporterSummary: unavailableReporterSummary,
    getInternalSummary: async (db, workspaceId, id) => {
      const request = await findTaskRequestById(db, { workspaceId, taskRequestId: id });
      return request ? taskRequestToInternalSummary(request) : null;
    },
    listExpectedLinks: async () => [],
  },
};

function providerFor(type: EntityLinkEntityType): EntityLinkProvider {
  return entityLinkProviders[type];
}

function isCreatableTuple(input: {
  sourceType: EntityLinkEntityType;
  targetType: EntityLinkEntityType;
  relationType: EntityLinkRelationType;
}): boolean {
  return (
    (input.sourceType === 'voc' &&
      input.targetType === 'voc' &&
      input.relationType === 'related_to') ||
    (input.sourceType === 'voc' &&
      input.targetType === 'finding' &&
      input.relationType === 'created_finding') ||
    (input.sourceType === 'voc' &&
      input.targetType === 'finding' &&
      input.relationType === 'evidence_of') ||
    (input.sourceType === 'voc_cluster' &&
      input.targetType === 'finding' &&
      input.relationType === 'created_finding') ||
    (input.sourceType === 'finding' &&
      input.targetType === 'task_request' &&
      input.relationType === 'requested_task')
  );
}

async function resolveEndpointForRow(
  deps: Pick<EntityLinksServiceDeps, 'db'>,
  actor: EntityLinksActor,
  endpoint: EntityLinkRef,
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
): Promise<LinkEndpointRow | null> {
  const key = `${endpoint.type}:${endpoint.id}`;
  if (resolvedByEndpoint.has(key)) return resolvedByEndpoint.get(key) ?? null;
  const provider = providerFor(endpoint.type);
  const row = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
  resolvedByEndpoint.set(key, row);
  return row;
}

async function evaluateRowVisibility(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService'>,
  actor: EntityLinksActor,
  row: EntityLinkRow,
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
): Promise<LinkVisibilityDecision> {
  if (
    !isCreatableTuple({
      sourceType: row.source_type,
      targetType: row.target_type,
      relationType: row.relation_type,
    })
  ) {
    return 'hidden';
  }

  const sourceRef = { type: row.source_type, id: row.source_id };
  const targetRef = { type: row.target_type, id: row.target_id };
  const [source, target] = await Promise.all([
    resolveEndpointForRow(deps, actor, sourceRef, resolvedByEndpoint),
    resolveEndpointForRow(deps, actor, targetRef, resolvedByEndpoint),
  ]);
  const sourceProvider = providerFor(row.source_type);
  const targetProvider = providerFor(row.target_type);
  const [sourceReadable, targetReadable] = await Promise.all([
    source ? sourceProvider.canRead(deps, actor, source) : Promise.resolve(false),
    target ? targetProvider.canRead(deps, actor, target) : Promise.resolve(false),
  ]);
  const targetSummary = await targetProvider.getReporterSummary(row.target_id);

  return evaluateLinkVisibility({
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
}

export function createEntityLinksService(deps: EntityLinksServiceDeps) {
  async function createLink(args: {
    actor: EntityLinksActor;
    source: EntityLinkRef;
    target: EntityLinkRef;
    relation_type: EntityLinkRelationType;
    visibility?: 'internal_only';
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

    const db = args.tx ?? deps.db;
    const sourceProvider = providerFor(source.type);
    const targetProvider = providerFor(target.type);
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

    return { link: toAllowedDto(result.row), status: result.inserted ? 201 : 200 };
  }

  async function listLinks(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
    side?: 'source' | 'target';
  }): Promise<EntityLinkDto[]> {
    const { actor, endpoint, side } = args;
    const provider = providerFor(endpoint.type);
    const focus = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
    if (!focus) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }
    const focusAllowed = await provider.canRead(deps, actor, focus);
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

    const resolvedByEndpoint = new Map<string, LinkEndpointRow | null>([
      [`${endpoint.type}:${endpoint.id}`, focus],
    ]);
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      const decision = await evaluateRowVisibility(deps, actor, row, resolvedByEndpoint);
      items.push(toDtoForDecision(row, decision));
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
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      const decision = await evaluateRowVisibility(deps, actor, row, resolvedByEndpoint);
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
      !isCreatableTuple({
        sourceType: link.source_type,
        targetType: link.target_type,
        relationType: link.relation_type,
      })
    ) {
      throw new HttpError('validation.failed', 'unsupported entity link tuple', {
        fields: [{ path: [], code: 'unsupported_tuple' }],
      });
    }
    const sourceProvider = providerFor(link.source_type);
    const targetProvider = providerFor(link.target_type);
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

  return { createLink, listLinks, listInventoryLinks, detachLink };
}

export type EntityLinksService = ReturnType<typeof createEntityLinksService>;
