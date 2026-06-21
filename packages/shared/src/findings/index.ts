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

export const findingSourceSchema = z
  .object({
    type: z.literal('voc'),
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
