import { sql } from 'drizzle-orm';

import {
  type NotificationEventType,
  type NotificationSubjectType,
  type NotificationSummaryParamsByEvent,
  isNotificationEventType,
  notificationCatalogue,
} from './catalogue.js';
import type { NotificationDispatcher, NotificationTx } from './port.js';

export interface NotificationEnvelope<K extends NotificationEventType> {
  workspace_id: string;
  actor_ids: string[];
  subject_id: string;
  correlation_id: string;
  detail?: Record<string, unknown>;
  params: NotificationSummaryParamsByEvent[K];
}

export type NotificationNotifier = <K extends NotificationEventType>(
  tx: NotificationTx,
  eventType: K,
  envelope: NotificationEnvelope<K>,
) => Promise<void>;

export function createNotificationNotifier(
  dispatcher: NotificationDispatcher,
): NotificationNotifier {
  return async function notify<K extends NotificationEventType>(
    tx: NotificationTx,
    eventType: K,
    envelope: NotificationEnvelope<K>,
  ): Promise<void> {
    if (!isNotificationEventType(eventType)) {
      throw new Error(`Unknown notification event_type '${String(eventType)}'.`);
    }

    const recipientIds = [...new Set(envelope.actor_ids)];
    if (recipientIds.length === 0) return;

    const { rows: memberRows } = await tx.execute(
      sql`select id from core.actors where workspace_id = ${envelope.workspace_id} and id in (${sql.join(
        recipientIds.map((actorId) => sql`${actorId}`),
        sql`, `,
      )})`,
    );
    const workspaceMemberIds = new Set<string>(memberRows.map((row: { id: string }) => row.id));
    const workspaceRecipientIds = recipientIds.filter((actorId) => workspaceMemberIds.has(actorId));
    if (workspaceRecipientIds.length === 0) return;

    const definition = notificationCatalogue[eventType] as {
      subject_type: NotificationSubjectType;
      summary: (params: NotificationSummaryParamsByEvent[K]) => string;
    };
    const summary = definition.summary(envelope.params);
    for (const actorId of workspaceRecipientIds) {
      await dispatcher.enqueue(tx, {
        workspace_id: envelope.workspace_id,
        actor_id: actorId,
        event_type: eventType,
        subject_type: definition.subject_type,
        subject_id: envelope.subject_id,
        summary,
        detail: envelope.detail ?? {},
        correlation_id: envelope.correlation_id,
      });
    }
  };
}
