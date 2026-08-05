import { z } from 'zod';

import { attachmentIdsSchema, tipTapDocSchema } from './create-request.js';
import { isTipTapDocBlank } from './rich-content.js';

// PLAN-22 C7b: wire shape carries `attachment_ids: string[]` referencing
// pre-uploaded voc_attachments rows linked to the new internal comment.
export const internalCommentRequestSchema = z
  .object({
    body_rich_content: tipTapDocSchema.refine((doc) => !isTipTapDocBlank(doc), {
      message: '상세 설명을 입력해 주세요.',
    }),
    mentions: z.array(z.string().uuid()).max(50).optional(),
    attachment_ids: attachmentIdsSchema.optional(),
  })
  .strict();

export type InternalCommentRequest = z.infer<typeof internalCommentRequestSchema>;
