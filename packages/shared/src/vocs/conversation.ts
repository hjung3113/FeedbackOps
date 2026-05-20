import { z } from 'zod';

export const conversationKindSchema = z.enum([
  'public_update',
  'reporter_reply',
  'internal_comment',
]);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

// Conversation entries are a polymorphic union; public_update entries carry
// additional status-transition fields. Using optional fields (vs discriminated
// union) keeps the wire shape flat and avoids a nested `data` envelope.
export const conversationEntrySchema = z.object({
  id: z.string().uuid(),
  kind: conversationKindSchema,
  actor_id: z.string().uuid(),
  // TipTap doc — opaque at the wire boundary; backend validates structure.
  body_rich_content: z.unknown(),
  created_at: z.string().datetime(),
  visibility: z.enum(['public', 'reporter', 'internal']),
  // Fields present only when kind === 'public_update'.
  reporter_facing_status_before: z.string().optional(),
  reporter_facing_status_after: z.string().optional(),
  skip_public_update: z.boolean().optional(),
  skip_reason: z.string().nullable().optional(),
});
export type ConversationEntry = z.infer<typeof conversationEntrySchema>;
