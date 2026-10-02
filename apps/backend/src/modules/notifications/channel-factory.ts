import type { AppConfig } from '../../config.js';
import type { JobLog } from '../../lib/job-log.js';
import { MockEmailChannel, type NotificationChannel } from './channels.js';

export type NotificationEmailChannelConfig = Pick<
  AppConfig,
  | 'NOTIFICATION_EMAIL_CHANNEL'
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_USERNAME'
  | 'SMTP_PASSWORD'
  | 'SMTP_FROM'
>;

export async function createNotificationEmailChannel(
  log: JobLog,
  config: NotificationEmailChannelConfig,
): Promise<NotificationChannel> {
  if (config.NOTIFICATION_EMAIL_CHANNEL === 'mock') return new MockEmailChannel(log);
  if (config.NOTIFICATION_EMAIL_CHANNEL === 'smtp') {
    const { SMTP_HOST, SMTP_PORT, SMTP_FROM } = config;
    if (!SMTP_HOST || SMTP_PORT === undefined || !SMTP_FROM) {
      throw new Error(
        'SMTP_HOST, SMTP_PORT, and SMTP_FROM are required when NOTIFICATION_EMAIL_CHANNEL=smtp.',
      );
    }

    const { SmtpEmailChannel } = await import('./smtp.js');
    return new SmtpEmailChannel(
      {
        host: SMTP_HOST,
        port: SMTP_PORT,
        from: SMTP_FROM,
        username: config.SMTP_USERNAME,
        password: config.SMTP_PASSWORD,
      },
      log,
    );
  }
  throw new Error(
    `Unsupported NOTIFICATION_EMAIL_CHANNEL '${String(config.NOTIFICATION_EMAIL_CHANNEL)}'; expected 'mock' or 'smtp'.`,
  );
}
