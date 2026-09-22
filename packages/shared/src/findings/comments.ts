import { z } from 'zod';

import { tipTapDocSchema } from '../vocs/create-request.js';
import { isTipTapDocBlank } from '../vocs/rich-content.js';
import { findingStatusSchema } from './status.js';

export const findingCommentKindSchema = z.enum(['note', 'status_change']);
export type FindingCommentKind = z.infer<typeof findingCommentKindSchema>;

export const findingCommentDtoSchema = z
  .object({
    id: z.string().uuid(),
    finding_id: z.string().uuid(),
    actor_id: z.string().uuid(),
    kind: findingCommentKindSchema,
    from_status: findingStatusSchema.nullable(),
    to_status: findingStatusSchema.nullable(),
    body_rich_content: z.unknown(),
    created_at: z.string().datetime(),
  })
  .strict();
export type FindingCommentDto = z.infer<typeof findingCommentDtoSchema>;

export const listFindingCommentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
export type ListFindingCommentsQuery = z.infer<typeof listFindingCommentsQuerySchema>;

export const listFindingCommentsResponseSchema = z
  .object({
    items: z.array(findingCommentDtoSchema),
    page: z
      .object({
        cursor: z.string().optional(),
        has_more: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ListFindingCommentsResponse = z.infer<typeof listFindingCommentsResponseSchema>;

export const createFindingCommentRequestSchema = z
  .object({
    body_rich_content: tipTapDocSchema.refine((doc) => !isTipTapDocBlank(doc), {
      message: '상세 설명을 입력해 주세요.',
    }),
    mentions: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();
export type CreateFindingCommentRequest = z.infer<typeof createFindingCommentRequestSchema>;

export const createFindingCommentResponseSchema = z
  .object({
    comment: findingCommentDtoSchema,
  })
  .strict();
export type CreateFindingCommentResponse = z.infer<typeof createFindingCommentResponseSchema>;
