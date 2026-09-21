import type { Job, PgBoss } from "pg-boss";

import { JOB_WORK_OPTIONS, withJobLogging, type JobLog } from "../../../lib/job-log.js";
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

/**
 * Allowlisted payload id fields added to this queue's job log lines
 * (ADR-0013: bounded fields only — ids, never payload bodies).
 */
function releasedReviewFields(
  job: Job<TaskReleasedReviewCandidatesPayload>,
): Record<string, unknown> {
  return {
    task_id: job.data.task_id,
    release_event_id: job.data.release_event_id,
  };
}

export async function registerReleasedReviewCandidates(
  boss: PgBoss,
  deps: {
    publicUpdateReviewCandidatesService: PublicUpdateReviewCandidatesService;
    log: JobLog;
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
    JOB_WORK_OPTIONS,
    withJobLogging(
      deps.log,
      TASK_RELEASED_REVIEW_CANDIDATES_QUEUE,
      releasedReviewCandidatesHandler(deps),
      releasedReviewFields,
    ),
  );
}
