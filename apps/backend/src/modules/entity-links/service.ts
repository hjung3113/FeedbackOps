import { taskReporterSummarySchema, taskStatusSchema } from '@fops/shared';
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
  TaskStatus,
} from '@fops/shared';
import { isRegisteredEntityLinkPair, registeredEntityLinkPairs } from '@fops/shared';
import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { checkFindingManage, checkFindingRead } from '../findings/authorization.js';
import { type FindingReadRow, findFindingById } from '../findings/repo-read.js';
import type { CheckService } from '../permissions/check-service.js';
import { type TaskRequestRow, findTaskRequestById } from '../task-requests/repo.js';
import { type TaskRow, findTaskById } from '../tasks/index.js';
import { type VocClusterRow, findVocClusterById } from '../voc-clusters/repo.js';
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
    deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService'>,
    actor: EntityLinksActor,
    subject: LinkEndpointRow,
  ): Promise<boolean>;
  canCreateTarget?(
    deps: Pick<EntityLinksServiceDeps, 'checkService'>,
    actor: EntityLinksActor,
    subject: LinkEndpointRow,
  ): Promise<boolean>;
  getReporterSummary(db: Db, workspaceId: string, id: string): Promise<ReporterSummaryResult>;
  getReporterSummaries?(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ReporterSummaryResult>>;
  getInternalSummary(
    db: Db,
    workspaceId: string,
    id: string,
  ): Promise<EntityLinkTargetSummary | null>;
  listExpectedLinks(id: string): Promise<EntityLinkRef[]>;
}

function findingToInternalSummary(row: FindingReadRow): EntityLinkTargetSummary {
  return {
    type: 'finding',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    evidence_count: row.evidence_count,
  };
}

function taskRequestToInternalSummary(row: TaskRequestRow): EntityLinkTargetSummary {
  return {
    type: 'task_request',
    id: row.id,
    display_id: row.display_id,
    source_type: row.source_type,
    source_id: row.source_id,
    evidence_summary: row.evidence_summary,
    requested_outcome: row.requested_outcome,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    requester_actor_id: row.requester_actor_id,
  };
}

function taskToInternalSummary(row: TaskRow): EntityLinkTargetSummary {
  return {
    type: 'task',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    primary_managed_system_id: row.primary_managed_system_id,
    assignee_actor_id: row.assignee_actor_id,
    due_date: row.due_date,
  };
}

