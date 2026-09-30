import type {
  ListNotificationsResponse,
  NotificationDto,
  NotificationSubjectReference,
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
  role_level: 'admin' | 'developer' | 'user';
}

type NotificationRow = {
  id: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  summary: string;
  detail: unknown;
  createdAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
};

const SUBJECT_REFERENCE_CONCURRENCY = 8;

export interface ListNotificationsQuery {
  unread?: boolean;
  include_archived: boolean;
  limit: number;
  cursor?: string;
}

export function createNotificationService(deps: {
  db: Db;
  notificationDispatcher: NotificationDispatcher;
  resolveSubjectReference: (args: {
    actor: NotificationActor;
    subject_type: NotificationDto['subject_type'];
    subject_id: string;
  }) => Promise<NotificationSubjectReference>;
}) {
  const notify = createNotificationNotifier(deps.notificationDispatcher);

  function toDto(row: NotificationRow): Omit<NotificationDto, 'subject_ref'> {
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

  async function toDtosForActor(
    actor: NotificationActor,
    rows: readonly NotificationRow[],
  ): Promise<NotificationDto[]> {
    const uniqueSubjects = new Map<
      string,
      { subject_type: NotificationDto['subject_type']; subject_id: string }
    >();
    for (const row of rows) {
      const key = `${row.subjectType}:${row.subjectId}`;
      if (!uniqueSubjects.has(key)) {
        uniqueSubjects.set(key, {
          subject_type: row.subjectType as NotificationDto['subject_type'],
          subject_id: row.subjectId,
        });
      }
    }

    const subjectEntries = [...uniqueSubjects.entries()];
    const resolvedSubjects = new Map<string, NotificationSubjectReference>();
    let nextIndex = 0;
    async function resolveWorker(): Promise<void> {
      while (nextIndex < subjectEntries.length) {
        const index = nextIndex;
        nextIndex += 1;
        const entry = subjectEntries[index];
        if (!entry) return;
        const [key, subject] = entry;
        resolvedSubjects.set(
          key,
          await deps.resolveSubjectReference({
            actor,
            subject_type: subject.subject_type,
            subject_id: subject.subject_id,
          }),
        );
      }
    }

    const workerCount = Math.min(SUBJECT_REFERENCE_CONCURRENCY, subjectEntries.length);
    await Promise.all(Array.from({ length: workerCount }, () => resolveWorker()));

    return rows.map((row) => {
      const key = `${row.subjectType}:${row.subjectId}`;
      return {
        ...toDto(row),
        subject_ref: resolvedSubjects.get(key) ?? { visibility_state: 'unavailable' },
      };
    });
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
        items: await toDtosForActor(actor, page.items),
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
      return (
        (await toDtosForActor(actor, [row]))[0] ?? {
          ...toDto(row),
          subject_ref: { visibility_state: 'unavailable' },
        }
      );
    },

    async archive(actor: NotificationActor, id: string): Promise<NotificationDto> {
      const row = await archiveNotification(deps.db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        id,
      });
      if (!row) throw notFound();
      return (
        (await toDtosForActor(actor, [row]))[0] ?? {
          ...toDto(row),
          subject_ref: { visibility_state: 'unavailable' },
        }
      );
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
export type { NotificationEventType };
