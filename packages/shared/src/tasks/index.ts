import { z } from 'zod';

import { taskStatusSchema } from './status.js';

export { taskStatusSchema } from './status.js';
export type { TaskStatus } from './status.js';

export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const taskDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    display_id: z.string(),
    primary_managed_system_id: z.string().uuid(),
    title: z.string(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assignee_actor_id: z.string().uuid().nullable(),
    due_date: isoDateSchema.nullable(),
    milestone_id: z.string().uuid().nullable(),
    analytics_area_id: z.string().uuid().nullable(),
    source_task_request_id: z.string().uuid().nullable(),
    created_by: z.string().uuid(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();
export type TaskDto = z.infer<typeof taskDtoSchema>;

export const taskDetailSourceSchema = z
  .object({
    task_request: z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          'pending_review',
          'approved',
          'rejected',
          'needs_more_evidence',
          'converted',
        ]),
      })
      .strict()
      .optional(),
    finding: z
      .object({
        id: z.string().uuid(),
        title: z.string(),
        summary: z.string(),
        evidence_count: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    // Source VOC of the resolved trail, decided by the backend (ADR-0023 /
    // FR-LINK-002): the FE never synthesizes it. `hidden` is never serialized —
    // the whole key is omitted so existence is not revealed. The non-allowed
    // states carry no identifiers.
    voc: z
      .discriminatedUnion('visibility_state', [
        z
          .object({
            visibility_state: z.literal('allowed'),
            id: z.string().uuid(),
            display_id: z.string(),
            title: z.string(),
          })
          .strict(),
        z.object({ visibility_state: z.literal('summary_visible') }).strict(),
        z.object({ visibility_state: z.literal('denied') }).strict(),
      ])
      .optional(),
  })
  .strict();
export type TaskDetailSource = z.infer<typeof taskDetailSourceSchema>;
export type TaskDetailSourceVoc = NonNullable<TaskDetailSource['voc']>;

export const taskDetailDtoSchema = taskDtoSchema
  .extend({
    source: taskDetailSourceSchema.nullable(),
  })
  .strict();
export type TaskDetailDto = z.infer<typeof taskDetailDtoSchema>;

export const patchTaskStatusRequestSchema = z
  .object({
    status: taskStatusSchema,
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export type PatchTaskStatusRequest = z.infer<typeof patchTaskStatusRequestSchema>;

// #514 B1b — POST /tasks/:id/milestone. `null` unassigns.
export const assignTaskMilestoneRequestSchema = z
  .object({
    milestone_id: z.string().uuid().nullable(),
  })
  .strict();
export type AssignTaskMilestoneRequest = z.infer<typeof assignTaskMilestoneRequestSchema>;

export const convertTaskRequestRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    priority: taskPrioritySchema.default('medium'),
    assignee_actor_id: z.string().uuid().nullable().optional(),
    due_date: isoDateSchema.nullable().optional(),
    milestone_id: z.string().uuid().nullable().optional(),
    analytics_area_id: z.string().uuid().nullable().optional(),
  })
  .strict();
export type ConvertTaskRequestRequest = z.infer<typeof convertTaskRequestRequestSchema>;

export const linkExistingTaskRequestSchema = z
  .object({
    task_id: z.string().uuid(),
  })
  .strict();
export type LinkExistingTaskRequest = z.infer<typeof linkExistingTaskRequestSchema>;

export const listTasksQuerySchema = z
  .object({
    status: taskStatusSchema.optional(),
    assignee: z.union([z.string().uuid(), z.literal('me')]).optional(),
    managed_system_id: z.union([z.string().uuid(), z.literal('all')]).optional(),
    public_update: z.literal('missing').optional(),
    milestone_id: z.string().uuid().optional(),
  })
  .strict();
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export * from './comments.js';
