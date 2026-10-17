import type { PgBoss } from 'pg-boss';
import type { Db } from '../../../db/client.js';
import { JOB_WORK_OPTIONS, type JobLog, withJobLogging } from '../../../lib/job-log.js';
import { cleanupPreview } from './repo.js';

export const VOC_SIMILARITY_PREVIEW_CLEANUP_QUEUE = 'voc.similarity_preview_cleanup';
export const VOC_SIMILARITY_PREVIEW_CLEANUP_CRON = '*/10 * * * *';
export async function registerSimilarityPreviewCleanup(
  boss: PgBoss,
  deps: { db: Db; log: JobLog },
): Promise<void> {
  const queues = await boss.getQueues();
  if (!queues.some((queue) => queue.name === VOC_SIMILARITY_PREVIEW_CLEANUP_QUEUE)) {
    throw new Error(
      `pg-boss queue '${VOC_SIMILARITY_PREVIEW_CLEANUP_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  }
  await boss.work(
    VOC_SIMILARITY_PREVIEW_CLEANUP_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(deps.log, VOC_SIMILARITY_PREVIEW_CLEANUP_QUEUE, async () => {
      await cleanupPreview(deps.db);
    }),
  );
  await boss.schedule(VOC_SIMILARITY_PREVIEW_CLEANUP_QUEUE, VOC_SIMILARITY_PREVIEW_CLEANUP_CRON, {
    correlation_id: 'cron',
  });
}
