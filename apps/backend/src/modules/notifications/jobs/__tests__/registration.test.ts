import type { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import type { Db } from '../../../../db/client.js';
import type { JobLog } from '../../../../lib/job-log.js';
import {
  type NotificationEmailChannelConfig,
  createNotificationEmailChannel,
} from '../../channel-factory.js';
import { MockEmailChannel } from '../../channels.js';
import { registerNotificationJobs } from '../index.js';

const silentLog: JobLog = { info: () => {}, warn: () => {}, error: () => {} };

function channelConfig(channel: 'mock' | 'smtp'): NotificationEmailChannelConfig {
  return {
    NOTIFICATION_EMAIL_CHANNEL: channel,
    SMTP_HOST: channel === 'smtp' ? 'relay.example.test' : undefined,
    SMTP_PORT: channel === 'smtp' ? 587 : undefined,
    SMTP_USERNAME: undefined,
    SMTP_PASSWORD: undefined,
    SMTP_FROM: channel === 'smtp' ? 'notifications@example.test' : undefined,
  };
}

describe('notification job registration', () => {
  it('fails clearly when the migration-owned queue is absent', async () => {
    const boss = {
      getQueues: async () => [],
    } as unknown as PgBoss;

    await expect(
      registerNotificationJobs(boss, {
        db: {} as Db,
        channel: { send: async () => {} },
        log: silentLog,
      }),
    ).rejects.toThrow("pg-boss queue 'notifications.dispatch' is not pre-created");
  });

  it('creates the configured email channel', async () => {
    const mockChannel = await createNotificationEmailChannel(silentLog, channelConfig('mock'));
    expect(mockChannel).toBeInstanceOf(MockEmailChannel);

    const smtpChannel = await createNotificationEmailChannel(silentLog, channelConfig('smtp'));
    expect(smtpChannel.constructor.name).toBe('SmtpEmailChannel');
  });
});
