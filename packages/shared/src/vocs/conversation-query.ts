import { z } from 'zod';

import { conversationKindSchema } from './conversation.js';

export const getConversationQuerySchema = z.object({
  // cursor is OPTIONAL. The endpoint accepts a first-page call (no cursor) and
  // treats it as "start from oldest". This matches the contract the FE infinite
  // hook (`useVocConversation`) implies — it issues the first GET with empty
  // pageParam before any inline cursor is available. Subsequent calls carry
  // the encoded `{ createdAt, id }` cursor returned from the previous page.
  //
  // BE handler must short-circuit cursor-decoding when undefined: the service
  // passes `undefined` to `selectConversationPage`, which selects from the
  // oldest entry.
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  kind: conversationKindSchema.optional(),
});
export type GetConversationQuery = z.infer<typeof getConversationQuerySchema>;
