import { z } from 'zod';

import { entityLinkDtoSchema } from '../entity-links.js';
import { LinkedAttachmentSchema } from './attachment.js';
import { conversationEntrySchema } from './conversation.js';
import { reporterFacingStatusEnumSchema, vocListItemSchema } from './list-item.js';

export const vocDetailEnvelopeSchema = vocListItemSchema.extend({
  // The capped peer preview uses the same authorized peer set as similar_count.
  // similar_count remains the sole total; this array is intentionally not paginated.
  similar: z.object({
    items: z.array(z.object({
      id: z.string().uuid(),
      display_id: z.string(),
      title: z.string(),
      reporter_facing_status: reporterFacingStatusEnumSchema,
      severity: z.enum(['low', 'medium', 'high', 'critical']).nullable(),
    })).max(3),
  }),
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
  // Optional gate: present when a linked-task state blocks a reporter status transition.
  // Frontend uses this to surface amber <Callout> + disable Publish.
  // See docs/frontend/specs/voc.md §5.10 item 4.
  reporter_status_gate: z
    .object({
      blocking_for: z.array(reporterFacingStatusEnumSchema),
      reason: z.string(),
    })
    .optional(),
  // Slice 3: entity_links table absent (Slice 4); always null.
  linked_execution: z.object({
    findingRef: z.null(),
    taskRef: z.null(),
  }),
  // Slice 4.1 #112: backend-decided Links tab rows from core.entity_links.
  // Optional so existing Slice 3 consumers and fixtures remain source-compatible.
  links: z.array(entityLinkDtoSchema).optional(),
  // Hybrid inline conversations: first 50 entries inline; pagination tail via
  // GET /vocs/:id/conversation. Slice 3: conversation POSTs ship in #16.
  conversation_timeline: z.array(conversationEntrySchema),
  conversation_page: z.object({
    cursor: z.string().optional(),
    has_more: z.boolean(),
  }),
  // Seed data from voc_permission_decisions_seed_fixture; opaque at this layer.
  permission_decisions: z.record(z.string(), z.unknown()),
  // PLAN-22 §Bug-1 (2026-05-22): linked attachments on the VOC body. Pre-
  // existing rows in `voc.voc_attachments` with `voc_id = $vocId AND
  // archived_at IS NULL`. Always present — defaults to [] when none.
  // Per-comment attachments live on `conversation_entry.attachments` on each
  // `conversation_timeline[]` entry.
  attachments: z.array(LinkedAttachmentSchema),
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
