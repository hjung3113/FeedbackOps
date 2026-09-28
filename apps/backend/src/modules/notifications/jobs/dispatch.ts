import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Job, PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import { actors, notifications } from '../../../db/schema/core.js';
import { JOB_WORK_OPTIONS, type JobLog, withJobLogging } from '../../../lib/job-log.js';
import { isNotificationEventType, notificationCatalogue } from '../catalogue.js';
import type { NotificationChannel } from '../channels.js';
import { NOTIFICATION_DISPATCH_QUEUE, type NotificationJobPayload } from '../port.js';

export interface NotificationDispatchDeps {
  db: Db;
  channel: NotificationChannel;
}

export function notificationDispatchHandler(deps: NotificationDispatchDeps) {
  return async (jobs: Array<{ data: NotificationJobPayload }>): Promise<void> => {
    for (const job of jobs) {
      const payload = job.data;
      if (!isNotificationEventType(payload.event_type)) {
        throw new Error(`Unknown notification event_type '${String(payload.event_type)}'.`);
      }
      const definition = notificationCatalogue[payload.event_type];

      await deps.db.transaction(async (tx) => {
        await tx
          .insert(notifications)
          .values({
            workspaceId: payload.workspace_id,
            actorId: payload.actor_id,
            eventType: payload.event_type,
            subjectType: payload.subject_type,
            subjectId: payload.subject_id,
            summary: payload.summary,
            detail: payload.detail,
            correlationId: payload.correlation_id,
          })
          .onConflictDoNothing({
            target: [
              notifications.workspaceId,
              notifications.actorId,
              notifications.eventType,
              notifications.subjectId,
              notifications.correlationId,
            ],
          });

        if (!definition.email) return;

        const claimed = await tx
          .update(notifications)
          .set({ emailSentAt: sql`now()` })
          .where(
            and(
              eq(notifications.workspaceId, payload.workspace_id),
              eq(notifications.actorId, payload.actor_id),
              eq(notifications.eventType, payload.event_type),
              eq(notifications.subjectId, payload.subject_id),
              eq(notifications.correlationId, payload.correlation_id),
              isNull(notifications.emailSentAt),
            ),
          )
          .returning({ id: notifications.id });
        if (claimed.length === 0) return;

        const recipients = await tx
          .select({ email: actors.email })
          .from(actors)
          .where(and(eq(actors.id, payload.actor_id), eq(actors.workspaceId, payload.workspace_id)))
          .limit(1);
        const recipientEmail = recipients[0]?.email;
        if (!recipientEmail) {
          throw new Error(
            `Notification recipient '${payload.actor_id}' is missing from workspace '${payload.workspace_id}'.`,
          );
        }

        await deps.channel.send({
          workspace_id: payload.workspace_id,
          actor_id: payload.actor_id,
          event_type: payload.event_type,
          subject_type: payload.subject_type,
          subject_id: payload.subject_id,
          locale: 'ko-KR',
          summary: payload.summary,
          in_app: true,
          email: true,
          recipient_email: recipientEmail,
        });
      });
    }
  };
}

function notificationJobFields(job: Job<NotificationJobPayload>): Record<string, unknown> {
  return {
    workspace_id: job.data.workspace_id,
    actor_id: job.data.actor_id,
    event_type: job.data.event_type,
    subject_type: job.data.subject_type,
    subject_id: job.data.subject_id,
  };
}

export async function registerNotificationDispatch(
  boss: PgBoss,
  deps: NotificationDispatchDeps & { log: JobLog },
): Promise<void> {
  const queues = await boss.getQueues([NOTIFICATION_DISPATCH_QUEUE]);
  if (queues.length === 0) {
    throw new Error(
      `pg-boss queue '${NOTIFICATION_DISPATCH_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,
    );
  }
  await boss.work<NotificationJobPayload>(
    NOTIFICATION_DISPATCH_QUEUE,
    JOB_WORK_OPTIONS,
    withJobLogging(
      deps.log,
      NOTIFICATION_DISPATCH_QUEUE,
      notificationDispatchHandler(deps),
      notificationJobFields,
    ),
  );
}
