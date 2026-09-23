import type {
  CreateFindingCommentRequest,
  FindingCommentDto,
  ListFindingCommentsQuery,
  ListFindingCommentsResponse,
} from '@fops/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { actors } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { encodeCommentCursor } from '../../lib/pg-timestamp.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import { findFindingById } from './repo-read.js';
import {
  type FindingCommentRow,
  insertFindingComment,
  listFindingComments as listFindingCommentRows,
  lockFindingById,
} from './repo.js';
import { canManageFinding, canReadFinding, sanitizeCommentBody } from './service-shared.js';
import type { FindingsActor, FindingsServiceDeps } from './service.js';

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

function findingCommentToDto(row: FindingCommentRow): FindingCommentDto {
  return {
    id: row.id,
    finding_id: row.finding_id,
    actor_id: row.actor_id,
    kind: row.kind,
    from_status: row.from_status,
    to_status: row.to_status,
    body_rich_content: row.body_rich_content,
    created_at: row.created_at.toISOString(),
  };
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

export function createFindingComments(deps: FindingsServiceDeps) {
  async function getFindingComments(args: {
    actor: FindingsActor;
    findingId: string;
    query: ListFindingCommentsQuery;
  }): Promise<ListFindingCommentsResponse> {
    const finding = await findFindingById(deps.db, {
      workspaceId: args.actor.workspace_id,
      findingId: args.findingId,
    });
    if (!finding) throw new HttpError('not_found.record', 'finding not found');

    const readable = await canReadFinding(deps, args.actor, finding.primary_managed_system_id);
    if (!readable) throw new HttpError('permission.denied', 'finding.read capability required');

    const cursor = args.query.cursor ? decodeCommentCursor(args.query.cursor) : undefined;
    const result = await listFindingCommentRows(deps.db, {
      workspaceId: args.actor.workspace_id,
      findingId: finding.id,
      ...(cursor ? { cursor } : {}),
      limit: args.query.limit,
    });
    const last = result.rows[result.rows.length - 1];
    return {
      items: result.rows.map(findingCommentToDto),
      page: {
        ...(result.hasMore && last
          ? { cursor: encodeCommentCursor({ createdAt: last.created_at_raw, id: last.id }) }
          : {}),
        has_more: result.hasMore,
      },
    };
  }

  async function createFindingComment(args: {
    actor: FindingsActor;
    findingId: string;
    input: CreateFindingCommentRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: { comment: FindingCommentDto } }> {
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

          const managedSystem = await lockManagedSystem(
            tx,
            args.actor.workspace_id,
            finding.primary_managed_system_id,
          );
          if (!managedSystem) throw new HttpError('not_found.record', 'managed system not found');
          if (managedSystem.archived_at !== null) {
            throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
              fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
            });
          }

          const canManage = await canManageFinding(
            deps,
            args.actor,
            finding.primary_managed_system_id,
            { tx },
          );
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

          const row = await insertFindingComment(tx, {
            workspaceId: args.actor.workspace_id,
            findingId: finding.id,
            actorId: args.actor.actor_id,
            kind: 'note',
            fromStatus: null,
            toStatus: null,
            bodyRichContent: sanitizedBody,
          });
          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'finding_comment_created',
            subject_type: 'finding',
            subject_id: finding.id,
            summary: 'Finding comment created',
            detail: {
              finding_id: finding.id,
              comment_id: row.id,
              actor_id: args.actor.actor_id,
              mentions: mentionIds,
            },
          });

          return { status: 201, body: { comment: findingCommentToDto(row) } };
        },
      );
    });
  }

  return {
    getFindingComments,
    createFindingComment,
  };
}
