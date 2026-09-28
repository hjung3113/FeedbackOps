import type { JobLog } from '../../lib/job-log.js';
import { MockEmailChannel, type NotificationChannel } from './channels.js';

export function createNotificationEmailChannel(
  log: JobLog,
  channelName = process.env.NOTIFICATION_EMAIL_CHANNEL ?? 'mock',
): NotificationChannel {
  if (channelName === 'mock') return new MockEmailChannel(log);
  if (channelName === 'smtp') {
    throw new Error('NOTIFICATION_EMAIL_CHANNEL=smtp is not configured in this build.');
  }
  throw new Error(
    `Unsupported NOTIFICATION_EMAIL_CHANNEL '${channelName}'; expected 'mock' or 'smtp'.`,
  );
}
