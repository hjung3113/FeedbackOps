import { randomUUID } from 'node:crypto';
import {
  type ConvertTaskRequestRequest,
  type LinkExistingTaskRequest,
  type ListTasksQuery,
  type PatchTaskStatusRequest,
  type TaskDetailDto,
  type TaskDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';
import { sql } from 'drizzle-orm';
import { type PgBoss, fromDrizzle } from 'pg-boss';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import {
  type EntityLinkRow,
  insertActiveEntityLink,
  selectActiveLinksForEndpoint,
  selectEligibleVocLinksForReleasedTask,
} from '../entity-links/repo.js';
import { assertLinkManagedSystemCompatibility } from '../entity-links/service.js';
import { checkFindingManage, hasElevatedFindingRole } from '../findings/authorization.js';
import { lockFindingById, updateFindingLinkedTask } from '../findings/repo.js';
import type { CheckService } from '../permissions/check-service.js';
import { type TaskRequestRow, lockTaskRequestById } from '../task-requests/repo.js';
import {
  TASK_RELEASED_REVIEW_CANDIDATES_QUEUE,
  type TaskReleasedReviewCandidatesPayload,
} from './jobs/released-review-candidates.js';
import {
  type TaskRow,
  findTaskById,
  insertTask,
  listTasksByWorkspace,
  lockTaskById,
  markTaskRequestConverted,
  resolveTaskSource,
  updateTaskStatus,
} from './repo.js';

export interface TasksActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface TasksServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
  boss?: PgBoss;
}

function taskToDto(row: TaskRow): TaskDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    display_id: row.display_id,
    primary_managed_system_id: row.primary_managed_system_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    assignee_actor_id: row.assignee_actor_id,
    due_date: row.due_date,
    milestone_id: row.milestone_id,
    analytics_area_id: row.analytics_area_id,
    source_task_request_id: row.source_task_request_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function assertApproved(taskRequest: TaskRequestRow): void {
  if (taskRequest.status !== 'approved') {
    throw new HttpError('validation.failed', 'task request must be approved before conversion', {
      fields: [{ path: ['status'], code: 'not_approved' }],
    });
  }
}

