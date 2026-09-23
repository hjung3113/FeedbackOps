import {
  type FindingDto,
  type FindingStatus,
  type LinkTaskRequest,
  type PatchFindingRequest,
  registeredEntityLinkPairSchema,
} from '@fops/shared';
import { HttpError } from '../../lib/errors.js';
import { insertActiveEntityLink } from '../entity-links/repo.js';
import { lockTaskById } from '../tasks/repo.js';
import {
  findCreatedFindingSourceLink,
  findFindingById,
  listFindingsByWorkspace,
} from './repo-read.js';
import {
  insertFindingComment,
  lockFindingById,
  updateFindingLinkedTask,
  updateFindingStatus,
} from './repo.js';
import { canManageFinding, canReadFinding, sanitizeCommentBody, toDto } from './service-shared.js';
import type { FindingsActor, FindingsServiceDeps } from './service.js';

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

function statusChangeBody(reason: string | undefined): unknown {
  if (reason === undefined) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return sanitizeCommentBody({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: reason }] }],
  });
}

export function createFindingRecord(deps: FindingsServiceDeps) {
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

          await insertFindingComment(tx, {
            workspaceId: actor.workspace_id,
            findingId: finding.id,
            actorId: actor.actor_id,
            kind: 'status_change',
            fromStatus: finding.status,
            toStatus: updated.status,
            bodyRichContent: statusChangeBody(input.reason),
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

  return {
    getFinding,
    listFindings,
    patchFinding,
    linkTask,
  };
}