function clusterToInternalSummary(row: VocClusterRow): EntityLinkTargetSummary {
  return {
    type: 'voc_cluster',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
  };
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

async function assertVocReadScope(
  deps: Pick<EntityLinksServiceDeps, 'checkService'>,
  actor: EntityLinksActor,
  subject: LinkEndpointRow,
): Promise<boolean> {
  if (subject.reporter_id && actor.actor_id === subject.reporter_id) return true;
  const readDecision = await deps.checkService.checkCapability(actor, 'voc.read', {
    workspace_id: actor.workspace_id,
    managed_system_id: subject.managed_system_id,
  });
  if (readDecision.allow) return true;

  const triageDecision = await deps.checkService.checkCapability(actor, 'voc.triage', {
    workspace_id: actor.workspace_id,
    managed_system_id: subject.managed_system_id,
  });
  return triageDecision.allow;
}

async function assertFindingReadScope(
  deps: Pick<EntityLinksServiceDeps, 'checkService'>,
  actor: EntityLinksActor,
  managedSystemId: string,
): Promise<boolean> {
  const decision = await checkFindingRead(deps.checkService, actor, managedSystemId, {
    requireElevatedRole: false,
  });
  return decision.allow;
}

async function assertFindingManageScope(
  deps: Pick<EntityLinksServiceDeps, 'checkService'>,
  actor: EntityLinksActor,
  managedSystemId: string,
): Promise<boolean> {
  const decision = await checkFindingManage(deps.checkService, actor, managedSystemId, {
    requireElevatedRole: false,
  });
  return decision.allow;
}

const unavailableReporterSummary = async (
  _db: Db,
  _workspaceId: string,
  _id: string,
): Promise<ReporterSummaryResult> => ({
  available: false,
});

function assertNever(value: never): never {
  throw new Error(`unrecognized Task status in reporter summary: ${String(value)}`);
}

function projectTaskStatusForReporter(status: TaskStatus): string {
  switch (status) {
    case 'backlog':
    case 'todo':
      return '진행 예정';
    case 'doing':
    case 'review':
      return '진행 중';
    case 'done':
      return '해결 준비 중';
    case 'released':
      return '반영됨';
    case 'reopened':
      return '다시 처리 중';
    default:
      return assertNever(status);
  }
}

function toTaskReporterSummary(task: { title: string; status: unknown }): TaskReporterSummary | undefined {
  const parsedStatus = taskStatusSchema.safeParse(task.status);
  if (!parsedStatus.success) return undefined;
  return taskReporterSummarySchema.parse({
    target_type: 'task',
    public_title: task.title,
    reporter_facing_status: projectTaskStatusForReporter(parsedStatus.data),
  });
}

async function getTaskReporterSummary(
  db: Db,
  workspaceId: string,
  taskId: string,
): Promise<ReporterSummaryResult> {
  const result = await db.execute<{ title: string; status: unknown }>(sql`
    SELECT title, status
      FROM task.tasks
     WHERE id = ${taskId}
       AND workspace_id = ${workspaceId}
     LIMIT 1
  `);
  const task = result.rows[0];
  if (!task) return { available: false };

  const summary = toTaskReporterSummary(task);
  return summary ? { available: true, summary } : { available: false };
}

async function getTaskReporterSummaries(
  db: Db,
  workspaceId: string,
  taskIds: readonly string[],
): Promise<Map<string, ReporterSummaryResult>> {
  if (taskIds.length === 0) return new Map();

  const result = await db.execute<{ id: string; title: string; status: unknown }>(sql`
    SELECT id, title, status
      FROM task.tasks
     WHERE workspace_id = ${workspaceId}
       AND id IN (${sql.join(
         taskIds.map((id) => sql`${id}`),
         sql`, `,
       )})
  `);
  return new Map(
    result.rows.map((task) => {
      const summary = toTaskReporterSummary(task);
      return [
        task.id,
        summary
          ? ({ available: true, summary } satisfies ReporterSummaryResult)
          : ({ available: false } satisfies ReporterSummaryResult),
      ];
    }),
  );
}

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
    getInternalSummary: async (db, workspaceId, id) => {
      const cluster = await findVocClusterById(db, { workspaceId, clusterId: id });
      return cluster ? clusterToInternalSummary(cluster) : null;
    },
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
  task: {
    entityType: 'task',
    assertExists: async (db, workspaceId, id) => {
      const task = await findTaskById(db, { workspaceId, taskId: id });
      if (!task) return null;
      return {
        workspace_id: task.workspace_id,
        managed_system_id: task.primary_managed_system_id,
        reporter_id: null,
      };
    },
    getPermissionSubject: async (db, workspaceId, id) => {
      const task = await findTaskById(db, { workspaceId, taskId: id });
      if (!task) return null;
      return {
        workspace_id: task.workspace_id,
        managed_system_id: task.primary_managed_system_id,
        reporter_id: null,
      };
    },
    canRead: (deps, actor, subject) =>
      assertFindingReadScope(deps, actor, subject.managed_system_id),
    canCreateTarget: (deps, actor, subject) =>
      assertFindingManageScope(deps, actor, subject.managed_system_id),
    getReporterSummary: getTaskReporterSummary,
    getReporterSummaries: getTaskReporterSummaries,
    getInternalSummary: async (db, workspaceId, id) => {
      const task = await findTaskById(db, { workspaceId, taskId: id });
      return task ? taskToInternalSummary(task) : null;
    },
    listExpectedLinks: async () => [],
  },
};

function providerFor(type: EntityLinkEntityType): EntityLinkProvider {
  return entityLinkProviders[type];
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
    ),
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
  reporterSummaries: ReadonlyMap<string, ReporterSummaryResult>,
  sourceReadabilityByEndpoint: Map<string, boolean>,
): Promise<{ decision: LinkVisibilityDecision; summary?: TaskReporterSummary }> {
  const sourceRef = { type: row.source_type, id: row.source_id };
  const targetRef = { type: row.target_type, id: row.target_id };
  const [source, target] = await Promise.all([
    resolveEndpointForRow(deps, actor, sourceRef, resolvedByEndpoint),
    resolveEndpointForRow(deps, actor, targetRef, resolvedByEndpoint),
  ]);
  const sourceProvider = providerFor(row.source_type);
  const targetSummary: ReporterSummaryResult = reporterSummaries.get(
    `${row.target_type}:${row.target_id}`,
  ) ?? { available: false };
  const sourceKey = `${row.source_type}:${row.source_id}`;
  const cachedSourceReadable = sourceReadabilityByEndpoint.get(sourceKey);
  const [sourceReadable, targetReadable] = await Promise.all([
    cachedSourceReadable ?? (source ? sourceProvider.canRead(deps, actor, source) : false),
    target ? providerFor(row.target_type).canRead(deps, actor, target) : false,
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
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService'>,
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
        ? await providerFor(sourceRef.type).canRead(deps, actor, source)
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
  const summaries = await entityLinkProviders.task.getReporterSummaries?.(
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
  db: Db | Tx,
  actor: EntityLinksActor,
  row: Pick<EntityLinkRow, 'target_type' | 'target_id'>,
): Promise<EntityLinkTargetSummary | undefined> {
  const summary = await providerFor(row.target_type).getInternalSummary(
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

    const targetSummary = await getTargetInternalSummary(db, actor, result.row);

    return {
      link: toAllowedDto(result.row, targetSummary),
      status: result.inserted ? 201 : 200,
    };
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
        decision === 'allowed' ? await getTargetInternalSummary(deps.db, actor, row) : undefined;
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
        decision === 'allowed' ? await getTargetInternalSummary(deps.db, actor, row) : undefined;
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
