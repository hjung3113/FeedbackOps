import { z } from 'zod';

import { conversationKindSchema } from './conversation.js';

export const getConversationQuerySchema = z.object({
  // cursor is required for pagination tail — callers must receive a cursor
  // from the inline conversation_page before querying this endpoint.
  cursor: z.string(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  kind: conversationKindSchema.optional(),
});
export type GetConversationQuery = z.infer<typeof getConversationQuerySchema>;
