import { randomUUID } from 'node:crypto';
import {
  type ConvertTaskRequestRequest,
  type CreateTaskCommentRequest,
  type LinkExistingTaskRequest,
  type ListTaskCommentsQuery,
  type ListTaskCommentsResponse,
  type ListTasksQuery,
  type PatchTaskStatusRequest,
  type TaskCommentDto,
  type TaskDetailDto,
  type TaskDto,
  registeredEntityLinkPairSchema,
} from '@fops/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { type PgBoss, fromDrizzle } from 'pg-boss';
import { z } from 'zod';

import type { Db } from '../../db/client.js';
import { actors } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { encodeCommentCursor } from '../../lib/pg-timestamp.js';
import { type RichContentError, sanitizeTipTap } from '../../lib/rich-content/sanitize.js';
import { lockAnalyticsArea } from '../analytics-areas/index.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import {
  type EntityLinkRow,
  createEntityLink,
  selectActiveLinksForEndpoint,
  selectEligibleVocLinksForReleasedTask,
} from '../entity-links/commands.js';
import { assertLinkManagedSystemCompatibility } from '../entity-links/service.js';
import { checkFindingManage, hasElevatedFindingRole } from '../findings/authorization.js';
import { linkTaskToFinding } from '../findings/commands.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import { lockMilestone } from '../milestones/index.js';
import type { CheckService } from '../permissions/check-service.js';
import {
  type TaskRequestRow,
  lockTaskRequestForUpdate,
  markTaskRequestConverted,
} from '../task-requests/commands.js';
import {
  TASK_RELEASED_REVIEW_CANDIDATES_QUEUE,
  type TaskReleasedReviewCandidatesPayload,
} from '../voc/jobs/released-review-candidates.js';
import type { VocReadService } from '../voc/read-service.js';
import {
  type TaskCommentRow,
  type TaskRow,
  findTaskById,
  insertTask,
  insertTaskComment,
  listTaskComments as listTaskCommentRows,
  listTasksByWorkspace,
  lockTaskById,
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
  /** Narrow read seam (#378): Task detail resolves its source VOC's visibility
   *  verdict through the canonical VOC read-authority path — never a copied
   *  predicate (see #423) and never a VOC repo import (module-seams guard). */
  vocReadService: Pick<VocReadService, 'resolveVocReference'>;
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

const commentCursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();
type CommentCursor = z.infer<typeof commentCursorSchema>;

function decodeCommentCursor(raw: string): CommentCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw fail();
  }
  const result = commentCursorSchema.safeParse(parsed);
  if (!result.success) throw fail();
  return result.data;
}

function taskCommentToDto(row: TaskCommentRow): TaskCommentDto {
  return {
    id: row.id,
    task_id: row.task_id,
    actor_id: row.actor_id,
    kind: row.kind,
    from_status: row.from_status,
    to_status: row.to_status,
    body_rich_content: row.body_rich_content,
    created_at: row.created_at.toISOString(),
  };
}

function richContentFieldCode(error: RichContentError): string {
  if (error.code === 'rich_content.external_image_forbidden') return 'external_image_forbidden';
  return error.fields_code ?? 'disallowed_node';
}

function sanitizeCommentBody(doc: unknown): unknown {
  const result = sanitizeTipTap({
    surface: 'internal-comment',
    doc: doc as Parameters<typeof sanitizeTipTap>[0]['doc'],
  });
  if (!result.ok) {
    throw new HttpError(result.error.code, result.error.reason, {
      fields: [{ path: ['body_rich_content'], code: richContentFieldCode(result.error) }],
      hint: result.error.path,
    });
  }
  return result.doc;
}

interface MentionNode {
  attrs?: Record<string, unknown>;
}

