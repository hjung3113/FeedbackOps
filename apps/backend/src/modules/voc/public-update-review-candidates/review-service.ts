import { sql } from 'drizzle-orm';

import type {
  ListPublicUpdateReviewCandidatesResponse,
  ResolvePublicUpdateReviewCandidateRequest,
  ResolvePublicUpdateReviewCandidateResponse,
} from '@fops/shared';
import { resolvePublicUpdateReviewCandidateResponseSchema } from '@fops/shared';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import type { RoleLevel } from '../../auth/session-service.js';
import type { AuditService } from '../../core/audit/audit-service.js';
import type { CheckService } from '../../permissions/check-service.js';
import type { ConversationService } from '../conversation-service.js';
import { selectVocForUpdate } from '../repo.js';

export interface ReviewCandidateActor {
  actor_id: string;
  workspace_id: string;
  role_level: RoleLevel;
}

type CandidateRow = {
  id: string;
  voc_id: string;
  source_task_id: string;
  created_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function createPublicUpdateReviewCandidateService(deps: {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  conversationService: ConversationService;
}) {
  async function requireTriage(tx: Tx, actor: ReviewCandidateActor, vocId: string) {
    const voc = await selectVocForUpdate(tx, actor.workspace_id, vocId);
    if (!voc || voc.archivedAt !== null) throw new HttpError('not_found.record', 'voc not found');
    const decision = await deps.checkService.checkCapability(
      actor,
      'voc.triage',
      { workspace_id: actor.workspace_id, managed_system_id: voc.primaryManagedSystemId },
      { tx },
    );
    if (decision.allow !== true) {
      // Scoped developers must not be able to probe the existence of another MS's VOC.
      if (actor.role_level === 'developer')
        throw new HttpError('not_found.record', 'voc not found');
      throw new HttpError('permission.denied', 'voc.triage capability required', {
        reason: decision.reason,
      });
    }
    return voc;
  }

  async function list(args: {
    actor: ReviewCandidateActor;
    vocId: string;
  }): Promise<ListPublicUpdateReviewCandidatesResponse> {
    return deps.db.transaction(async (tx) => {
      await requireTriage(tx, args.actor, args.vocId);
      const result = await tx.execute<CandidateRow>(sql`
        SELECT id, voc_id, source_task_id, created_at
          FROM voc.public_update_review_candidates
         WHERE workspace_id = ${args.actor.workspace_id}
           AND voc_id = ${args.vocId}
           AND status = 'pending'
         ORDER BY created_at ASC
      `);
      return {
        items: result.rows.map((row) => ({
          id: row.id,
          voc_id: row.voc_id,
          source_task_id: row.source_task_id,
          created_at: toIso(row.created_at),
        })),
      };
    });
  }

  async function resolve(args: {
    tx: Tx;
    actor: ReviewCandidateActor;
    vocId: string;
    input: ResolvePublicUpdateReviewCandidateRequest;
  }): Promise<ResolvePublicUpdateReviewCandidateResponse> {
    const voc = await requireTriage(args.tx, args.actor, args.vocId);
    if (args.input.action === 'apply') {
      const publicUpdate = await deps.conversationService.postPublicUpdate({
        tx: args.tx,
        actor: args.actor,
        vocId: args.vocId,
        input: args.input.public_update,
      });
      const changed = await args.tx.execute<{ id: string }>(sql`
        UPDATE voc.public_update_review_candidates
           SET status = 'actioned',
               resolved_by_actor_id = ${args.actor.actor_id},
               resolved_at = now(),
               actioned_public_update_id = ${publicUpdate.public_update.id},
               updated_at = now()
         WHERE id = ${args.input.candidate_id}
           AND workspace_id = ${args.actor.workspace_id}
           AND voc_id = ${args.vocId}
           AND status = 'pending'
        RETURNING id
      `);
      if (!changed.rows[0]) {
        throw new HttpError('conflict.stale_write', 'review candidate is already resolved');
      }
      return resolvePublicUpdateReviewCandidateResponseSchema.parse({
        candidate_id: args.input.candidate_id,
        action: 'apply' as const,
        public_update: publicUpdate,
      });
    }

    const changed = await args.tx.execute<{ id: string }>(sql`
      UPDATE voc.public_update_review_candidates
         SET status = 'dismissed',
             resolved_by_actor_id = ${args.actor.actor_id},
             resolved_at = now(),
             dismissal_reason = ${args.input.dismissal_reason},
             updated_at = now()
       WHERE id = ${args.input.candidate_id}
         AND workspace_id = ${args.actor.workspace_id}
         AND voc_id = ${args.vocId}
         AND status = 'pending'
      RETURNING id
    `);
    if (!changed.rows[0]) {
      throw new HttpError('conflict.stale_write', 'review candidate is already resolved');
    }
    await deps.auditService.record(args.tx, {
      workspace_id: args.actor.workspace_id,
      actor_id: args.actor.actor_id,
      event_type: 'public_update_review_candidate_dismissed',
      subject_type: 'voc',
      subject_id: args.vocId,
      summary: `Public-update review candidate dismissed for VOC ${voc.displayId}`,
      detail: {
        candidate_id: args.input.candidate_id,
        dismissal_reason: args.input.dismissal_reason,
      },
    });
    return { candidate_id: args.input.candidate_id, action: 'dismiss' as const };
  }

  return { list, resolve };
}

export type PublicUpdateReviewCandidateService = ReturnType<
  typeof createPublicUpdateReviewCandidateService
>;
