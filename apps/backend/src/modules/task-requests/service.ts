import {
  type ApproveTaskRequestRequest,
  type CreateTaskRequestFromFindingRequest,
  type CreateTaskRequestFromVocClusterRequest,
  type CreateTaskRequestFromVocRequest,
  type EntityLinkEntityType,
  type RejectTaskRequestRequest,
  type RequestMoreEvidenceTaskRequestRequest,
  type TaskRequestDto,
  type TaskRequestSourceType,
  type TaskRequestStatus,
  registeredEntityLinkPairSchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { insertActiveEntityLink, selectActiveLinksForEndpoint } from '../entity-links/repo.js';
import { lockFindingById } from '../findings/repo.js';
import type { CheckService } from '../permissions/check-service.js';
import { lockVocClusterById } from '../voc-clusters/repo.js';
import { selectVocForUpdate } from '../voc/repo.js';
import {
  type TaskRequestRow,
  findTaskRequestById,
  insertTaskRequest,
  listTaskRequestsByWorkspace,
  lockTaskRequestById,
  updateTaskRequestDecision,
} from './repo.js';

export interface TaskRequestsActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface TaskRequestsServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
}

type TaskRequestDecisionAction = 'approve' | 'reject' | 'request_more_evidence';

const ALLOWED_TASK_REQUEST_TRANSITIONS: Record<
  TaskRequestDecisionAction,
  ReadonlyArray<TaskRequestStatus>
> = {
  approve: ['pending_review', 'needs_more_evidence'],
  reject: ['pending_review', 'needs_more_evidence'],
  request_more_evidence: ['pending_review'],
};

const TARGET_STATUS_BY_ACTION: Record<TaskRequestDecisionAction, TaskRequestStatus> = {
  approve: 'approved',
  reject: 'rejected',
  request_more_evidence: 'needs_more_evidence',
};

const EVENT_TYPE_BY_ACTION: Record<
  TaskRequestDecisionAction,
  'task_request_approved' | 'task_request_rejected' | 'task_request_needs_more_evidence'
> = {
  approve: 'task_request_approved',
  reject: 'task_request_rejected',
  request_more_evidence: 'task_request_needs_more_evidence',
};

function taskRequestToDto(
  row: TaskRequestRow,
  source?: { link_id: string; source_id: string; source_type: TaskRequestSourceType },
): TaskRequestDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    source_type: row.source_type,
    source_id: row.source_id,
    primary_managed_system_id: row.primary_managed_system_id,
    evidence_summary: row.evidence_summary,
    requested_outcome: row.requested_outcome,
    requester_actor_id: row.requester_actor_id,
    status: row.status,
    reviewer_actor_id: row.reviewer_actor_id,
    decision_reason: row.decision_reason,
    decided_at: row.decided_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    ...(source
      ? {
          source: {
            type: source.source_type,
            id: source.source_id,
            relation_type: 'requested_task',
            link_id: source.link_id,
          },
        }
      : {}),
  };
}