function findNodesOfType(doc: unknown, type: string): MentionNode[] {
  const results: MentionNode[] = [];
  const stack: MentionNode[] = [doc as MentionNode];
  while (stack.length > 0) {
    const node = stack.pop() as MentionNode & { type?: string; content?: unknown[] };
    if (!node || typeof node !== 'object') continue;
    if (node.type === type) results.push(node);
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child as MentionNode);
    }
  }
  return results;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

async function validateCommentMentions(
  tx: Tx,
  workspaceId: string,
  sanitizedBody: unknown,
  mentions: string[] | undefined,
): Promise<string[]> {
  const mentionNodes = findNodesOfType(sanitizedBody, 'mention');
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  for (const node of mentionNodes) {
    const actorId = node.attrs?.actor_id;
    if (typeof actorId !== 'string' || !uuidRegex.test(actorId)) {
      throw new HttpError('validation.failed', 'mention node attrs.actor_id must be a valid UUID', {
        fields: [{ path: ['body_rich_content'], code: 'invalid_mention_actor_id' }],
      });
    }
  }

  const bodyMentionIds = dedupe(mentionNodes.map((node) => node.attrs?.actor_id as string));
  const requestMentionIds = dedupe(mentions ?? []);
  if (!setsEqual(new Set(bodyMentionIds), new Set(requestMentionIds))) {
    throw new HttpError(
      'validation.failed',
      'mentions[] must exactly match the set of actor_ids referenced by mention nodes in body_rich_content',
      { fields: [{ path: ['mentions'], code: 'invalid' }] },
    );
  }

  if (requestMentionIds.length > 0) {
    const foundRows = await tx
      .select({ id: actors.id })
      .from(actors)
      .where(and(eq(actors.workspaceId, workspaceId), inArray(actors.id, requestMentionIds)));
    if (foundRows.length !== requestMentionIds.length) {
      throw new HttpError(
        'validation.failed',
        'one or more mention actor_ids do not belong to this workspace',
        { fields: [{ path: ['mentions'], code: 'cross_workspace' }] },
      );
    }
  }
  return requestMentionIds;
}

function statusChangeBody(reason: string | undefined): unknown {
  if (reason === undefined) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return sanitizeCommentBody({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: reason }] }],
  });
}

function assertApproved(taskRequest: TaskRequestRow): void {
  if (taskRequest.status !== 'approved') {
    throw new HttpError('validation.failed', 'task request must be approved before conversion', {
      fields: [{ path: ['status'], code: 'not_approved' }],
    });
  }
}

