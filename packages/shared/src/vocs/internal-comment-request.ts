import { z } from 'zod';

import { tipTapDocSchema } from './create-request.js';

export const internalCommentRequestSchema = z.object({
  body_rich_content: tipTapDocSchema,
  mentions: z.array(z.string().uuid()).max(50).optional(),
});

export type InternalCommentRequest = z.infer<typeof internalCommentRequestSchema>;
