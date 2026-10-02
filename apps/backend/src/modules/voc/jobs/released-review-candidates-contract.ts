import type { PgBoss } from 'pg-boss';

export const TASK_RELEASED_REVIEW_CANDIDATES_QUEUE = 'tasks.create_public_update_review_candidates';

export interface TaskReleasedReviewCandidatesPayload {
  workspace_id: string;
  task_id: string;
  release_event_id: string;
  correlation_id: string;
  triggered_by_actor_id: string;
  linked_vocs: Array<{ voc_id: string; entity_link_id: string }>;
}

export function enqueueReleasedTaskReviewCandidates(
  boss: Pick<PgBoss, 'send'>,
  payload: TaskReleasedReviewCandidatesPayload,
  options: NonNullable<Parameters<PgBoss['send']>[2]>,
) {
  return boss.send(TASK_RELEASED_REVIEW_CANDIDATES_QUEUE, payload, options);
}
