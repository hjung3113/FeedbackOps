import {
  type CreateTaskRequestFromFindingRequest,
  type TaskRequestDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { insertActiveEntityLink } from '../entity-links/repo.js';
import { lockFindingById } from '../findings/repo.js';
import type { CheckService } from '../permissions/check-service.js';
import { findTaskRequestById, insertTaskRequest, type TaskRequestRow } from './repo.js';

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

function taskRequestToDto(
  row: TaskRequestRow,
  source?: { link_id: string; source_id: string },
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
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    ...(source
      ? {
          source: {
            type: 'finding',
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

export function createTaskRequestsService(deps: TaskRequestsServiceDeps) {
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

          const taskRequest = await insertTaskRequest(tx, {
            workspaceId: args.actor.workspace_id,
            sourceType: 'finding',
            sourceId: finding.id,
            primaryManagedSystemId: finding.primary_managed_system_id,
            evidenceSummary: args.input.evidence_summary,
            requestedOutcome: args.input.requested_outcome,
            requesterActorId: args.actor.actor_id,
          });

          const requestedTaskTuple = registeredEntityLinkPairSchema.parse({
            source_type: 'finding',
            target_type: 'task_request',
            relation_type: 'requested_task',
          });

          const link = await insertActiveEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            sourceType: requestedTaskTuple.source_type,
            sourceId: finding.id,
            targetType: requestedTaskTuple.target_type,
            targetId: taskRequest.id,
            relationType: requestedTaskTuple.relation_type,
            managedSystemId: finding.primary_managed_system_id,
            createdBy: args.actor.actor_id,
            visibility: 'internal_only',
          });

          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'task_request_created_from_finding',
            subject_type: 'task_request',
            subject_id: taskRequest.id,
            summary: 'Task Request created from Finding',
            detail: {
              task_request_id: taskRequest.id,
              source_finding_id: finding.id,
              primary_managed_system_id: finding.primary_managed_system_id,
              source_type: 'finding',
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
                source: { type: 'finding', id: finding.id },
                target: { type: 'task_request', id: taskRequest.id },
                relation_type: 'requested_task',
                visibility: 'internal_only',
              },
            });
          }

          return {
            status: 201,
            body: taskRequestToDto(taskRequest, {
              link_id: link.row.id,
              source_id: finding.id,
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

  return {
    createFromFinding,
    resolveEndpoint,
  };
}

export type TaskRequestsService = ReturnType<typeof createTaskRequestsService>;
