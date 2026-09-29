// apps/backend/src/modules/voc/conversation-service.ts
//
// Conversation application service for the VOC module.
// Owns the three write commands for the VOC conversation thread:
//   - postPublicUpdate   (admin / voc.triage actors)
//   - postReporterReply  (VOC reporter only)
//   - postInternalComment (admin / voc.triage actors; reporter identity NOT a deny)
//
// Per AGENTS.md layer rules (#392): the `*Command` entry points own the
// transaction + idempotency frame; the Tx-aware functions are internals
// shared with cluster candidate-apply and review-candidate resolution.
//
// Spec: .review/SLICE-3-16-PLAN.md §C3

import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import type {
  InternalCommentRequest,
  PublicUpdateRequest,
  ReporterReplyRequest,
  VocDetailEnvelope,
} from '@fops/shared';
import type { Db } from '../../db/client.js';
import { actors } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import {
  LinkAttachmentsRejected,
  linkAttachments,
  linkRejectedFields,
} from '../attachments/index.js';
import { listWorkspaceAdminActorIds } from '../auth/index.js';
import type { RoleLevel } from '../auth/session-service.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { NotificationNotifier } from '../notifications/index.js';
import type { CheckService } from '../permissions/check-service.js';
import {
  checkTriageCapability,
  dedupe,
  findNodesOfType,
  isTriggerActorMismatchError,
  lockVocForConversationCommand,
  mapTriageDenyToHttpError,
  runConversationCommand,
  sanitizeOrThrow,
  setsEqual,
} from './conversation/frame.js';
import type { VocReadService } from './read-service.js';
import {
  insertInternalComment,
  insertPublicUpdate,
  insertReporterReply,
  updateVocReporterStatus,
} from './repo.js';
import { type ReporterFacingStatus, nextReporterStates } from './transitions.js';

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

// ── Service factory ───────────────────────────────────────────────────────────

