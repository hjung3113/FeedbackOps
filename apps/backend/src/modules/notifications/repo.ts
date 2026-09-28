import { and, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Db } from '../../db/client.js';
import { notifications } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import { encodeCommentCursor } from '../../lib/pg-timestamp.js';

const cursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

export type NotificationCursor = z.infer<typeof cursorSchema>;
export type NotificationRow = typeof notifications.$inferSelect;

export interface ListNotificationRowsArgs {
  workspace_id: string;
  actor_id: string;
  unread?: boolean;
  include_archived: boolean;
  limit: number;
  cursor?: NotificationCursor;
}

export function decodeNotificationCursor(raw: string): NotificationCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw fail();

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw fail();
  }
  const result = cursorSchema.safeParse(parsed);
  if (!result.success) throw fail();
  return result.data;
}

export async function listNotificationRows(db: Db, args: ListNotificationRowsArgs) {
  const baseFilters = [
    eq(notifications.workspaceId, args.workspace_id),
    eq(notifications.actorId, args.actor_id),
  ];
  const pageFilters = [...baseFilters];
  if (args.unread === true) pageFilters.push(isNull(notifications.readAt));
  if (args.unread === false) pageFilters.push(isNotNull(notifications.readAt));
  if (!args.include_archived) pageFilters.push(isNull(notifications.archivedAt));
  if (args.cursor) {
    pageFilters.push(sql`(${notifications.createdAt}, ${notifications.id}) < (
      ${args.cursor.createdAt}::timestamptz, ${args.cursor.id}::uuid
    )`);
  }

  const [rows, unreadCounts] = await Promise.all([
    db
      .select({
        id: notifications.id,
        eventType: notifications.eventType,
        subjectType: notifications.subjectType,
        subjectId: notifications.subjectId,
        summary: notifications.summary,
        detail: notifications.detail,
        createdAt: notifications.createdAt,
        createdAtRaw: sql<string>`${notifications.createdAt}::text`,
        readAt: notifications.readAt,
        archivedAt: notifications.archivedAt,
      })
      .from(notifications)
      .where(and(...pageFilters))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(args.limit + 1),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(...baseFilters, isNull(notifications.readAt), isNull(notifications.archivedAt))),
  ]);

  const has_more = rows.length > args.limit;
  const items = rows.slice(0, args.limit);
  const last = items.at(-1);
  return {
    items,
    has_more,
    cursor:
      has_more && last
        ? encodeCommentCursor({ createdAt: last.createdAtRaw, id: last.id })
        : undefined,
    unread_count: unreadCounts[0]?.value ?? 0,
  };
}

export async function markNotificationRead(
  db: Db,
  args: { workspace_id: string; actor_id: string; id: string },
): Promise<NotificationRow | undefined> {
  const rows = await db
    .update(notifications)
    .set({ readAt: sql`COALESCE(${notifications.readAt}, now())` })
    .where(
      and(
        eq(notifications.id, args.id),
        eq(notifications.workspaceId, args.workspace_id),
        eq(notifications.actorId, args.actor_id),
      ),
    )
    .returning();
  return rows[0];
}

export async function archiveNotification(
  db: Db,
  args: { workspace_id: string; actor_id: string; id: string },
): Promise<NotificationRow | undefined> {
  const rows = await db
    .update(notifications)
    .set({ archivedAt: sql`COALESCE(${notifications.archivedAt}, now())` })
    .where(
      and(
        eq(notifications.id, args.id),
        eq(notifications.workspaceId, args.workspace_id),
        eq(notifications.actorId, args.actor_id),
      ),
    )
    .returning();
  return rows[0];
}
