import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import type { JobLog } from '../../../lib/job-log.js';
import type { NotificationChannel } from '../channels.js';
import { registerNotificationDispatch } from './dispatch.js';

export interface NotificationJobDeps {
  db: Db;
  channel: NotificationChannel;
  log: JobLog;
}

export async function registerNotificationJobs(
  boss: PgBoss,
  deps: NotificationJobDeps,
): Promise<void> {
  await registerNotificationDispatch(boss, deps);
}

export {
  notificationDispatchHandler,
  registerNotificationDispatch,
  type NotificationDispatchDeps,
} from './dispatch.js';
export { NOTIFICATION_DISPATCH_QUEUE } from '../port.js';