export function createConversationService(deps: {
  /** #392 — required by the `*Command` entry points, which own the transaction. */
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  /** #392 — required: commands own the idempotency frame per Layer Rules. */
  idempotencyService: IdempotencyService;
  notify: NotificationNotifier;
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

    const row = await lockVocForConversationCommand(tx, actor.workspace_id, vocId);

    // 2. Permission re-check inside tx (admin bypass via role; developer needs MS grant).
    const decision = await checkTriageCapability(
      deps.checkService,
      tx,
      actor,
      row.primaryManagedSystemId,
    );
    if (decision.allow !== true) {
      throw mapTriageDenyToHttpError(decision.reason, actor.role_level, row.primaryManagedSystemId);
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
        {
          fields: [{ path: ['next_reporter_facing_status'], code: 'invalid_transition' }],
          detail: { reason: reason ?? null },
        },
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

    // 8b. PLAN-22 C7b — atomic attachment linking. Only the body shape
    // (skip_public_update=false) carries attachment_ids; the skip shape has
    // no body and rejects unknown keys at the schema layer.
    const attachmentIds: string[] =
      !input.skip_public_update && input.attachment_ids ? input.attachment_ids : [];
    if (attachmentIds.length > 0) {
      try {
        await linkAttachments(tx, {
          attachmentIds,
          parent: { kind: 'public_update', commentId: inserted.id },
          uploaderActorId: actor.actor_id,
        });
      } catch (err) {
        if (err instanceof LinkAttachmentsRejected) {
          throw new HttpError(
            'validation.failed',
            `attachment_ids[${err.index}] rejected: ${err.reason}`,
            linkRejectedFields(err),
          );
        }
        throw err;
      }
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
        attachment_ids: attachmentIds,
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
      actor: {
        actor_id: actor.actor_id,
        workspace_id: actor.workspace_id,
        role_level: actor.role_level,
      },
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

    const row = await lockVocForConversationCommand(tx, actor.workspace_id, vocId);

    // 2. Actor must be the reporter.
    if (actor.actor_id !== row.reporterId) {
      throw new HttpError('permission.denied', 'only the reporter may post a reporter reply', {
        reason: 'not_reporter',
      });
    }

    // 3. Sanitize body.
    // PLAN-22 C7b: the legacy slice-3 deferral guards (envelope-level
    // `attachments` and body-level `attachmentRef` nodes both raising
    // `attachment.unsupported_pending_storage_slice`) have been retired.
    // Contract: envelope `attachment_ids[]` is the sole link path; body
    // `attachmentRef` nodes are decoration-only (renderer hydrates name/size
    // from the linked row by id). The sanitizer (allowlist) gates which
    // node types may appear in the body.
    const sanitizedBody = sanitizeOrThrow('reporter-reply', input.body_rich_content);

    // 4. INSERT voc_reporter_replies. Wrap in try/catch to map the DB trigger
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

    // 5. PLAN-22 C7b — atomic attachment linking to the new reporter_reply.
    if (input.attachment_ids && input.attachment_ids.length > 0) {
      try {
        await linkAttachments(tx, {
          attachmentIds: input.attachment_ids,
          parent: { kind: 'reporter_reply', commentId: inserted.id },
          uploaderActorId: actor.actor_id,
        });
      } catch (err) {
        if (err instanceof LinkAttachmentsRejected) {
          throw new HttpError(
            'validation.failed',
            `attachment_ids[${err.index}] rejected: ${err.reason}`,
            linkRejectedFields(err),
          );
        }
        throw err;
      }
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
        attachment_ids: input.attachment_ids ?? [],
      },
    });

    const adminActorIds = await listWorkspaceAdminActorIds(tx, actor.workspace_id);
    const actorIds = row.ownerUserId
      ? [...new Set([row.ownerUserId, ...adminActorIds])]
      : adminActorIds;
    await deps.notify(tx, 'voc.reporter_replied', {
      workspace_id: actor.workspace_id,
      actor_ids: actorIds,
      subject_id: vocId,
      correlation_id: randomUUID(),
      detail: {
        voc_id: vocId,
        primary_managed_system_id: row.primaryManagedSystemId,
      },
      params: {},
    });

    // 7. Refresh envelope.
    const vocEnvelope = await deps.vocReadService.composeDetailEnvelope({
      tx,
      actor: {
        actor_id: actor.actor_id,
        workspace_id: actor.workspace_id,
        role_level: actor.role_level,
      },
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

    const row = await lockVocForConversationCommand(tx, actor.workspace_id, vocId);

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
      throw mapTriageDenyToHttpError(decision.reason, actor.role_level, row.primaryManagedSystemId);
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
    const bodyMentionIds = dedupe(mentionNodes.map((n) => n.attrs!.actor_id as string));

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
          and(eq(actors.workspaceId, actor.workspace_id), inArray(actors.id, requestMentionIds)),
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

    // 6b. PLAN-22 C7b — atomic attachment linking.
    if (input.attachment_ids && input.attachment_ids.length > 0) {
      try {
        await linkAttachments(tx, {
          attachmentIds: input.attachment_ids,
          parent: { kind: 'internal_comment', commentId: inserted.id },
          uploaderActorId: actor.actor_id,
        });
      } catch (err) {
        if (err instanceof LinkAttachmentsRejected) {
          throw new HttpError(
            'validation.failed',
            `attachment_ids[${err.index}] rejected: ${err.reason}`,
            linkRejectedFields(err),
          );
        }
        throw err;
      }
    }

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
        attachment_ids: input.attachment_ids ?? [],
      },
    });

    // 8. Refresh envelope.
    const vocEnvelope = await deps.vocReadService.composeDetailEnvelope({
      tx,
      actor: {
        actor_id: actor.actor_id,
        workspace_id: actor.workspace_id,
        role_level: actor.role_level,
      },
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

  // ── Application commands (#392) ───────────────────────────────────────────
  // Caller contract for HTTP and non-HTTP entry: each command owns the
  // complete atomic frame (transaction + advisory lock + idempotency
  // lookup/replay/record) and returns exactly what the routes used to
  // assemble. The Tx-aware functions above are internals — cluster
  // candidate-apply and public-update-review-candidates delegate to them
  // with the CALLER's tx.

  async function postPublicUpdateCommand(args: {
    actor: ConversationActor;
    vocId: string;
    input: PublicUpdateRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: PublicUpdateEnvelope }> {
    const { actor, vocId, input, idempotencyKey, requestHash } = args;
    return runConversationCommand({
      db: deps.db,
      idempotencyService: deps.idempotencyService,
      actorId: actor.actor_id,
      idempotencyKey,
      requestHash,
      work: (tx) => postPublicUpdate({ tx, actor, vocId, input }),
    });
  }

  async function postReporterReplyCommand(args: {
    actor: ConversationActor;
    vocId: string;
    input: ReporterReplyRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: ReporterReplyEnvelope }> {
    const { actor, vocId, input, idempotencyKey, requestHash } = args;
    return runConversationCommand({
      db: deps.db,
      idempotencyService: deps.idempotencyService,
      actorId: actor.actor_id,
      idempotencyKey,
      requestHash,
      work: (tx) => postReporterReply({ tx, actor, vocId, input }),
    });
  }

  async function postInternalCommentCommand(args: {
    actor: ConversationActor;
    vocId: string;
    input: InternalCommentRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: InternalCommentEnvelope }> {
    const { actor, vocId, input, idempotencyKey, requestHash } = args;
    return runConversationCommand({
      db: deps.db,
      idempotencyService: deps.idempotencyService,
      actorId: actor.actor_id,
      idempotencyKey,
      requestHash,
      work: (tx) => postInternalComment({ tx, actor, vocId, input }),
    });
  }

  return {
    postPublicUpdate,
    postReporterReply,
    postInternalComment,
    postPublicUpdateCommand,
    postReporterReplyCommand,
    postInternalCommentCommand,
    evaluateReporterStatusGate,
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
