import type { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import type { Db } from '../../../../db/client.js';
import type { JobLog } from '../../../../lib/job-log.js';
import { createNotificationEmailChannel } from '../../channel-factory.js';
import { MockEmailChannel } from '../../channels.js';
import { registerNotificationJobs } from '../index.js';

const silentLog: JobLog = { info: () => {}, warn: () => {}, error: () => {} };

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

  it('keeps SMTP unavailable in this build and creates the mock channel', () => {
    expect(() => createNotificationEmailChannel(silentLog, 'smtp')).toThrow(
      'NOTIFICATION_EMAIL_CHANNEL=smtp is not configured in this build.',
    );
    expect(createNotificationEmailChannel(silentLog, 'mock')).toBeInstanceOf(MockEmailChannel);
  });
});
