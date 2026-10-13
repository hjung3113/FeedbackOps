import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DbHandle, createDb } from '../../../../db/client.js';
import type { JobLog } from '../../../../lib/job-log.js';
import { initBoss, shutdownBoss } from '../../../../lib/jobs.js';
import { RECOVERY_RECONCILE_QUEUE, registerDashboardJobs } from '../index.js';

const appUrl = process.env.DATABASE_URL ?? '';
const workspaceId = process.env.WORKSPACE_ID ?? '';
const log: JobLog = { info() {}, warn() {}, error() {} };

describe.skipIf(!appUrl || !workspaceId)('Dashboard recovery real-role boot', () => {
  let handle: DbHandle;
  let boss: Awaited<ReturnType<typeof initBoss>>;
  beforeAll(async () => {
    handle = createDb(appUrl);
    boss = await initBoss({ connectionString: appUrl, log });
    await registerDashboardJobs(boss, { db: handle.db, workspaceId, log });
  });
  afterAll(async () => {
    if (boss) await shutdownBoss(boss);
    await handle?.close();
  });
  it('uses the migrated retry policy and converges after a process restart', async () => {
    const queue = await handle.pool.query(
      'SELECT retry_limit, retry_delay, retry_backoff FROM pgboss.queue WHERE name=$1',
      [RECOVERY_RECONCILE_QUEUE],
    );
    expect(queue.rows).toEqual([{ retry_limit: 5, retry_delay: 30, retry_backoff: true }]);
    await shutdownBoss(boss);
    boss = await initBoss({ connectionString: appUrl, log });
    await registerDashboardJobs(boss, { db: handle.db, workspaceId, log });
    const schedules = await boss.getSchedules(RECOVERY_RECONCILE_QUEUE);
    expect(schedules.filter((s) => s.name === RECOVERY_RECONCILE_QUEUE)).toHaveLength(1);
    expect(schedules.find((s) => s.name === RECOVERY_RECONCILE_QUEUE)?.cron).toBe('*/5 * * * *');
  });
});
