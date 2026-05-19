// apps/backend/src/modules/voc/conversation-service.ts
//
// Conversation application service for the VOC module.
// Owns the three write commands for the VOC conversation thread:
//   - postPublicUpdate   (admin / voc.triage actors)
//   - postReporterReply  (VOC reporter only)
//   - postInternalComment (admin / voc.triage actors; reporter identity NOT a deny)
//
// Per AGENTS.md layer rules, the public API accepts a `Tx` so the route
// handler's idempotency frame owns the transaction boundary.
//
// Spec: .review/SLICE-3-16-PLAN.md §C3

import { and, eq, inArray } from 'drizzle-orm';

import { actors } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import { sanitizeTipTap } from '../../lib/rich-content/sanitize.js';
import type { Tx } from '../../db/tx.js';
import type {
  InternalCommentRequest,
  PublicUpdateRequest,
  ReporterReplyRequest,
  VocDetailEnvelope,
} from '@fops/shared';

import type { AuditService } from '../core/audit/audit-service.js';
import type { CheckService } from '../permissions/check-service.js';
import type { RoleLevel } from '../auth/session-service.js';
import {
  insertInternalComment,
  insertPublicUpdate,
  insertReporterReply,
  lockManagedSystem,
  selectVocForUpdate,
  updateVocReporterStatus,
} from './repo.js';
import { nextReporterStates, type ReporterFacingStatus } from './transitions.js';
import type { VocReadService } from './read-service.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConversationActor {
  actor_id: string;
  workspace_id: string;
  role_level: RoleLevel;
}

export interface PublicUpdateEnvelope {
  public_update: {
    id: string;
    voc_id: string;
    body_rich_content: unknown | null;
    reporter_facing_status_before: ReporterFacingStatus;
    reporter_facing_status_after: ReporterFacingStatus;
    skip_public_update: boolean;
    skip_reason: string | null;
    created_at: string;
  };
  voc: VocDetailEnvelope;
}

export interface ReporterReplyEnvelope {
  reporter_reply: {
    id: string;
    voc_id: string;
    actor_id: string;
    body_rich_content: unknown;
    created_at: string;
  };
  voc: VocDetailEnvelope;
}

export interface InternalCommentEnvelope {
  internal_comment: {
    id: string;
    voc_id: string;
    actor_id: string;
    body_rich_content: unknown;
    created_at: string;
  };
  voc: VocDetailEnvelope;
}

// ── Internal TipTap doc-walking helper ────────────────────────────────────────

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
}

/**
 * Walks a TipTap doc and returns all nodes of the given type.
 * No existing helper in lib/rich-content/ — defined locally per AGENTS.md
 * "smallest change" rule.
 */
function findNodesOfType(doc: unknown, type: string): TipTapNode[] {
  // Iterative walk with explicit stack (cycle-2 M3 fix — recursion blew V8
  // default frame budget on deeply nested adversarial docs even at 50 KB
  // payload).
  const results: TipTapNode[] = [];
  const stack: TipTapNode[] = [doc as TipTapNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!node || typeof node !== 'object') continue;
    if (node.type === type) results.push(node);
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
  }
  return results;
}

// ── Permission helper (reused from service.ts pattern) ────────────────────────

/**
 * Re-evaluates voc.triage capability for the actor on the given MS inside `tx`.
 * Returns the decision object; callers map deny reasons to HttpError codes.
 */
async function checkTriageCapability(
  checkService: CheckService,
  tx: Tx,
  actor: ConversationActor,
  managedSystemId: string,
) {
  return checkService.checkCapability(
    { actor_id: actor.actor_id, workspace_id: actor.workspace_id, role_level: actor.role_level },
    'voc.triage',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    { tx },
  );
}

/**
 * Maps a checkCapability deny decision to the correct HttpError.
 * Mirrors the pattern in service.ts updateVoc.
 */
function mapTriageDenyToHttpError(
  reason: string,
  roleLevel: RoleLevel,
  managedSystemId: string,
): HttpError {
  if (reason === 'no_grant' && roleLevel === 'developer') {
    return new HttpError(
      'permission.scope_required',
      'voc.triage capability required; developer needs MS-scoped grant',
      {
        requiredScope: [managedSystemId],
        requestable_permission: {
          permission: 'voc.triage',
          managed_system_id: managedSystemId,
          reason_required: false,
        },
      },
    );
  }
  return new HttpError(
    'permission.denied',
    `voc.triage denied: ${reason}`,
    { reason },
  );
}