async function canManageFinding(
  deps: Pick<TaskRequestsServiceDeps, 'checkService'>,
  actor: TaskRequestsActor,
  managedSystemId: string,
  options: Parameters<TaskRequestsServiceDeps['checkService']['checkCapability']>[3],
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

async function canManageVocClusterSource(
  deps: Pick<TaskRequestsServiceDeps, 'checkService'>,
  actor: TaskRequestsActor,
  managedSystemId: string,
  options: Parameters<TaskRequestsServiceDeps['checkService']['checkCapability']>[3],
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
  deps: Pick<TaskRequestsServiceDeps, 'checkService'>,
  actor: TaskRequestsActor,
  managedSystemId: string,
  reporterId: string,
  options: Parameters<TaskRequestsServiceDeps['checkService']['checkCapability']>[3],
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

async function hasSelfApprovalCapability(
  deps: Pick<TaskRequestsServiceDeps, 'checkService'>,
  actor: TaskRequestsActor,
  managedSystemId: string,
  options: Parameters<TaskRequestsServiceDeps['checkService']['checkCapability']>[3],
): Promise<boolean> {
  if (actor.role_level === 'admin') return true;
  const decision = await deps.checkService.checkCapability(
    actor,
    'task_request.self_approve',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
  return decision.allow;
}

function decisionReasonForAction(
  action: TaskRequestDecisionAction,
  input:
    | ApproveTaskRequestRequest
    | RejectTaskRequestRequest
    | RequestMoreEvidenceTaskRequestRequest,
): string | undefined {
  if (action === 'request_more_evidence') {
    return (input as RequestMoreEvidenceTaskRequestRequest).note;
  }
  const reason = (input as ApproveTaskRequestRequest | RejectTaskRequestRequest).reason;
  if (action === 'approve' && reason?.length === 0) return undefined;
  return reason;
}

export function createTaskRequestsService(deps: TaskRequestsServiceDeps) {
  async function sourceLinkForTaskRequest(row: TaskRequestRow): Promise<
    | {
        link_id: string;
        source_id: string;
        source_type: TaskRequestSourceType;
      }
    | undefined
  > {
    const links = await selectActiveLinksForEndpoint(deps.db, {
      workspaceId: row.workspace_id,
      endpointType: 'task_request',
      endpointId: row.id,
      side: 'target',
    });
    const link = links.find(
      (candidate) =>
        candidate.relation_type === 'requested_task' &&
        candidate.target_type === 'task_request' &&
        candidate.target_id === row.id &&
        candidate.source_type === row.source_type,
    );
    return link
      ? {
          link_id: link.id,
          source_id: link.source_id,
          source_type: row.source_type,
        }
      : undefined;
  }

  async function createFromSource(args: {
    tx: Tx;
    actor: TaskRequestsActor;
    sourceType: TaskRequestSourceType;
    sourceId: string;
    primaryManagedSystemId: string;
    input:
      | CreateTaskRequestFromFindingRequest
      | CreateTaskRequestFromVocRequest
      | CreateTaskRequestFromVocClusterRequest;
  }): Promise<TaskRequestDto> {
    const taskRequest = await insertTaskRequest(args.tx, {
      workspaceId: args.actor.workspace_id,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      primaryManagedSystemId: args.primaryManagedSystemId,
      evidenceSummary: args.input.evidence_summary,
      requestedOutcome: args.input.requested_outcome,
      requesterActorId: args.actor.actor_id,
    });

    const requestedTaskTuple = registeredEntityLinkPairSchema.parse({
      source_type: args.sourceType,
      target_type: 'task_request',
      relation_type: 'requested_task',
    });

    const link = await insertActiveEntityLink(args.tx, {
      workspaceId: args.actor.workspace_id,
      sourceType: requestedTaskTuple.source_type,
      sourceId: args.sourceId,
      targetType: requestedTaskTuple.target_type,
      targetId: taskRequest.id,
      relationType: requestedTaskTuple.relation_type,
      managedSystemId: args.primaryManagedSystemId,
      createdBy: args.actor.actor_id,
      visibility: 'internal_only',
    });

    const sourceIdDetailKey =
      args.sourceType === 'finding'
        ? 'source_finding_id'
        : args.sourceType === 'voc'
          ? 'source_voc_id'
          : 'source_voc_cluster_id';
    const auditEventType =
      args.sourceType === 'finding'
        ? 'task_request_created_from_finding'
        : args.sourceType === 'voc'
          ? 'task_request_created_from_voc'
          : 'task_request_created_from_voc_cluster';
    const sourceSummary =
      args.sourceType === 'finding' ? 'Finding' : args.sourceType === 'voc' ? 'VOC' : 'VOC Cluster';

    await deps.auditService.record(args.tx, {
      workspace_id: args.actor.workspace_id,
      actor_id: args.actor.actor_id,
      event_type: auditEventType,
      subject_type: 'task_request',
      subject_id: taskRequest.id,
      summary: `Task Request created from ${sourceSummary}`,
      detail: {
        task_request_id: taskRequest.id,
        [sourceIdDetailKey]: args.sourceId,
        primary_managed_system_id: args.primaryManagedSystemId,
        source_type: args.sourceType,
      },
    });

    if (link.inserted) {
      await deps.auditService.record(args.tx, {
        workspace_id: args.actor.workspace_id,
        actor_id: args.actor.actor_id,
        event_type: 'entity_link.created',
        subject_type: 'entity_link',
        subject_id: link.row.id,
        summary: 'Entity link created',
        detail: {
          link_id: link.row.id,
          source: { type: args.sourceType as EntityLinkEntityType, id: args.sourceId },
          target: { type: 'task_request', id: taskRequest.id },
          relation_type: 'requested_task',
          visibility: 'internal_only',
        },
      });
    }

    return taskRequestToDto(taskRequest, {
      link_id: link.row.id,
      source_id: args.sourceId,
      source_type: args.sourceType,
    });
  }

  async function createFromFinding(args: {
    actor: TaskRequestsActor;
    findingId: string;
    input: CreateTaskRequestFromFindingRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: TaskRequestDto }> {
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const finding = await lockFindingById(tx, {
            workspaceId: args.actor.workspace_id,
            findingId: args.findingId,
          });
          if (!finding) throw new HttpError('not_found.record', 'finding not found');

          const canManage = await canManageFinding(
            deps,
            args.actor,
            finding.primary_managed_system_id,
            { tx },
          );
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          return {
            status: 201,
            body: await createFromSource({
              tx,
              actor: args.actor,
              sourceType: 'finding',
              sourceId: finding.id,
              primaryManagedSystemId: finding.primary_managed_system_id,
              input: args.input,
            }),
          };
        },
      );
    });
  }

  async function createFromVoc(args: {
    actor: TaskRequestsActor;
    vocId: string;
    input: CreateTaskRequestFromVocRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: TaskRequestDto }> {
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const voc = await selectVocForUpdate(tx, args.actor.workspace_id, args.vocId);
          if (!voc || voc.archivedAt !== null) {
            throw new HttpError('not_found.record', 'voc not found');
          }

          const sourceReadable = await canReadSourceVoc(
            deps,
            args.actor,
            voc.primaryManagedSystemId,
            voc.reporterId,
            { tx },
          );
          if (!sourceReadable) {
            throw new HttpError('not_found.record', 'voc not found');
          }

          const canManage = await canManageFinding(deps, args.actor, voc.primaryManagedSystemId, {
            tx,
          });
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          return {
            status: 201,
            body: await createFromSource({
              tx,
              actor: args.actor,
              sourceType: 'voc',
              sourceId: voc.id,
              primaryManagedSystemId: voc.primaryManagedSystemId,
              input: args.input,
            }),
          };
        },
      );
    });
  }

  async function createFromVocCluster(args: {
    actor: TaskRequestsActor;
    clusterId: string;
    input: CreateTaskRequestFromVocClusterRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: TaskRequestDto }> {
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

          const canManage = await canManageVocClusterSource(
            deps,
            args.actor,
            cluster.primary_managed_system_id,
            { tx },
          );
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          return {
            status: 201,
            body: await createFromSource({
              tx,
              actor: args.actor,
              sourceType: 'voc_cluster',
              sourceId: cluster.id,
              primaryManagedSystemId: cluster.primary_managed_system_id,
              input: args.input,
            }),
          };
        },
      );
    });
  }

  async function resolveEndpoint(args: {
    tx?: Tx;
    workspaceId: string;
    taskRequestId: string;
  }): Promise<TaskRequestRow | null> {
    return findTaskRequestById(args.tx ?? deps.db, {
      workspaceId: args.workspaceId,
      taskRequestId: args.taskRequestId,
    });
  }

  async function listTaskRequests(args: {
    actor: TaskRequestsActor;
    status?: TaskRequestStatus;
  }): Promise<{ items: TaskRequestDto[] }> {
    if (args.actor.role_level !== 'admin' && args.actor.role_level !== 'developer') {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }

    const rows = await listTaskRequestsByWorkspace(deps.db, {
      workspaceId: args.actor.workspace_id,
      ...(args.status !== undefined ? { status: args.status } : {}),
    });
    const items: TaskRequestDto[] = [];
    for (const row of rows) {
      const canManage = await canManageFinding(deps, args.actor, row.primary_managed_system_id, {});
      if (!canManage) continue;
      items.push(taskRequestToDto(row, await sourceLinkForTaskRequest(row)));
    }
    return { items };
  }

  async function recordSelfApprovalDenied(args: {
    actor: TaskRequestsActor;
    taskRequest: TaskRequestRow;
    reasonPresent: boolean;
    capabilityPresent: boolean;
  }): Promise<void> {
    await deps.db.transaction(async (tx) => {
      await deps.auditService.record(tx, {
        workspace_id: args.actor.workspace_id,
        actor_id: args.actor.actor_id,
        event_type: 'task_request_self_approval_denied',
        subject_type: 'task_request',
        subject_id: args.taskRequest.id,
        summary: 'Task Request self-approval denied',
        detail: {
          task_request_id: args.taskRequest.id,
          requester_actor_id: args.taskRequest.requester_actor_id,
          reason_present: args.reasonPresent,
          capability_present: args.capabilityPresent,
        },
      });
    });
  }

  async function decideTaskRequest(args: {
    actor: TaskRequestsActor;
    taskRequestId: string;
    action: TaskRequestDecisionAction;
    input:
      | ApproveTaskRequestRequest
      | RejectTaskRequestRequest
      | RequestMoreEvidenceTaskRequestRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: TaskRequestDto }> {
    const targetStatus = TARGET_STATUS_BY_ACTION[args.action];
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          if (args.actor.role_level !== 'admin' && args.actor.role_level !== 'developer') {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          const taskRequest = await lockTaskRequestById(tx, {
            workspaceId: args.actor.workspace_id,
            taskRequestId: args.taskRequestId,
          });
          if (!taskRequest) throw new HttpError('not_found.record', 'task request not found');

          const canManage = await canManageFinding(
            deps,
            args.actor,
            taskRequest.primary_managed_system_id,
            { tx },
          );
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          const reasonOrNote = decisionReasonForAction(args.action, args.input);
          const reasonPresent = (reasonOrNote?.trim().length ?? 0) > 0;

          if (args.action === 'approve' && taskRequest.requester_actor_id === args.actor.actor_id) {
            const capabilityPresent = await hasSelfApprovalCapability(
              deps,
              args.actor,
              taskRequest.primary_managed_system_id,
              { tx },
            );
            if (!reasonPresent || !capabilityPresent) {
              await recordSelfApprovalDenied({
                actor: args.actor,
                taskRequest,
                reasonPresent,
                capabilityPresent,
              });
              throw new HttpError(
                'permission.denied',
                'self-approval requires a reason and task_request.self_approve capability',
              );
            }
          }

          if (taskRequest.status === targetStatus) {
            return { status: 200, body: taskRequestToDto(taskRequest) };
          }

          if (!ALLOWED_TASK_REQUEST_TRANSITIONS[args.action].includes(taskRequest.status)) {
            throw new HttpError('validation.failed', 'invalid task request status transition', {
              fields: [{ path: ['status'], code: 'invalid_transition' }],
            });
          }

          const updated = await updateTaskRequestDecision(tx, {
            workspaceId: args.actor.workspace_id,
            taskRequestId: taskRequest.id,
            status: targetStatus,
            reviewerActorId: args.actor.actor_id,
            decisionReason: reasonOrNote ?? null,
          });

          const detail: Record<string, unknown> = {
            task_request_id: taskRequest.id,
            from_status: taskRequest.status,
            to_status: updated.status,
            reviewer_actor_id: args.actor.actor_id,
          };
          if (args.action === 'request_more_evidence') {
            detail.note = reasonOrNote;
          } else if (reasonOrNote !== undefined) {
            detail.reason = reasonOrNote;
          }
          if (args.action === 'approve' && taskRequest.requester_actor_id === args.actor.actor_id) {
            detail.self_approval = true;
            detail.sensitive = true;
          }

          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: EVENT_TYPE_BY_ACTION[args.action],
            subject_type: 'task_request',
            subject_id: taskRequest.id,
            summary: 'Task Request review decision recorded',
            detail,
          });

          return { status: 200, body: taskRequestToDto(updated) };
        },
      );
    });
  }

  return {
    createFromFinding,
    createFromVoc,
    createFromVocCluster,
    listTaskRequests,
    decideTaskRequest,
    resolveEndpoint,
  };
}

export type TaskRequestsService = ReturnType<typeof createTaskRequestsService>;
