import type { PgBoss } from 'pg-boss';

import {
  type NotificationDispatcher,
  type NotificationJobPayload,
  createPgBossNotificationDispatcher,
} from '../modules/notifications/port.js';

const FAIL_AFTER_ENQUEUE_SENTINEL = 'notification enqueue failed after successful enqueue';

export interface FailAfterEnqueueNotificationDispatcher {
  dispatcher: NotificationDispatcher;
  attemptedPayloads: NotificationJobPayload[];
}

export function createFailAfterEnqueueNotificationDispatcher(
  boss: Pick<PgBoss, 'send'>,
): FailAfterEnqueueNotificationDispatcher {
  const realDispatcher = createPgBossNotificationDispatcher(boss);
  const attemptedPayloads: NotificationJobPayload[] = [];

  return {
    attemptedPayloads,
    dispatcher: {
      async enqueue(tx, payload) {
        await realDispatcher.enqueue(tx, payload);
        attemptedPayloads.push(payload);
        throw new Error(FAIL_AFTER_ENQUEUE_SENTINEL);
      },
    },
  };
}
