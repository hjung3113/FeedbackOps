import { z } from 'zod';

export const findingStatusSchema = z.enum([
  'draft',
  'active',
  'not_actionable',
  'converted',
  'archived',
]);
export type FindingStatus = z.infer<typeof findingStatusSchema>;

export const findingSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const findingConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type FindingConfidence = z.infer<typeof findingConfidenceSchema>;

export const evidenceHighlightSourceTypeSchema = z.enum(['voc', 'survey_response', 'note']);
export type EvidenceHighlightSourceType = z.infer<typeof evidenceHighlightSourceTypeSchema>;

export const evidenceHighlightSentimentSchema = z.enum(['negative', 'neutral', 'positive']);
export type EvidenceHighlightSentiment = z.infer<typeof evidenceHighlightSentimentSchema>;

export const evidenceHighlightImportanceSchema = z.enum(['low', 'medium', 'high']);
export type EvidenceHighlightImportance = z.infer<typeof evidenceHighlightImportanceSchema>;

export const createFindingRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: z.string().min(1),
    severity: findingSeveritySchema,
    confidence: findingConfidenceSchema.optional(),
    analytics_area_id: z.string().uuid().optional(),
    primary_managed_system_id: z.string().uuid().optional(),
  })
  .strict();
export type CreateFindingRequest = z.infer<typeof createFindingRequestSchema>;

export const patchFindingRequestSchema = z
  .object({
    status: findingStatusSchema,
    reason: z.string().min(1).max(1000).optional(),
  })
  .strict();
export type PatchFindingRequest = z.infer<typeof patchFindingRequestSchema>;

export const linkTaskRequestSchema = z
  .object({
    task_id: z.string().uuid(),
  })
  .strict();
export type LinkTaskRequest = z.infer<typeof linkTaskRequestSchema>;

export const findingSourceSchema = z
  .object({
    type: z.enum(['voc', 'voc_cluster']),
    id: z.string().uuid(),
    relation_type: z.literal('created_finding'),
    link_id: z.string().uuid().optional(),
  })
  .strict();
export type FindingSource = z.infer<typeof findingSourceSchema>;

export const findingDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    display_id: z.string(),
    primary_managed_system_id: z.string().uuid(),
    title: z.string(),
    summary: z.string(),
    source_type: z.enum(['voc', 'voc_cluster', 'survey', 'manual']),
    source_id: z.string().uuid().nullable(),
    evidence_count: z.number().int().nonnegative(),
    severity: findingSeveritySchema,
    confidence: findingConfidenceSchema.nullable(),
    status: findingStatusSchema,
    analytics_area_id: z.string().uuid().nullable(),
    linked_task_id: z.string().uuid().nullable(),
    linked_milestone_id: z.string().uuid().nullable(),
    created_by: z.string().uuid(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    source: findingSourceSchema.nullable().optional(),
  })
  .strict();
export type FindingDto = z.infer<typeof findingDtoSchema>;

export const listFindingsResponseSchema = z
  .object({
    items: z.array(findingDtoSchema),
  })
  .strict();
export type ListFindingsResponse = z.infer<typeof listFindingsResponseSchema>;

export const addEvidenceHighlightRequestSchema = z
  .object({
    source_type: evidenceHighlightSourceTypeSchema,
    source_id: z.string().uuid().nullable().optional(),
    quote_or_summary: z.string().min(1),
    analytics_area_id: z.string().uuid().nullable().optional(),
    sentiment: evidenceHighlightSentimentSchema.nullable().optional(),
    importance: evidenceHighlightImportanceSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source_type !== 'note' && value.source_id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source_id'],
        message: 'source_id is required unless source_type is note',
      });
    }
  });
export type AddEvidenceHighlightRequest = z.infer<typeof addEvidenceHighlightRequestSchema>;

export const evidenceHighlightDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    finding_id: z.string().uuid(),
    primary_managed_system_id: z.string().uuid(),
    source_type: evidenceHighlightSourceTypeSchema,
    source_id: z.string().uuid().nullable(),
    source_title: z.string().nullable(),
    source_meta: z.string().nullable(),
    quote_or_summary: z.string().optional(),
    analytics_area_id: z.string().uuid().nullable(),
    sentiment: evidenceHighlightSentimentSchema.nullable(),
    importance: evidenceHighlightImportanceSchema.nullable(),
    created_by: z.string().uuid(),
    created_at: z.string().datetime(),
  })
  .strict();
export type EvidenceHighlightDto = z.infer<typeof evidenceHighlightDtoSchema>;

export const listEvidenceHighlightsResponseSchema = z
  .object({
    items: z.array(evidenceHighlightDtoSchema),
  })
  .strict();
export type ListEvidenceHighlightsResponse = z.infer<typeof listEvidenceHighlightsResponseSchema>;

export const linkEvidenceRequestSchema = z
  .object({
    source_type: z.literal('voc'),
    source_id: z.string().uuid(),
  })
  .strict();
export type LinkEvidenceRequest = z.infer<typeof linkEvidenceRequestSchema>;
