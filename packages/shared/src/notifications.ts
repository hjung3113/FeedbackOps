import { z } from 'zod';

export const notificationEventTypeSchema = z.enum([
  'voc.assigned_to_me',
  'voc.reporter_replied',
  'voc.severity_set_high_or_critical',
  'task_request.approved',
  'task_request.rejected',
  'task_request.needs_more_evidence',
  'task.assigned_to_me',
  'task.released',
  'permission_request.submitted',
  'permission_request.decided',
]);
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;

export const notificationDtoSchema = z
  .object({
    id: z.string().uuid(),
    event_type: notificationEventTypeSchema,
    subject_type: z.enum([
      'voc',
      'task_request',
      'task',
      'permission_request',
      'public_update_review_candidate',
    ]),
    subject_id: z.string().uuid(),
    summary: z.string(),
    detail: z.record(z.string(), z.unknown()),
    created_at: z.string().datetime(),
    read_at: z.string().datetime().nullable(),
    archived_at: z.string().datetime().nullable(),
  })
  .strict();
export type NotificationDto = z.infer<typeof notificationDtoSchema>;

export const listNotificationsResponseSchema = z
  .object({
    items: z.array(notificationDtoSchema),
    page: z
      .object({
        cursor: z.string().optional(),
        has_more: z.boolean(),
      })
      .strict(),
    unread_count: z.number().int().nonnegative(),
  })
  .strict();
export type ListNotificationsResponse = z.infer<typeof listNotificationsResponseSchema>;
