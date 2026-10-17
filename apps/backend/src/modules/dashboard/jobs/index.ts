import type { PgBoss } from 'pg-boss';
import type { Db } from '../../../db/client.js';
import { lockRecoveryCommand } from '../../../db/recovery-command-lock.js';
import { JOB_WORK_OPTIONS, type JobLog, withJobLogging } from '../../../lib/job-log.js';
import { observeOutcomeRecovery } from '../../surveys/recovery-presentation.js';
import { createOwnerRecoveryRecorder, readRecoveryDiscoveryPage } from '../truth.js';

export const RECOVERY_RECONCILE_QUEUE = 'dashboard.recovery_reconcile';
export type RecoveryReconcilePayload = {
  workspace_id: string;
  correlation_id: string;
  after?: { category: string; sourceId: string };
  outcome?: { surveyId: string; afterResponse?: string };
};
export async function reconcileRecoveryPage(deps: { db: Db }, payload: RecoveryReconcilePayload) {
  return deps.db.transaction(async (tx) => {
    await lockRecoveryCommand(tx, payload.workspace_id);
    const page = await readRecoveryDiscoveryPage(tx, payload.workspace_id, payload.after);
    await createOwnerRecoveryRecorder().discover(tx, payload.workspace_id, page.subjects);
    return {
      next: page.next,
      outcomeSurveys: [
        ...new Set(page.subjects.filter((s) => s.type === 'survey').map((s) => s.id)),
      ],
    };
  });
}
export async function registerDashboardJobs(
  boss: PgBoss,
  deps: { db: Db; workspaceId: string; log: JobLog },
) {
  if ((await boss.getQueues([RECOVERY_RECONCILE_QUEUE])).length === 0)
    throw new Error(
      `pg-boss queue '${RECOVERY_RECONCILE_QUEUE}' is not pre-created. Run migrations.`,
    );
  await boss.work<RecoveryReconcilePayload>(
    RECOVERY_RECONCILE_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(deps.log, RECOVERY_RECONCILE_QUEUE, async (jobs) => {
      for (const job of jobs) {
        const payload = {
          ...job.data,
          correlation_id: job.data.correlation_id === 'cron' ? job.id : job.data.correlation_id,
        };
        const outcome = payload.outcome;
        if (outcome) {
          const afterResponse = await deps.db.transaction((tx) =>
            observeOutcomeRecovery(
              tx,
              payload.workspace_id,
              outcome.surveyId,
              outcome.afterResponse,
            ),
          );
          if (afterResponse)
            await boss.send(RECOVERY_RECONCILE_QUEUE, {
              ...payload,
              outcome: { surveyId: outcome.surveyId, afterResponse },
            });
        } else {
          const { next, outcomeSurveys } = await reconcileRecoveryPage(deps, payload);
          if (next) await boss.send(RECOVERY_RECONCILE_QUEUE, { ...payload, after: next });
          for (const surveyId of outcomeSurveys)
            await boss.send(RECOVERY_RECONCILE_QUEUE, {
              workspace_id: payload.workspace_id,
              correlation_id: payload.correlation_id,
              outcome: { surveyId },
            });
        }
      }
    }),
  );
  await boss.schedule(RECOVERY_RECONCILE_QUEUE, '*/5 * * * *', {
    workspace_id: deps.workspaceId,
    correlation_id: 'cron',
  });
}