async function preserveSourceLinks(args: {
  tx: Parameters<TasksServiceDeps['auditService']['record']>[0];
  actor: TasksActor;
  taskRequest: TaskRequestRow;
  task: TaskRow;
}): Promise<EntityLinkRow[]> {
  const preserved: EntityLinkRow[] = [];

  const requestTuple = registeredEntityLinkPairSchema.parse({
    source_type: 'task_request',
    target_type: 'task',
    relation_type: 'converted_to',
  });
  const requestLink = await insertActiveEntityLink(args.tx, {
    workspaceId: args.actor.workspace_id,
    sourceType: requestTuple.source_type,
    sourceId: args.taskRequest.id,
    targetType: requestTuple.target_type,
    targetId: args.task.id,
    relationType: requestTuple.relation_type,
    managedSystemId: args.task.primary_managed_system_id,
    createdBy: args.actor.actor_id,
    visibility: 'internal_only',
  });
  preserved.push(requestLink.row);

  const sourceLinks = await selectActiveLinksForEndpoint(args.tx, {
    workspaceId: args.actor.workspace_id,
    endpointType: 'task_request',
    endpointId: args.taskRequest.id,
    side: 'target',
  });
  const findingLink = sourceLinks.find(
    (link) => link.source_type === 'finding' && link.relation_type === 'requested_task',
  );
  if (findingLink) {
    // #388: a legacy finding->task_request link created before cross-MS
    // enforcement can still carry a different Managed System than the task
    // it is now being converted into. Refuse to propagate it as a new
    // canonical link rather than silently writing a mismatched MS.
    assertLinkManagedSystemCompatibility(
      findingLink.managed_system_id,
      args.task.primary_managed_system_id,
      { path: ['task_id'] },
    );
    const findingTuple = registeredEntityLinkPairSchema.parse({
      source_type: 'finding',
      target_type: 'task',
      relation_type: 'requested_task',
    });
    const taskFindingLink = await insertActiveEntityLink(args.tx, {
      workspaceId: args.actor.workspace_id,
      sourceType: findingTuple.source_type,
      sourceId: findingLink.source_id,
      targetType: findingTuple.target_type,
      targetId: args.task.id,
      relationType: findingTuple.relation_type,
      managedSystemId: args.task.primary_managed_system_id,
      createdBy: args.actor.actor_id,
      visibility: 'internal_only',
    });
    preserved.push(taskFindingLink.row);

    const evidenceLinks = await selectActiveLinksForEndpoint(args.tx, {
      workspaceId: args.actor.workspace_id,
      endpointType: 'finding',
      endpointId: findingLink.source_id,
      side: 'target',
    });
    for (const evidenceLink of evidenceLinks) {
      if (evidenceLink.source_type !== 'voc' || evidenceLink.relation_type !== 'evidence_of') {
        continue;
      }
      // #388: same rationale as the finding->task link above — a legacy
      // voc->finding evidence link may predate cross-MS enforcement.
      assertLinkManagedSystemCompatibility(
        evidenceLink.managed_system_id,
        args.task.primary_managed_system_id,
        { path: ['task_id'] },
      );
      const evidenceTuple = registeredEntityLinkPairSchema.parse({
        source_type: 'voc',
        target_type: 'task',
        relation_type: 'evidence_of',
      });
      const taskEvidenceLink = await insertActiveEntityLink(args.tx, {
        workspaceId: args.actor.workspace_id,
        sourceType: evidenceTuple.source_type,
        sourceId: evidenceLink.source_id,
        targetType: evidenceTuple.target_type,
        targetId: args.task.id,
        relationType: evidenceTuple.relation_type,
        managedSystemId: args.task.primary_managed_system_id,
        createdBy: args.actor.actor_id,
        visibility: 'summary_visible',
        internalWritePath: 'task_request_conversion',
      });
      preserved.push(taskEvidenceLink.row);
    }
  }

  for (const sourceLink of sourceLinks) {
    if (sourceLink.source_type !== 'voc' || sourceLink.relation_type !== 'requested_task') continue;
    const tuple = registeredEntityLinkPairSchema.parse({
      source_type: 'voc',
      target_type: 'task',
      relation_type: 'evidence_of',
    });
    const taskEvidenceLink = await insertActiveEntityLink(args.tx, {
      workspaceId: args.actor.workspace_id,
      sourceType: tuple.source_type,
      sourceId: sourceLink.source_id,
      targetType: tuple.target_type,
      targetId: args.task.id,
      relationType: tuple.relation_type,
      managedSystemId: args.task.primary_managed_system_id,
      createdBy: args.actor.actor_id,
      visibility: 'summary_visible',
      internalWritePath: 'task_request_conversion',
    });
    preserved.push(taskEvidenceLink.row);
  }

  return preserved;
}

