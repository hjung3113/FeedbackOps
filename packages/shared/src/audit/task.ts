// Task board audit detail schemas (Slice 7 #138).
// `task_status_changed` records a board transition; `task_comment_created`
// records a Task comment. The public-update review-candidate events are
// VOC events and live in voc.ts. Imported by audit-events.ts to register
// into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const TASK_AUDIT_EVENT_TYPES = [
  'task_status_changed',
  'task_comment_created',
] as const;

export const taskStatusChangedDetailSchema = z
  .object({
    from: z.enum(['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened']),
    to: z.enum(['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened']),
    reason: z.string().min(1).max(1000).optional(),
  })
  .strict();
export type TaskStatusChangedDetail = z.infer<typeof taskStatusChangedDetailSchema>;

export const taskCommentCreatedDetailSchema = z.object({
  task_id: z.string().uuid(),
  comment_id: z.string().uuid(),
  actor_id: z.string().uuid(),
  mentions: z.array(z.string().uuid()),
});
export type TaskCommentCreatedDetail = z.infer<typeof taskCommentCreatedDetailSchema>;

export const TASK_AUDIT_EVENT_DETAIL_SCHEMAS = {
  task_status_changed: taskStatusChangedDetailSchema,
  task_comment_created: taskCommentCreatedDetailSchema,
} as const satisfies Record<
  (typeof TASK_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;
