import { and, eq } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { tasks } from '../../../db/schema/task.js';
import { vocs } from '../../../db/schema/voc.js';
import type { AuditService } from '../../core/audit/audit-service.js';
import type { NotificationNotifier } from '../../notifications/index.js';
import { insertPublicUpdateReviewCandidate } from './repo.js';

export interface ReleasedReviewCandidateInput {
  workspace_id: string;
  task_id: string;
  release_event_id: string;
  correlation_id: string;
  triggered_by_actor_id: string;
  linked_vocs: Array<{ voc_id: string; entity_link_id: string }>;
}

/** VOC-owned cross-system command invoked by the Task pg-boss worker. */
export function createPublicUpdateReviewCandidatesService(deps: {
  db: Db;
  auditService: AuditService;
  notify: NotificationNotifier;
}) {
  async function createForReleasedTask(
    input: ReleasedReviewCandidateInput,
  ): Promise<{ inserted: number }> {
    return deps.db.transaction(async (tx) => {
      let inserted = 0;
      for (const link of input.linked_vocs) {
        const candidate = await insertPublicUpdateReviewCandidate(tx, {
          workspace_id: input.workspace_id,
          voc_id: link.voc_id,
          source_task_id: input.task_id,
          source_entity_link_id: link.entity_link_id,
          release_event_id: input.release_event_id,
          correlation_id: input.correlation_id,
          triggered_by_actor_id: input.triggered_by_actor_id,
        });
        if (!candidate) continue;
        inserted += 1;

        const releaseContextRows = await tx
          .select({
            ownerUserId: vocs.ownerUserId,
            reporterId: vocs.reporterId,
            assigneeActorId: tasks.assigneeActorId,
          })
          .from(vocs)
          .innerJoin(
            tasks,
            and(eq(tasks.id, input.task_id), eq(tasks.workspaceId, input.workspace_id)),
          )
          .where(and(eq(vocs.id, link.voc_id), eq(vocs.workspaceId, input.workspace_id)))
          .limit(1);
        const releaseContext = releaseContextRows[0];
        if (!releaseContext) {
          throw new Error('released Task review candidate is missing its Task or VOC');
        }

        await deps.auditService.record(tx, {
          workspace_id: input.workspace_id,
          actor_id: input.triggered_by_actor_id,
          event_type: 'public_update_review_candidate_created',
          subject_type: 'voc',
          subject_id: link.voc_id,
          summary: 'Public Update review candidate created for released Task',
          detail: {
            candidate_id: candidate.id,
            voc_id: link.voc_id,
            source_task_id: input.task_id,
            source_entity_link_id: link.entity_link_id,
            release_event_id: input.release_event_id,
            correlation_id: input.correlation_id,
          },
        });

        const excludedActorIds = new Set(
          [input.triggered_by_actor_id, releaseContext.assigneeActorId, releaseContext.reporterId]
            .filter((actorId): actorId is string => actorId !== null)
            .map(String),
        );
        if (releaseContext.ownerUserId && !excludedActorIds.has(releaseContext.ownerUserId)) {
          await deps.notify(tx, 'task.released', {
            workspace_id: input.workspace_id,
            actor_ids: [releaseContext.ownerUserId],
            subject_id: candidate.id,
            correlation_id: input.correlation_id,
            detail: { voc_id: link.voc_id, task_id: input.task_id },
            params: {},
          });
        }
      }
      return { inserted };
    });
  }
  return { createForReleasedTask };
}

export type PublicUpdateReviewCandidatesService = ReturnType<
  typeof createPublicUpdateReviewCandidatesService
>;
