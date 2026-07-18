import { z } from 'zod';

export const taskRequestStatusSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'needs_more_evidence',
  'converted',
]);
export type TaskRequestStatus = z.infer<typeof taskRequestStatusSchema>;

export const taskRequestSourceTypeSchema = z.enum(['finding', 'voc', 'voc_cluster']);
export type TaskRequestSourceType = z.infer<typeof taskRequestSourceTypeSchema>;

export const createTaskRequestFromFindingRequestSchema = z
  .object({
    evidence_summary: z.string().trim().min(1).max(4000),
    requested_outcome: z.string().trim().min(1).max(4000),
  })
  .strict();
export type CreateTaskRequestFromFindingRequest = z.infer<
  typeof createTaskRequestFromFindingRequestSchema
>;
export const createTaskRequestRequestSchema = createTaskRequestFromFindingRequestSchema;
export type CreateTaskRequestRequest = z.infer<typeof createTaskRequestRequestSchema>;
export const createTaskRequestFromVocRequestSchema = createTaskRequestRequestSchema;
export type CreateTaskRequestFromVocRequest = CreateTaskRequestRequest;
export const createTaskRequestFromVocClusterRequestSchema = createTaskRequestRequestSchema;
export type CreateTaskRequestFromVocClusterRequest = CreateTaskRequestRequest;

export const listTaskRequestsQuerySchema = z
  .object({
    status: taskRequestStatusSchema.optional(),
  })
  .strict();
export type ListTaskRequestsQuery = z.infer<typeof listTaskRequestsQuerySchema>;

export const approveTaskRequestRequestSchema = z
  .object({
    reason: z.string().trim().max(4000).optional(),
  })
  .strict();
export type ApproveTaskRequestRequest = z.infer<typeof approveTaskRequestRequestSchema>;

export const rejectTaskRequestRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(4000),
  })
  .strict();
export type RejectTaskRequestRequest = z.infer<typeof rejectTaskRequestRequestSchema>;

export const requestMoreEvidenceTaskRequestRequestSchema = z
  .object({
    note: z.string().trim().min(1).max(4000),
  })
  .strict();
export type RequestMoreEvidenceTaskRequestRequest = z.infer<
  typeof requestMoreEvidenceTaskRequestRequestSchema
>;

export const taskRequestDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    display_id: z.string(),
    source_type: taskRequestSourceTypeSchema,
    source_id: z.string().uuid(),
    primary_managed_system_id: z.string().uuid(),
    evidence_summary: z.string(),
    requested_outcome: z.string(),
    requester_actor_id: z.string().uuid(),
    status: taskRequestStatusSchema,
    reviewer_actor_id: z.string().uuid().nullable(),
    decision_reason: z.string().nullable(),
    decided_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    source: z
      .object({
        type: taskRequestSourceTypeSchema,
        id: z.string().uuid(),
        relation_type: z.literal('requested_task'),
        link_id: z.string().uuid(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TaskRequestDto = z.infer<typeof taskRequestDtoSchema>;