export function createTasksService(deps: TasksServiceDeps) {
  async function getTask(args: {
    actor: TasksActor;
    taskId: string;
  }): Promise<TaskDetailDto> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }

    const row = await findTaskById(deps.db, {
      workspaceId: args.actor.workspace_id,
      taskId: args.taskId,
    });
    if (!row) throw new HttpError('not_found.record', 'task not found');

    const canManage = (
      await checkFindingManage(deps.checkService, args.actor, row.primary_managed_system_id, {
        requireElevatedRole: true,
      })
    ).allow;
    if (!canManage) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }

    const source = row.source_task_request_id
      ? await resolveTaskSource(deps.db, {
          workspaceId: args.actor.workspace_id,
          sourceTaskRequestId: row.source_task_request_id,
        })
      : null;
    return { ...taskToDto(row), source };
  }

  async function convertTaskRequest(args: {
    actor: TasksActor;
    taskRequestId: string;
    input: ConvertTaskRequestRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: TaskDto }> {
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const taskRequest = await lockTaskRequestById(tx, {
            workspaceId: args.actor.workspace_id,
            taskRequestId: args.taskRequestId,
          });
          if (!taskRequest) throw new HttpError('not_found.record', 'task request not found');

          const canManage = (
            await checkFindingManage(
              deps.checkService,
              args.actor,
              taskRequest.primary_managed_system_id,
              { requireElevatedRole: true },
              { tx },
            )
          ).allow;
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }
          assertApproved(taskRequest);

          const task = await insertTask(tx, {
            workspaceId: args.actor.workspace_id,
            primaryManagedSystemId: taskRequest.primary_managed_system_id,
            title: args.input.title,
            priority: args.input.priority,
            assigneeActorId: args.input.assignee_actor_id ?? null,
            dueDate: args.input.due_date ?? null,
            milestoneId: args.input.milestone_id ?? null,
            analyticsAreaId: args.input.analytics_area_id ?? null,
            sourceTaskRequestId: taskRequest.id,
            createdBy: args.actor.actor_id,
          });

          const preservedLinks = await preserveSourceLinks({
            tx,
            actor: args.actor,
            taskRequest,
            task,
          });

          if (taskRequest.source_type === 'finding') {
            const finding = await lockFindingById(tx, {
              workspaceId: args.actor.workspace_id,
              findingId: taskRequest.source_id,
            });
            if (finding?.linked_task_id === null) {
              await updateFindingLinkedTask(tx, {
                workspaceId: args.actor.workspace_id,
                findingId: finding.id,
                taskId: task.id,
              });
            }
          }

          await markTaskRequestConverted(tx, {
            workspaceId: args.actor.workspace_id,
            taskRequestId: taskRequest.id,
          });

          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'task_created_from_request',
            subject_type: 'task',
            subject_id: task.id,
            summary: 'Task created from approved Task Request',
            detail: {
              task_id: task.id,
              source_task_request_id: taskRequest.id,
              primary_managed_system_id: task.primary_managed_system_id,
              preserved_links: preservedLinks.map((link) => link.id),
            },
          });

          return { status: 201, body: taskToDto(task) };
        },
      );
    });
  }

  async function linkExistingTask(args: {
    actor: TasksActor;
    taskRequestId: string;
    input: LinkExistingTaskRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: TaskDto }> {
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const taskRequest = await lockTaskRequestById(tx, {
            workspaceId: args.actor.workspace_id,
            taskRequestId: args.taskRequestId,
          });
          if (!taskRequest) throw new HttpError('not_found.record', 'task request not found');

          const canManage = (
            await checkFindingManage(
              deps.checkService,
              args.actor,
              taskRequest.primary_managed_system_id,
              { requireElevatedRole: true },
              { tx },
            )
          ).allow;
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }
          assertApproved(taskRequest);

          const task = await lockTaskById(tx, {
            workspaceId: args.actor.workspace_id,
            taskId: args.input.task_id,
          });
          if (!task) throw new HttpError('not_found.record', 'task not found');
          if (task.primary_managed_system_id !== taskRequest.primary_managed_system_id) {
            throw new HttpError('permission.denied', 'task is outside task request scope');
          }

          const tuple = registeredEntityLinkPairSchema.parse({
            source_type: 'task_request',
            target_type: 'task',
            relation_type: 'converted_to',
          });
          await insertActiveEntityLink(tx, {
            workspaceId: args.actor.workspace_id,
            sourceType: tuple.source_type,
            sourceId: taskRequest.id,
            targetType: tuple.target_type,
            targetId: task.id,
            relationType: tuple.relation_type,
            managedSystemId: task.primary_managed_system_id,
            createdBy: args.actor.actor_id,
            visibility: 'internal_only',
          });

          await markTaskRequestConverted(tx, {
            workspaceId: args.actor.workspace_id,
            taskRequestId: taskRequest.id,
          });

          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'task_linked_to_request',
            subject_type: 'task',
            subject_id: task.id,
            summary: 'Existing Task linked to approved Task Request',
            detail: {
              task_id: task.id,
              task_request_id: taskRequest.id,
            },
          });

          return { status: 200, body: taskToDto(task) };
        },
      );
    });
  }

  async function patchTaskStatus(args: {
    actor: TasksActor;
    taskId: string;
    ifMatch: string;
    input: PatchTaskStatusRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: TaskDetailDto }> {
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const task = await lockTaskById(tx, {
            workspaceId: args.actor.workspace_id,
            taskId: args.taskId,
          });
          if (!task) throw new HttpError('not_found.record', 'task not found');

          const canManage = (
            await checkFindingManage(
              deps.checkService,
              args.actor,
              task.primary_managed_system_id,
              { requireElevatedRole: true },
              { tx },
            )
          ).allow;
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          if (task.updated_at.toISOString() !== args.ifMatch) {
            throw new HttpError('conflict.stale_write', 'task updated_at does not match If-Match', {
              current_updated_at: task.updated_at.toISOString(),
            });
          }

          if (task.status === args.input.status) {
            const source = task.source_task_request_id
              ? await resolveTaskSource(tx, {
                  workspaceId: args.actor.workspace_id,
                  sourceTaskRequestId: task.source_task_request_id,
                })
              : null;
            return { status: 200, body: { ...taskToDto(task), source } };
          }

          const updatedTask = await updateTaskStatus(tx, {
            workspaceId: args.actor.workspace_id,
            taskId: task.id,
            status: args.input.status,
          });
          if (task.status !== 'released' && updatedTask.status === 'released') {
            if (!deps.boss) {
              throw new Error('pg-boss is required to publish released Task review candidates');
            }
            const linkedVocs = await selectEligibleVocLinksForReleasedTask(tx, {
              workspaceId: args.actor.workspace_id,
              taskId: updatedTask.id,
            });
            if (linkedVocs.length > 0) {
              const payload: TaskReleasedReviewCandidatesPayload = {
                workspace_id: args.actor.workspace_id,
                task_id: updatedTask.id,
                release_event_id: randomUUID(),
                correlation_id: args.idempotencyKey,
                triggered_by_actor_id: args.actor.actor_id,
                linked_vocs: linkedVocs.map((link) => ({
                  voc_id: link.voc_id,
                  entity_link_id: link.entity_link_id,
                })),
              };
              await deps.boss.send(TASK_RELEASED_REVIEW_CANDIDATES_QUEUE, payload, {
                db: fromDrizzle(tx, sql),
              });
            }
          }
          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'task_status_changed',
            subject_type: 'task',
            subject_id: task.id,
            summary: 'Task status changed',
            detail: { from: task.status, to: updatedTask.status },
          });
          const source = updatedTask.source_task_request_id
            ? await resolveTaskSource(tx, {
                workspaceId: args.actor.workspace_id,
                sourceTaskRequestId: updatedTask.source_task_request_id,
              })
            : null;
          return { status: 200, body: { ...taskToDto(updatedTask), source } };
        },
      );
    });
  }

  async function listTasks(args: {
    actor: TasksActor;
    query: ListTasksQuery;
  }): Promise<{ items: TaskDto[] }> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }
    const assigneeActorId =
      args.query.assignee === 'me' ? args.actor.actor_id : args.query.assignee;
    const managedSystemId =
      args.query.managed_system_id && args.query.managed_system_id !== 'all'
        ? args.query.managed_system_id
        : undefined;
    const rows = await listTasksByWorkspace(deps.db, {
      workspaceId: args.actor.workspace_id,
      ...(args.query.status !== undefined ? { status: args.query.status } : {}),
      ...(assigneeActorId !== undefined ? { assigneeActorId } : {}),
      ...(managedSystemId !== undefined ? { managedSystemId } : {}),
    });
    const items: TaskDto[] = [];
    for (const row of rows) {
      const canManage = (
        await checkFindingManage(deps.checkService, args.actor, row.primary_managed_system_id, {
          requireElevatedRole: true,
        })
      ).allow;
      if (!canManage) continue;
      items.push(taskToDto(row));
    }
    return { items };
  }

  return {
    getTask,
    convertTaskRequest,
    linkExistingTask,
    patchTaskStatus,
    listTasks,
  };
}

export type TasksService = ReturnType<typeof createTasksService>;
