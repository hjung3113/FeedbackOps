import { sql } from 'drizzle-orm';
import { type PgBoss, fromDrizzle } from 'pg-boss';

import type { NotificationEventType, NotificationSubjectType } from './catalogue.js';

/** Any drizzle transaction handle; only `execute` is needed to enqueue inside it. */
export type NotificationTx = Parameters<typeof fromDrizzle>[0];

export const NOTIFICATION_DISPATCH_QUEUE = 'notifications.dispatch';

export interface NotificationJobPayload {
  workspace_id: string;
  actor_id: string;
  event_type: NotificationEventType;
  subject_type: NotificationSubjectType;
  subject_id: string;
  summary: string;
  detail: Record<string, unknown>;
  correlation_id: string;
}

export interface NotificationDispatcher {
  enqueue(tx: NotificationTx, payload: NotificationJobPayload): Promise<void>;
}

export function createPgBossNotificationDispatcher(
  boss: Pick<PgBoss, 'send'>,
): NotificationDispatcher {
  return {
    async enqueue(tx, payload) {
      await boss.send(NOTIFICATION_DISPATCH_QUEUE, payload, { db: fromDrizzle(tx, sql) });
    },
  };
}

export function createNoopNotificationDispatcher(): NotificationDispatcher {
  return { enqueue: async () => {} };
}

export interface RecordingNotificationDispatcher extends NotificationDispatcher {
  readonly jobs: NotificationJobPayload[];
}

export function createRecordingNotificationDispatcher(): RecordingNotificationDispatcher {
  const jobs: NotificationJobPayload[] = [];
  return {
    jobs,
    async enqueue(_tx, payload) {
      jobs.push(payload);
    },
  };
}