// Validates the analytics_area_id passed to task conversion (issue #389). The
// DB FK alone cannot scope the area, so mirror assertTargetAnalyticsArea from
// voc-clusters: the area must exist in this workspace, belong to the task
// request's managed system, and not be archived.
async function assertConversionAnalyticsArea(args: {
  tx: Tx;
  workspaceId: string;
  analyticsAreaId: string | null | undefined;
  managedSystemId: string;
}): Promise<void> {
  if (!args.analyticsAreaId) return;
  // Lock order MS -> AA, same as AA archive (ADR-0019 E) and VOC create; the
  // Task insert's FK also takes a KEY SHARE on the MS, so locking the AA first
  // would invert the order and can deadlock against a concurrent AA archive.
  await lockManagedSystem(args.tx, args.workspaceId, args.managedSystemId);
  const aa = await lockAnalyticsArea(args.tx, args.workspaceId, args.analyticsAreaId);
  if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
  if (aa.managed_system_id !== args.managedSystemId) {
    throw new HttpError('validation.failed', 'analytics_area does not belong to managed_system', {
      fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }],
    });
  }
  if (aa.archived_at !== null) {
    throw new HttpError('conflict.parent_archived', 'analytics area archived', {
      fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
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
  const requestLink = await createEntityLink(args.tx, {
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
    const taskFindingLink = await createEntityLink(args.tx, {
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
      const taskEvidenceLink = await createEntityLink(args.tx, {
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
    // #388 review follow-up: this direct voc->task_request link (no Finding
    // in between) can also predate cross-MS enforcement — same rationale as
    // the finding->task and voc->finding propagation checks above.
    assertLinkManagedSystemCompatibility(
      sourceLink.managed_system_id,
      args.task.primary_managed_system_id,
      { path: ['task_id'] },
    );
    const tuple = registeredEntityLinkPairSchema.parse({
      source_type: 'voc',
      target_type: 'task',
      relation_type: 'evidence_of',
    });
    const taskEvidenceLink = await createEntityLink(args.tx, {
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

    const resolved = row.source_task_request_id
      ? await resolveTaskSource(deps.db, {
          workspaceId: args.actor.workspace_id,
          sourceTaskRequestId: row.source_task_request_id,
        })
      : null;
    await attachSourceVoc(args.actor, resolved);
    return { ...taskToDto(row), source: resolved?.source ?? null };
  }

  async function getTaskComments(args: {
    actor: TasksActor;
    taskId: string;
    query: ListTaskCommentsQuery;
  }): Promise<ListTaskCommentsResponse> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }

    const task = await findTaskById(deps.db, {
      workspaceId: args.actor.workspace_id,
      taskId: args.taskId,
    });
    if (!task) throw new HttpError('not_found.record', 'task not found');

    const canManage = (
      await checkFindingManage(deps.checkService, args.actor, task.primary_managed_system_id, {
        requireElevatedRole: true,
      })
    ).allow;
    if (!canManage) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }

    const cursor = args.query.cursor ? decodeCommentCursor(args.query.cursor) : undefined;
    const result = await listTaskCommentRows(deps.db, {
      workspaceId: args.actor.workspace_id,
      taskId: task.id,
      ...(cursor ? { cursor } : {}),
      limit: args.query.limit,
    });
    const last = result.rows[result.rows.length - 1];
    return {
      items: result.rows.map(taskCommentToDto),
      page: {
        ...(result.hasMore && last
          ? { cursor: encodeCommentCursor({ createdAt: last.created_at_raw, id: last.id }) }
          : {}),
        has_more: result.hasMore,
      },
    };
  }

  async function createTaskComment(args: {
    actor: TasksActor;
    taskId: string;
    input: CreateTaskCommentRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: { comment: TaskCommentDto } }> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }
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

          const managedSystem = await lockManagedSystem(
            tx,
            args.actor.workspace_id,
            task.primary_managed_system_id,
          );
          if (!managedSystem) throw new HttpError('not_found.record', 'managed system not found');
          if (managedSystem.archived_at !== null) {
            throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
              fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
            });
          }

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

          const sanitizedBody = sanitizeCommentBody(args.input.body_rich_content);
          const mentionIds = await validateCommentMentions(
            tx,
            args.actor.workspace_id,
            sanitizedBody,
            args.input.mentions,
          );
          if (findNodesOfType(sanitizedBody, 'attachmentRef').length > 0) {
            throw new HttpError('validation.failed', 'attachments are not supported for comments', {
              fields: [{ path: ['body_rich_content'], code: 'attachment_not_supported' }],
            });
          }

          const row = await insertTaskComment(tx, {
            workspaceId: args.actor.workspace_id,
            taskId: task.id,
            actorId: args.actor.actor_id,
            kind: 'note',
            fromStatus: null,
            toStatus: null,
            bodyRichContent: sanitizedBody,
          });
          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'task_comment_created',
            subject_type: 'task',
            subject_id: task.id,
            summary: 'Task comment created',
            detail: {
              task_id: task.id,
              comment_id: row.id,
              actor_id: args.actor.actor_id,
              mentions: mentionIds,
            },
          });

          return { status: 201, body: { comment: taskCommentToDto(row) } };
        },
      );
    });
  }

  // #378: the source VOC ships only as a backend visibility verdict
  // (ADR-0023). Seeing the Task does not imply seeing its source VOC; a
  // `hidden` verdict omits the key entirely so existence is not revealed.
  // Unexpected read failures propagate — they carry no id and must not be
  // swallowed into a synthetic state. Shared by GET and PATCH so both
  // responses carry the same source projection.
  async function attachSourceVoc(
    actor: TasksActor,
    resolved: Awaited<ReturnType<typeof resolveTaskSource>> | null,
  ): Promise<void> {
    if (!resolved?.vocId) return;
    const voc = await deps.vocReadService.resolveVocReference({
      actor,
      vocId: resolved.vocId,
    });
    if (voc.visibility_state !== 'hidden') {
      resolved.source.voc = voc;
    }
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
          const taskRequest = await lockTaskRequestForUpdate(tx, {
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

          await assertConversionAnalyticsArea({
            tx,
            workspaceId: args.actor.workspace_id,
            analyticsAreaId: args.input.analytics_area_id,
            managedSystemId: taskRequest.primary_managed_system_id,
          });

          // #514 A10 — validate milestone_id before insertTask. Unknown or
          // foreign-workspace: not_found; cross-MS: out_of_scope. No status
          // policy here (G-status owns that).
          if (args.input.milestone_id != null) {
            const milestone = await lockMilestone(tx, {
              workspaceId: args.actor.workspace_id,
              milestoneId: args.input.milestone_id,
            });
            if (!milestone) {
              throw new HttpError('not_found.record', 'milestone not found');
            }
            if (milestone.primary_managed_system_id !== taskRequest.primary_managed_system_id) {
              throw new HttpError(
                'validation.failed',
                'milestone does not belong to the task request managed system',
                { fields: [{ path: ['milestone_id'], code: 'out_of_scope' }] },
              );
            }
          }

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
            await linkTaskToFinding(tx, {
              workspaceId: args.actor.workspace_id,
              findingId: taskRequest.source_id,
              taskId: task.id,
            });
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
          const taskRequest = await lockTaskRequestForUpdate(tx, {
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
          await createEntityLink(tx, {
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
            const resolved = task.source_task_request_id
              ? await resolveTaskSource(tx, {
                  workspaceId: args.actor.workspace_id,
                  sourceTaskRequestId: task.source_task_request_id,
                })
              : null;
            await attachSourceVoc(args.actor, resolved);
            return { status: 200, body: { ...taskToDto(task), source: resolved?.source ?? null } };
          }

          const updatedTask = await updateTaskStatus(tx, {
            workspaceId: args.actor.workspace_id,
            taskId: task.id,
            status: args.input.status,
          });
          await insertTaskComment(tx, {
            workspaceId: args.actor.workspace_id,
            taskId: task.id,
            actorId: args.actor.actor_id,
            kind: 'status_change',
            fromStatus: task.status,
            toStatus: updatedTask.status,
            bodyRichContent: statusChangeBody(args.input.reason),
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
          const detail: Record<string, unknown> = {
            from: task.status,
            to: updatedTask.status,
          };
          if (args.input.reason !== undefined) detail.reason = args.input.reason;
          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'task_status_changed',
            subject_type: 'task',
            subject_id: task.id,
            summary: 'Task status changed',
            detail,
          });
          const resolved = updatedTask.source_task_request_id
            ? await resolveTaskSource(tx, {
                workspaceId: args.actor.workspace_id,
                sourceTaskRequestId: updatedTask.source_task_request_id,
              })
            : null;
          await attachSourceVoc(args.actor, resolved);
          return {
            status: 200,
            body: { ...taskToDto(updatedTask), source: resolved?.source ?? null },
          };
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
      ...(args.query.public_update !== undefined ? { publicUpdate: args.query.public_update } : {}),
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
    getTaskComments,
    createTaskComment,
    convertTaskRequest,
    linkExistingTask,
    patchTaskStatus,
    listTasks,
  };
}

export type TasksService = ReturnType<typeof createTasksService>;
