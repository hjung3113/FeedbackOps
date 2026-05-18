import { z } from 'zod';

import { conversationEntrySchema } from './conversation.js';
import { reporterFacingStatusEnumSchema, vocListItemSchema } from './list-item.js';

export const vocDetailEnvelopeSchema = vocListItemSchema.extend({
  // TipTap doc — opaque jsonb; backend validates structure.
  description_rich_content: z.unknown(),
  // No action items in Slice 3; kept as opaque array for future shape.
  next_actions: z.array(z.unknown()),
  // Allowed next reporter states from the current status; forbidden map carries
  // the reason string per transition (from transition table seed data).
  next_reporter_states: z.object({
    allowed: z.array(reporterFacingStatusEnumSchema),
    forbidden: z.record(reporterFacingStatusEnumSchema, z.string()),
  }),
  // Slice 3: entity_links table absent (Slice 4); always null.
  linked_execution: z.object({
    findingRef: z.null(),
    taskRef: z.null(),
  }),
  // Hybrid inline conversations: first 50 entries inline; pagination tail via
  // GET /vocs/:id/conversation. Slice 3: conversation POSTs ship in #16.
  conversation_timeline: z.array(conversationEntrySchema),
  conversation_page: z.object({
    cursor: z.string().optional(),
    has_more: z.boolean(),
  }),
  // Seed data from voc_permission_decisions_seed_fixture; opaque at this layer.
  permission_decisions: z.record(z.string(), z.unknown()),
});
export type VocDetailEnvelope = z.infer<typeof vocDetailEnvelopeSchema>;

// Returned when the actor is in effective_scope but NOT read_scope for the
// VOC's primary MS. Reveals only the minimum fields needed for the UI to
// render a "request access" prompt — no title, description, or conversation.
export const vocSummaryEnvelopeSchema = z.object({
  id: z.string().uuid(),
  display_id: z.string(),
  primary_managed_system_id: z.string().uuid(),
  reporter_facing_status: reporterFacingStatusEnumSchema,
  created_at: z.string().datetime(),
  // permission_decisions._self carries state + requestable metadata; other
  // keys may be present (future per-action decisions). Kept as record to
  // avoid coupling the shared schema to auth-service internals.
  permission_decisions: z.record(z.string(), z.unknown()),
});
export type VocSummaryEnvelope = z.infer<typeof vocSummaryEnvelopeSchema>;
