// Task Request audit detail schemas (Slice 6 #132 / #136 / #133 / #134).
// Covers request creation tracers, review-queue decisions, and the
// conversion/link-existing decisions that turn a request into a Task —
// the policy verb list groups `task_created_from_request` /
// `task_linked_to_request` with the request verbs, so they stay here
// rather than in task.ts. Imported by audit-events.ts to register into
// AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const TASK_REQUEST_AUDIT_EVENT_TYPES = [
  'task_request_created_from_finding',
  'task_request_created_from_voc',
  'task_request_created_from_voc_cluster',
  'task_request_approved',
  'task_request_rejected',
  'task_request_needs_more_evidence',
  'task_request_self_approval_denied',
  'task_created_from_request',
  'task_linked_to_request',
] as const;

export const taskRequestCreatedFromFindingDetailSchema = z.object({
  task_request_id: z.string().uuid(),
  source_finding_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  source_type: z.literal('finding'),
});
export type TaskRequestCreatedFromFindingDetail = z.infer<
  typeof taskRequestCreatedFromFindingDetailSchema
>;

export const taskRequestCreatedFromVocDetailSchema = z.object({
  task_request_id: z.string().uuid(),
  source_voc_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  source_type: z.literal('voc'),
});
export type TaskRequestCreatedFromVocDetail = z.infer<typeof taskRequestCreatedFromVocDetailSchema>;

export const taskRequestCreatedFromVocClusterDetailSchema = z.object({
  task_request_id: z.string().uuid(),
  source_voc_cluster_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  source_type: z.literal('voc_cluster'),
});
export type TaskRequestCreatedFromVocClusterDetail = z.infer<
  typeof taskRequestCreatedFromVocClusterDetailSchema
>;

const taskRequestStatusDetailSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'needs_more_evidence',
  'converted',
]);

// One decision schema backs all three review-queue events (approved /
// rejected / needs_more_evidence); the map registers it three times.
export const taskRequestDecisionDetailSchema = z.object({
  task_request_id: z.string().uuid(),
  from_status: taskRequestStatusDetailSchema,
  to_status: taskRequestStatusDetailSchema,
  reviewer_actor_id: z.string().uuid(),
  reason: z.string().min(1).max(4000).optional(),
  note: z.string().min(1).max(4000).optional(),
  self_approval: z.boolean().optional(),
  sensitive: z.boolean().optional(),
});
export type TaskRequestDecisionDetail = z.infer<typeof taskRequestDecisionDetailSchema>;

export const taskRequestSelfApprovalDeniedDetailSchema = z.object({
  task_request_id: z.string().uuid(),
  requester_actor_id: z.string().uuid(),
  reason_present: z.boolean(),
  capability_present: z.boolean(),
});
export type TaskRequestSelfApprovalDeniedDetail = z.infer<
  typeof taskRequestSelfApprovalDeniedDetailSchema
>;

export const taskCreatedFromRequestDetailSchema = z.object({
  task_id: z.string().uuid(),
  source_task_request_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  preserved_links: z.array(z.string().uuid()),
});
export type TaskCreatedFromRequestDetail = z.infer<typeof taskCreatedFromRequestDetailSchema>;

export const taskLinkedToRequestDetailSchema = z.object({
  task_id: z.string().uuid(),
  task_request_id: z.string().uuid(),
});
export type TaskLinkedToRequestDetail = z.infer<typeof taskLinkedToRequestDetailSchema>;

export const TASK_REQUEST_AUDIT_EVENT_DETAIL_SCHEMAS = {
  task_request_created_from_finding: taskRequestCreatedFromFindingDetailSchema,
  task_request_created_from_voc: taskRequestCreatedFromVocDetailSchema,
  task_request_created_from_voc_cluster: taskRequestCreatedFromVocClusterDetailSchema,
  task_request_approved: taskRequestDecisionDetailSchema,
  task_request_rejected: taskRequestDecisionDetailSchema,
  task_request_needs_more_evidence: taskRequestDecisionDetailSchema,
  task_request_self_approval_denied: taskRequestSelfApprovalDeniedDetailSchema,
  task_created_from_request: taskCreatedFromRequestDetailSchema,
  task_linked_to_request: taskLinkedToRequestDetailSchema,
} as const satisfies Record<
  (typeof TASK_REQUEST_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;
