// Shared lock, permission, sanitization, and idempotency frames for VOC conversations.
import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import { sanitizeRichContentOrThrow } from '../../../lib/rich-content/sanitize-or-throw.js';
import type { RoleLevel } from '../../auth/session-service.js';
import type { IdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { runIdempotentCommand } from '../../core/idempotency/idempotent-command.js';
import { lockManagedSystem } from '../../managed-systems/index.js';
import type { CheckService } from '../../permissions/check-service.js';
import type { ConversationActor } from '../conversation-service.js';
import { selectVocForUpdate } from '../repo.js';

type LockedConversationVoc = NonNullable<Awaited<ReturnType<typeof selectVocForUpdate>>>;

// Step 1 of every conversation surface: FOR UPDATE lock + archive checks;
// 1b. parent Managed System archive guard (issue #16 AC — archived parent → 409).
export async function lockVocForConversationCommand(
  tx: Tx,
  workspaceId: string,
  vocId: string,
): Promise<LockedConversationVoc> {
  const row = await selectVocForUpdate(tx, workspaceId, vocId);
  if (!row) throw new HttpError('not_found.record', 'voc not found');
  if (row.archivedAt !== null) throw new HttpError('conflict.record_archived', 'voc is archived');

  const ms = await lockManagedSystem(tx, workspaceId, row.primaryManagedSystemId);
  if (!ms) throw new HttpError('not_found.record', 'managed system not found');
  if (ms.archived_at !== null) {
    throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
      fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
    });
  }

  return row;
}

export function runConversationCommand<TBody>(args: {
  db: Db;
  idempotencyService: Pick<IdempotencyService, 'lookup' | 'record'>;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  work: (tx: Tx) => Promise<TBody>;
}): Promise<{ status: number; body: TBody }> {
  return runIdempotentCommand({ ...args, status: 201 });
}

// ── Permission helper (reused from service.ts pattern) ────────────────────────

/**
 * Re-evaluates voc.triage capability for the actor on the given MS inside `tx`.
 * Returns the decision object; callers map deny reasons to HttpError codes.
 */
export async function checkTriageCapability(
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
export function mapTriageDenyToHttpError(
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
  return new HttpError('permission.denied', `voc.triage denied: ${reason}`, { reason });
}

// ── Sanitize helper ───────────────────────────────────────────────────────────

export function sanitizeOrThrow(
  surface: 'public-update' | 'reporter-reply' | 'internal-comment',
  doc: unknown,
): unknown {
  return sanitizeRichContentOrThrow({
    surface,
    doc,
    fieldPath: ['body_rich_content'],
  });
}

/**
 * Detects whether an error originated from the `enforce_reporter_reply_actor`
 * DB trigger. The trigger raises an exception with message
 * 'voc_reporter_reply.actor_must_match_reporter' (migration 0010).
 * We match on the message text; sqlstate P0001 (raise_exception) is the
 * expected Postgres error code for application-level RAISE EXCEPTION.
 */
export function isTriggerActorMismatchError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  // pg-node surfaces the message on `message` and the sqlstate on `code`.
  // The trigger RAISE EXCEPTION message is 'voc_reporter_reply_actor_must_be_reporter'
  // (migration 0010 function voc_reporter_reply_actor_check).
  if (
    typeof e.message === 'string' &&
    e.message.includes('voc_reporter_reply_actor_must_be_reporter')
  ) {
    return true;
  }
  // Belt-and-suspenders: also match on legacy message variant.
  if (
    typeof e.message === 'string' &&
    e.message.includes('voc_reporter_reply.actor_must_match_reporter')
  ) {
    return true;
  }
  // Belt-and-suspenders: also match on routine / constraint name if present.
  if (typeof e.routine === 'string' && e.routine.includes('enforce_reporter_reply_actor')) {
    return true;
  }
  return false;
}
