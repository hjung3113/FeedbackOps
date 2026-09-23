// Finding audit detail schemas (Slice 5 #121 / Slice 5 #124 / Slice 6 #131 /
// Slice 6 #135 / Slice 8 #187).
//
// Four event-type tuples share this module because they split across the
// registry's event order: `finding_created_from_voc` (creation from a VOC),
// the finding lifecycle events, `finding_task_linked`, and
// `finding_created_from_survey_response`. The last one is finding
// provenance, not a survey payload — `survey.ts` stays privacy-safe survey
// events only. `finding_created_from_voc_cluster` and the other cluster
// events live in voc-cluster.ts. Imported by audit-events.ts to register
// into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const FINDING_FROM_VOC_AUDIT_EVENT_TYPES = [
  'finding_created_from_voc',
] as const;

export const FINDING_LIFECYCLE_AUDIT_EVENT_TYPES = [
  'evidence_highlight_added',
  'finding_status_changed',
  'finding_comment_created',
] as const;

export const FINDING_TASK_LINKED_AUDIT_EVENT_TYPES = [
  'finding_task_linked',
] as const;

export const FINDING_FROM_SURVEY_RESPONSE_AUDIT_EVENT_TYPES = [
  'finding_created_from_survey_response',
] as const;

export const findingCreatedFromVocDetailSchema = z.object({
  finding_id: z.string().uuid(),
  source_voc_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  source_type: z.literal('voc'),
});
export type FindingCreatedFromVocDetail = z.infer<typeof findingCreatedFromVocDetailSchema>;

export const findingCreatedFromSurveyResponseDetailSchema = z
  .object({
    finding_id: z.string().uuid(),
    source_survey_response_id: z.string().uuid(),
    source_survey_id: z.string().uuid(),
    primary_managed_system_id: z.string().uuid(),
    identity_protected: z.boolean(),
    source_type: z.literal('survey_response'),
  })
  .strict();
export type FindingCreatedFromSurveyResponseDetail = z.infer<
  typeof findingCreatedFromSurveyResponseDetailSchema
>;

export const evidenceHighlightAddedDetailSchema = z.object({
  finding_id: z.string().uuid(),
  evidence_highlight_id: z.string().uuid(),
  source_type: z.enum(['voc', 'survey_response', 'note']),
  source_id: z.string().uuid().nullable(),
  primary_managed_system_id: z.string().uuid(),
});
export type EvidenceHighlightAddedDetail = z.infer<typeof evidenceHighlightAddedDetailSchema>;

export const findingStatusChangedDetailSchema = z.object({
  finding_id: z.string().uuid(),
  from_status: z.enum(['draft', 'active', 'not_actionable', 'converted', 'archived']),
  to_status: z.enum(['draft', 'active', 'not_actionable', 'converted', 'archived']),
  primary_managed_system_id: z.string().uuid(),
  reason: z.string().min(1).max(1000).optional(),
});
export type FindingStatusChangedDetail = z.infer<typeof findingStatusChangedDetailSchema>;

export const findingCommentCreatedDetailSchema = z.object({
  finding_id: z.string().uuid(),
  comment_id: z.string().uuid(),
  actor_id: z.string().uuid(),
  mentions: z.array(z.string().uuid()),
});
export type FindingCommentCreatedDetail = z.infer<typeof findingCommentCreatedDetailSchema>;

export const findingTaskLinkedDetailSchema = z
  .object({
    finding_id: z.string().uuid(),
    task_id: z.string().uuid(),
    primary_managed_system_id: z.string().uuid(),
  })
  .strict();
export type FindingTaskLinkedDetail = z.infer<typeof findingTaskLinkedDetailSchema>;

// One detail map per tuple: the registry spreads maps in the same order as
// the tuples, which keeps Object.keys(AUDIT_EVENT_DETAIL_SCHEMAS) in the
// historical event order.
export const FINDING_FROM_VOC_AUDIT_EVENT_DETAIL_SCHEMAS = {
  finding_created_from_voc: findingCreatedFromVocDetailSchema,
} as const satisfies Record<
  (typeof FINDING_FROM_VOC_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;

export const FINDING_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  evidence_highlight_added: evidenceHighlightAddedDetailSchema,
  finding_status_changed: findingStatusChangedDetailSchema,
  finding_comment_created: findingCommentCreatedDetailSchema,
} as const satisfies Record<
  (typeof FINDING_LIFECYCLE_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;

export const FINDING_TASK_LINKED_AUDIT_EVENT_DETAIL_SCHEMAS = {
  finding_task_linked: findingTaskLinkedDetailSchema,
} as const satisfies Record<
  (typeof FINDING_TASK_LINKED_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;

export const FINDING_FROM_SURVEY_RESPONSE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  finding_created_from_survey_response: findingCreatedFromSurveyResponseDetailSchema,
} as const satisfies Record<
  (typeof FINDING_FROM_SURVEY_RESPONSE_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;
