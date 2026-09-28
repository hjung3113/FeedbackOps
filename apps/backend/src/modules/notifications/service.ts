import type {
  ListNotificationsResponse,
  NotificationDto,
  NotificationEventType as SharedNotificationEventType,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { NotificationEventType } from './catalogue.js';
import { createNotificationNotifier } from './dispatcher.js';
import type { NotificationDispatcher } from './port.js';
import {
  archiveNotification,
  decodeNotificationCursor,
  listNotificationRows,
  markNotificationRead,
} from './repo.js';

export interface NotificationActor {
  actor_id: string;
  workspace_id: string;
}

export interface ListNotificationsQuery {
  unread?: boolean;
  include_archived: boolean;
  limit: number;
  cursor?: string;
}

export function createNotificationService(deps: {
  db: Db;
  notificationDispatcher: NotificationDispatcher;
}) {
  const notify = createNotificationNotifier(deps.notificationDispatcher);

  function toDto(row: {
    id: string;
    eventType: string;
    subjectType: string;
    subjectId: string;
    summary: string;
    detail: unknown;
    createdAt: Date;
    readAt: Date | null;
    archivedAt: Date | null;
  }): NotificationDto {
    return {
      id: row.id,
      event_type: row.eventType as SharedNotificationEventType,
      subject_type: row.subjectType as NotificationDto['subject_type'],
      subject_id: row.subjectId,
      summary: row.summary,
      detail: row.detail as Record<string, unknown>,
      created_at: row.createdAt.toISOString(),
      read_at: row.readAt?.toISOString() ?? null,
      archived_at: row.archivedAt?.toISOString() ?? null,
    };
  }

  function notFound(): HttpError {
    return new HttpError('not_found.record', 'notification not found');
  }

  return {
    notify,

    async list(
      actor: NotificationActor,
      query: ListNotificationsQuery,
    ): Promise<ListNotificationsResponse> {
      const page = await listNotificationRows(deps.db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        ...(query.unread === undefined ? {} : { unread: query.unread }),
        include_archived: query.include_archived,
        limit: query.limit,
        ...(query.cursor ? { cursor: decodeNotificationCursor(query.cursor) } : {}),
      });
      return {
        items: page.items.map(toDto),
        page: {
          ...(page.cursor ? { cursor: page.cursor } : {}),
          has_more: page.has_more,
        },
        unread_count: page.unread_count,
      };
    },

    async markRead(actor: NotificationActor, id: string): Promise<NotificationDto> {
      const row = await markNotificationRead(deps.db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        id,
      });
      if (!row) throw notFound();
      return toDto(row);
    },

    async archive(actor: NotificationActor, id: string): Promise<NotificationDto> {
      const row = await archiveNotification(deps.db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        id,
      });
      if (!row) throw notFound();
      return toDto(row);
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
export type { NotificationEventType };
