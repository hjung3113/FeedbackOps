import { z } from 'zod';

import { tipTapDocSchema } from '../vocs/create-request.js';
import { isTipTapDocBlank } from '../vocs/rich-content.js';
import { taskStatusSchema } from './status.js';

export const taskCommentKindSchema = z.enum(['note', 'status_change']);
export type TaskCommentKind = z.infer<typeof taskCommentKindSchema>;

export const taskCommentDtoSchema = z
  .object({
    id: z.string().uuid(),
    task_id: z.string().uuid(),
    actor_id: z.string().uuid(),
    kind: taskCommentKindSchema,
    from_status: taskStatusSchema.nullable(),
    to_status: taskStatusSchema.nullable(),
    body_rich_content: z.unknown(),
    created_at: z.string().datetime(),
  })
  .strict();
export type TaskCommentDto = z.infer<typeof taskCommentDtoSchema>;

export const listTaskCommentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
export type ListTaskCommentsQuery = z.infer<typeof listTaskCommentsQuerySchema>;

export const listTaskCommentsResponseSchema = z
  .object({
    items: z.array(taskCommentDtoSchema),
    page: z
      .object({
        cursor: z.string().optional(),
        has_more: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ListTaskCommentsResponse = z.infer<typeof listTaskCommentsResponseSchema>;

export const createTaskCommentRequestSchema = z
  .object({
    body_rich_content: tipTapDocSchema.refine((doc) => !isTipTapDocBlank(doc), {
      message: '상세 설명을 입력해 주세요.',
    }),
    mentions: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();
export type CreateTaskCommentRequest = z.infer<typeof createTaskCommentRequestSchema>;

export const createTaskCommentResponseSchema = z
  .object({
    comment: taskCommentDtoSchema,
  })
  .strict();
export type CreateTaskCommentResponse = z.infer<typeof createTaskCommentResponseSchema>;
