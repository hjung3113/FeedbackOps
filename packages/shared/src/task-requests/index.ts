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

export const taskRequestDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    source_type: taskRequestSourceTypeSchema,
    source_id: z.string().uuid(),
    primary_managed_system_id: z.string().uuid(),
    evidence_summary: z.string(),
    requested_outcome: z.string(),
    requester_actor_id: z.string().uuid(),
    status: taskRequestStatusSchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    source: z
      .object({
        type: z.literal('finding'),
        id: z.string().uuid(),
        relation_type: z.literal('requested_task'),
        link_id: z.string().uuid(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TaskRequestDto = z.infer<typeof taskRequestDtoSchema>;
