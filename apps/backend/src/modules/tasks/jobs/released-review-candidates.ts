import type { PgBoss } from "pg-boss";

import type { PublicUpdateReviewCandidatesService } from "../../voc/public-update-review-candidates/service.js";

export const TASK_RELEASED_REVIEW_CANDIDATES_QUEUE =
  "tasks.create_public_update_review_candidates";

export interface TaskReleasedReviewCandidatesPayload {
  workspace_id: string;
  task_id: string;
  release_event_id: string;
  correlation_id: string;
  triggered_by_actor_id: string;
  linked_vocs: Array<{ voc_id: string; entity_link_id: string }>;
}

export function releasedReviewCandidatesHandler(deps: {
  publicUpdateReviewCandidatesService: PublicUpdateReviewCandidatesService;
}) {
  return async (jobs: Array<{ data: TaskReleasedReviewCandidatesPayload }>) => {
    for (const job of jobs) {
      await deps.publicUpdateReviewCandidatesService.createForReleasedTask(
        job.data,
      );
    }
  };
}

export async function registerReleasedReviewCandidates(
  boss: PgBoss,
  deps: {
    publicUpdateReviewCandidatesService: PublicUpdateReviewCandidatesService;
  },
): Promise<void> {
  const queues = await boss.getQueues([TASK_RELEASED_REVIEW_CANDIDATES_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${TASK_RELEASED_REVIEW_CANDIDATES_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  }
  await boss.work<TaskReleasedReviewCandidatesPayload>(
    TASK_RELEASED_REVIEW_CANDIDATES_QUEUE,
    releasedReviewCandidatesHandler(deps),
  );
}