// ── Sanitize helper ───────────────────────────────────────────────────────────

function sanitizeOrThrow(
  surface: 'public-update' | 'reporter-reply' | 'internal-comment',
  doc: unknown,
): unknown {
  const result = sanitizeTipTap({ surface, doc: doc as Parameters<typeof sanitizeTipTap>[0]['doc'] });
  if (!result.ok) {
    throw new HttpError(result.error.code, result.error.reason, {
      fields: [
        {
          path: ['body_rich_content'],
          code: result.error.code === 'rich_content.external_image_forbidden'
            ? 'external_image_forbidden'
            : 'disallowed_node',
        },
      ],
      hint: result.error.path,
    });
  }
  return result.doc;
}

// ── Service factory ───────────────────────────────────────────────────────────

export function createConversationService(deps: {
  auditService: AuditService;
  checkService: CheckService;
  vocReadService: VocReadService;
}) {
  // ── postPublicUpdate ──────────────────────────────────────────────────────

  async function postPublicUpdate(args: {
    tx: Tx;
    actor: ConversationActor;
    vocId: string;
    input: PublicUpdateRequest;
  }): Promise<PublicUpdateEnvelope> {
    const { tx, actor, vocId, input } = args;

    // 1. FOR UPDATE lock + archive checks.
    const row = await selectVocForUpdate(tx, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'voc not found');
    if (row.archivedAt !== null) throw new HttpError('conflict.record_archived', 'voc is archived');

    // 1b. Parent MS archive guard (issue #16 AC — archived parent MS → 409).
    const ms = await lockManagedSystem(tx, actor.workspace_id, row.primaryManagedSystemId);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at !== null) {
      throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    }

    // 2. Permission re-check inside tx (admin bypass via role; developer needs MS grant).
    const decision = await checkTriageCapability(
      deps.checkService,
      tx,
      actor,
      row.primaryManagedSystemId,
    );
    if (decision.allow !== true) {
      throw mapTriageDenyToHttpError(
        decision.reason,
        actor.role_level,
        row.primaryManagedSystemId,
      );
    }

    const currentStatus = row.reporterFacingStatus as ReporterFacingStatus;
    const nextStatus = input.next_reporter_facing_status;

    // 3. Skip-path guard: skip=true && next === current → 422 (codex cycle-1 fix).
    //    Skip is by definition a status change; same-status skip is nonsensical.
    if (input.skip_public_update && nextStatus === currentStatus) {
      throw new HttpError(
        'validation.failed',
        'skip_public_update=true requires a status change (next_reporter_facing_status must differ from current)',
        { fields: [{ path: ['next_reporter_facing_status'], code: 'invalid' }] },
      );
    }

    // 4. Sanitize body when present (body-shape, not skip-shape).
    let sanitizedBody: unknown | null = null;
    if (!input.skip_public_update) {
      sanitizedBody = sanitizeOrThrow('public-update', input.body_rich_content);
    }

    // 5. Transition validation.
    const transitions = await nextReporterStates(currentStatus, tx);

    let statusWillChange = false;
    if (nextStatus === currentStatus) {
      // Body-only path (shape B): next === current, skip=false.
      // No status write needed.
      statusWillChange = false;
    } else if (transitions.allowed.includes(nextStatus)) {
      // Shape A: valid status change.
      statusWillChange = true;
    } else if (nextStatus in transitions.forbidden) {
      // Forbidden transition — 422 with reason from seed.
      const reason = transitions.forbidden[nextStatus];
      throw new HttpError(
        'reporter_facing_status.invalid_transition',
        `transition from ${currentStatus} to ${nextStatus} is forbidden: ${reason ?? 'see transition table'}`,
        { fields: [{ path: ['next_reporter_facing_status'], code: 'invalid_transition' }], detail: { reason: reason ?? null } },
      );
    } else {
      // nextStatus not in allowed OR forbidden — unknown transition.
      throw new HttpError(
        'validation.failed',
        `next_reporter_facing_status '${nextStatus}' is not a known transition from '${currentStatus}'`,
        { fields: [{ path: ['next_reporter_facing_status'], code: 'invalid' }] },
      );
    }

    // 6. Linked-Task gate stub — only invoked on actual transitions (cycle-2 M1
    //    fix: body-only path has no gate semantics). Slice 6 wires real checks;
    //    always returns null in Slice 3.
    if (statusWillChange) {
      await evaluateReporterStatusGate({ tx, vocId, nextStatus });
    }

    // 7. INSERT voc_public_updates row.
    const skipReason = input.skip_public_update ? input.skip_reason : null;
    const inserted = await insertPublicUpdate(tx, {
      vocId,
      actorId: actor.actor_id,
      body: sanitizedBody,
      statusBefore: currentStatus,
      statusAfter: nextStatus,
      skip: input.skip_public_update,
      skipReason,
    });

    // 8. UPDATE vocs.reporter_facing_status only on status change.
    if (statusWillChange) {
      await updateVocReporterStatus(tx, { workspaceId: actor.workspace_id, vocId, nextStatus });
    }

    // 9. Audit.
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'public_update_created',
      subject_type: 'voc',
      subject_id: vocId,
      summary: `Public update created for VOC ${row.displayId}`,
      detail: {
        voc_id: vocId,
        public_update_id: inserted.id,
        actor_id: actor.actor_id,
        skip_public_update: input.skip_public_update,
        skip_reason: skipReason,
      },
    });
    if (statusWillChange) {
      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'reporter_facing_status_changed',
        subject_type: 'voc',
        subject_id: vocId,
        summary: `VOC ${row.displayId} reporter status changed from ${currentStatus} to ${nextStatus}`,
        detail: {
          voc_id: vocId,
          from: currentStatus,
          to: nextStatus,
          paired_with: input.skip_public_update ? 'skip' : 'public_update',
        },
      });
    }

    // 10. Refresh VocDetailEnvelope inside the same tx.
    const vocEnvelope = await deps.vocReadService.composeDetailEnvelope({
      tx,
      actor: { actor_id: actor.actor_id, workspace_id: actor.workspace_id, role_level: actor.role_level },
      vocId,
    });

    return {
      public_update: {
        id: inserted.id,
        voc_id: vocId,
        body_rich_content: sanitizedBody,
        reporter_facing_status_before: currentStatus,
        reporter_facing_status_after: nextStatus,
        skip_public_update: input.skip_public_update,
        skip_reason: skipReason,
        created_at: inserted.created_at.toISOString(),
      },
      voc: vocEnvelope,
    };
  }

  // ── postReporterReply ─────────────────────────────────────────────────────

  async function postReporterReply(args: {
    tx: Tx;
    actor: ConversationActor;
    vocId: string;
    input: ReporterReplyRequest;
  }): Promise<ReporterReplyEnvelope> {
    const { tx, actor, vocId, input } = args;

    // 1. FOR UPDATE lock + archive checks.
    const row = await selectVocForUpdate(tx, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'voc not found');
    if (row.archivedAt !== null) throw new HttpError('conflict.record_archived', 'voc is archived');

    // 1b. Parent MS archive guard.
    const ms = await lockManagedSystem(tx, actor.workspace_id, row.primaryManagedSystemId);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at !== null) {
      throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    }

    // 2. Actor must be the reporter.
    if (actor.actor_id !== row.reporterId) {
      throw new HttpError(
        'permission.denied',
        'only the reporter may post a reporter reply',
        { reason: 'not_reporter' },
      );
    }

    // 3. Sanitize body.
    const sanitizedBody = sanitizeOrThrow('reporter-reply', input.body_rich_content);

    // 4a. Value-layer attachment guard: non-empty attachments[] array → 422.
    if (input.attachments && input.attachments.length > 0) {
      throw new HttpError(
        'attachment.unsupported_pending_storage_slice',
        'attachments are not supported until the storage slice ships (#22)',
        { fields: [{ path: ['attachments'], code: 'unsupported' }] },
      );
    }

    // 4b. Walk sanitized doc: any attachmentRef node → 422 (codex cycle-1 fix).
    const attachmentRefNodes = findNodesOfType(sanitizedBody, 'attachmentRef');
    if (attachmentRefNodes.length > 0) {
      throw new HttpError(
        'attachment.unsupported_pending_storage_slice',
        'attachmentRef nodes in body_rich_content are not supported until the storage slice ships (#22)',
        { fields: [{ path: ['body_rich_content'], code: 'unsupported' }] },
      );
    }

    // 5. INSERT voc_reporter_replies. Wrap in try/catch to map the DB trigger
    //    enforce_reporter_reply_actor (defense-in-depth) to 403 rather than 500.
    let inserted: { id: string; created_at: Date };
    try {
      inserted = await insertReporterReply(tx, {
        vocId,
        actorId: actor.actor_id,
        body: sanitizedBody,
      });
    } catch (err) {
      // The BEFORE INSERT trigger raises an exception with a custom message
      // 'voc_reporter_reply.actor_must_match_reporter'.
      if (isTriggerActorMismatchError(err)) {
        throw new HttpError(
          'permission.denied',
          'reporter reply actor does not match reporter (trigger enforcement)',
          { reason: 'not_reporter' },
        );
      }
      throw err;
    }

    // 6. Audit.
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'reporter_reply_created',
      subject_type: 'voc',
      subject_id: vocId,
      summary: `Reporter reply created for VOC ${row.displayId}`,
      detail: {
        voc_id: vocId,
        reporter_reply_id: inserted.id,
        actor_id: actor.actor_id,
      },
    });

    // 7. Refresh envelope.
    const vocEnvelope = await deps.vocReadService.composeDetailEnvelope({
      tx,
      actor: { actor_id: actor.actor_id, workspace_id: actor.workspace_id, role_level: actor.role_level },
      vocId,
    });

    return {
      reporter_reply: {
        id: inserted.id,
        voc_id: vocId,
        actor_id: actor.actor_id,
        body_rich_content: sanitizedBody,
        created_at: inserted.created_at.toISOString(),
      },
      voc: vocEnvelope,
    };
  }

  // ── postInternalComment ───────────────────────────────────────────────────

  async function postInternalComment(args: {
    tx: Tx;
    actor: ConversationActor;
    vocId: string;
    input: InternalCommentRequest;
  }): Promise<InternalCommentEnvelope> {
    const { tx, actor, vocId, input } = args;

    // 1. FOR UPDATE lock + archive checks.
    const row = await selectVocForUpdate(tx, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'voc not found');
    if (row.archivedAt !== null) throw new HttpError('conflict.record_archived', 'voc is archived');

    // 1b. Parent MS archive guard.
    const ms = await lockManagedSystem(tx, actor.workspace_id, row.primaryManagedSystemId);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at !== null) {
      throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    }

    // 2. Permission: Admin OR scoped voc.triage. Reporter identity is NOT a
    //    deny condition (codex cycle-1 BLOCKER fix — a reporter who also holds
    //    voc.triage on the MS is allowed).
    const decision = await checkTriageCapability(
      deps.checkService,
      tx,
      actor,
      row.primaryManagedSystemId,
    );
    if (decision.allow !== true) {
      throw mapTriageDenyToHttpError(
        decision.reason,
        actor.role_level,
        row.primaryManagedSystemId,
      );
    }

    // 3. Sanitize body.
    const sanitizedBody = sanitizeOrThrow('internal-comment', input.body_rich_content);

    // 4. Validate mentions[] — set-equality with body mention nodes (codex cycle-1 fix).
    //    Extract deduped actor_ids from `mention` nodes in sanitized doc.
    //    Reject malformed mention nodes (missing / non-string / non-UUID attrs.actor_id)
    //    rather than silently dropping them — codex cycle-2 fix.
    const mentionNodes = findNodesOfType(sanitizedBody, 'mention');
    const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    for (const n of mentionNodes) {
      const id = n.attrs?.actor_id;
      if (typeof id !== 'string' || !UUID_RE.test(id)) {
        throw new HttpError(
          'validation.failed',
          'mention node attrs.actor_id must be a valid UUID',
          { fields: [{ path: ['body_rich_content'], code: 'invalid_mention_actor_id' }] },
        );
      }
    }
    const bodyMentionIds = dedupe(
      mentionNodes.map((n) => n.attrs!.actor_id as string),
    );

    const requestMentionIds = dedupe(input.mentions ?? []);

    // Set-equality: both sides must contain the same IDs.
    if (!setsEqual(new Set(bodyMentionIds), new Set(requestMentionIds))) {
      throw new HttpError(
        'validation.failed',
        'mentions[] must exactly match the set of actor_ids referenced by mention nodes in body_rich_content',
        { fields: [{ path: ['mentions'], code: 'invalid' }] },
      );
    }

    // 5. Verify every mentioned actor_id resolves to an actor in the same workspace.
    if (requestMentionIds.length > 0) {
      const foundRows = await tx
        .select({ id: actors.id })
        .from(actors)
        .where(
          and(
            eq(actors.workspaceId, actor.workspace_id),
            inArray(actors.id, requestMentionIds),
          ),
        );
      if (foundRows.length !== requestMentionIds.length) {
        throw new HttpError(
          'validation.failed',
          'one or more mention actor_ids do not belong to this workspace',
          { fields: [{ path: ['mentions'], code: 'cross_workspace' }] },
        );
      }
    }

    // 6. INSERT voc_internal_comments.
    const inserted = await insertInternalComment(tx, {
      vocId,
      actorId: actor.actor_id,
      body: sanitizedBody,
    });

    // 7. Audit.
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'internal_comment_created',
      subject_type: 'voc',
      subject_id: vocId,
      summary: `Internal comment created for VOC ${row.displayId}`,
      detail: {
        voc_id: vocId,
        internal_comment_id: inserted.id,
        actor_id: actor.actor_id,
        mentions: requestMentionIds,
      },
    });

    // 8. Refresh envelope.
    const vocEnvelope = await deps.vocReadService.composeDetailEnvelope({
      tx,
      actor: { actor_id: actor.actor_id, workspace_id: actor.workspace_id, role_level: actor.role_level },
      vocId,
    });

    return {
      internal_comment: {
        id: inserted.id,
        voc_id: vocId,
        actor_id: actor.actor_id,
        body_rich_content: sanitizedBody,
        created_at: inserted.created_at.toISOString(),
      },
      voc: vocEnvelope,
    };
  }

  // ── evaluateReporterStatusGate ────────────────────────────────────────────
  // Slice 3 stub — always returns null.
  // Slice 6 wires real Task-state checks and may throw
  // reporter_facing_status.gate_blocked when a blocking condition is met.

  async function evaluateReporterStatusGate(_args: {
    tx: Tx;
    vocId: string;
    nextStatus: ReporterFacingStatus;
  }): Promise<null> {
    return null;
  }

  return {
    postPublicUpdate,
    postReporterReply,
    postInternalComment,
    evaluateReporterStatusGate,
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;

// ── Private helpers ───────────────────────────────────────────────────────────

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Detects whether an error originated from the `enforce_reporter_reply_actor`
 * DB trigger. The trigger raises an exception with message
 * 'voc_reporter_reply.actor_must_match_reporter' (migration 0010).
 * We match on the message text; sqlstate P0001 (raise_exception) is the
 * expected Postgres error code for application-level RAISE EXCEPTION.
 */
function isTriggerActorMismatchError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  // pg-node surfaces the message on `message` and the sqlstate on `code`.
  // The trigger RAISE EXCEPTION message is 'voc_reporter_reply_actor_must_be_reporter'
  // (migration 0010 function voc_reporter_reply_actor_check).
  if (typeof e.message === 'string' && e.message.includes('voc_reporter_reply_actor_must_be_reporter')) {
    return true;
  }
  // Belt-and-suspenders: also match on legacy message variant.
  if (typeof e.message === 'string' && e.message.includes('voc_reporter_reply.actor_must_match_reporter')) {
    return true;
  }
  // Belt-and-suspenders: also match on routine / constraint name if present.
  if (typeof e.routine === 'string' && e.routine.includes('enforce_reporter_reply_actor')) {
    return true;
  }
  return false;
}

