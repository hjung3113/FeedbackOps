import type { PgBoss } from "pg-boss";

import type { Db } from "../../../db/client.js";
import type { JobLog } from "../../../lib/job-log.js";
import type { PublicUpdateReviewCandidatesService } from "../../voc/public-update-review-candidates/service.js";
import { registerReleasedReviewCandidates } from "./released-review-candidates.js";

export interface TasksJobDeps {
  db: Db;
  publicUpdateReviewCandidatesService: PublicUpdateReviewCandidatesService;
  /** Structured job logger (ADR-0013, amended 2026-09-22). Required in prod wiring. */
  log: JobLog;
}

export async function registerTasksJobs(
  boss: PgBoss,
  deps: TasksJobDeps,
): Promise<void> {
  await registerReleasedReviewCandidates(boss, deps);
}

export {
  TASK_RELEASED_REVIEW_CANDIDATES_QUEUE,
  type TaskReleasedReviewCandidatesPayload,
} from "./released-review-candidates.js";
