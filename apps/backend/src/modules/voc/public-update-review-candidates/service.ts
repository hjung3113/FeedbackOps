import type { Db } from "../../../db/client.js";
import type { AuditService } from "../../core/audit/audit-service.js";
import { insertPublicUpdateReviewCandidate } from "./repo.js";

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
        await deps.auditService.record(tx, {
          workspace_id: input.workspace_id,
          actor_id: input.triggered_by_actor_id,
          event_type: "public_update_review_candidate_created",
          subject_type: "voc",
          subject_id: link.voc_id,
          summary: "Public Update review candidate created for released Task",
          detail: {
            candidate_id: candidate.id,
            voc_id: link.voc_id,
            source_task_id: input.task_id,
            source_entity_link_id: link.entity_link_id,
            release_event_id: input.release_event_id,
            correlation_id: input.correlation_id,
          },
        });
      }
      return { inserted };
    });
  }
  return { createForReleasedTask };
}

export type PublicUpdateReviewCandidatesService = ReturnType<
  typeof createPublicUpdateReviewCandidatesService
>;
