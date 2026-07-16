import { z } from 'zod';

import {
  createFindingRequestSchema,
  findingConfidenceSchema,
  findingSeveritySchema,
  findingStatusSchema,
} from '../findings/index.js';
import { publicUpdateRequestSchema } from '../vocs/public-update-request.js';

export const vocClusterStatusSchema = z.enum(['draft', 'confirmed']);
export type VocClusterStatus = z.infer<typeof vocClusterStatusSchema>;

export const createVocClusterRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: z.string().min(1).nullable().optional(),
    severity: findingSeveritySchema.nullable().optional(),
    confidence: findingConfidenceSchema.nullable().optional(),
    rationale: z.string().nullable().optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    primary_managed_system_id: z.string().uuid(),
  })
  .strict();
export type CreateVocClusterRequest = z.infer<typeof createVocClusterRequestSchema>;

export const updateVocClusterRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    summary: z.string().min(1).nullable().optional(),
    severity: findingSeveritySchema.nullable().optional(),
    confidence: findingConfidenceSchema.nullable().optional(),
    rationale: z.string().nullable().optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    status: z.literal('confirmed').optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateVocClusterRequest = z.infer<typeof updateVocClusterRequestSchema>;

export const addVocClusterMemberRequestSchema = z
  .object({
    voc_id: z.string().uuid(),
  })
  .strict();
export type AddVocClusterMemberRequest = z.infer<typeof addVocClusterMemberRequestSchema>;

export const vocClusterMemberDtoSchema = z
  .object({
    voc_id: z.string().uuid(),
    added_by: z.string().uuid(),
    added_at: z.string().datetime(),
    display_id: z.string().optional(),
    title: z.string().optional(),
    severity: findingSeveritySchema.nullable().optional(),
    reporter_facing_status: z.string().optional(),
  })
  .strict();
export type VocClusterMemberDto = z.infer<typeof vocClusterMemberDtoSchema>;

export const sameManagedSystemCandidatePeerDtoSchema = z
  .object({
    voc_id: z.string().uuid(),
    display_id: z.string(),
    title: z.string(),
    severity: findingSeveritySchema.nullable(),
    reporter_facing_status: z.string(),
  })
  .strict();
export type SameManagedSystemCandidatePeerDto = z.infer<
  typeof sameManagedSystemCandidatePeerDtoSchema
>;

export const listSameManagedSystemCandidatePeersResponseSchema = z
  .object({
    candidate_basis: z.literal('same_managed_system_active_voc'),
    candidates: z.array(sameManagedSystemCandidatePeerDtoSchema),
  })
  .strict();
export type ListSameManagedSystemCandidatePeersResponse = z.infer<
  typeof listSameManagedSystemCandidatePeersResponseSchema
>;

export const vocClusterPublicUpdateCandidateRequestSchema = publicUpdateRequestSchema;
export type VocClusterPublicUpdateCandidateRequest = z.infer<
  typeof vocClusterPublicUpdateCandidateRequestSchema
>;

export const applyVocClusterPublicUpdateRequestSchema = z
  .object({
    voc_ids: z.array(z.string().uuid()).min(1),
    public_update: publicUpdateRequestSchema,
  })
  .strict();
export type ApplyVocClusterPublicUpdateRequest = z.infer<
  typeof applyVocClusterPublicUpdateRequestSchema
>;

export const vocClusterPublicUpdateOutcomeSchema = z
  .object({
    voc_id: z.string().uuid(),
    status: z.enum(['applied', 'skipped']),
    reason: z.string().optional(),
  })
  .strict();
export type VocClusterPublicUpdateOutcome = z.infer<typeof vocClusterPublicUpdateOutcomeSchema>;

export const linkedFindingDtoSchema = z
  .object({
    id: z.string().uuid(),
    display_id: z.string(),
    status: findingStatusSchema,
  })
  .strict();
export type LinkedFindingDto = z.infer<typeof linkedFindingDtoSchema>;

export const vocClusterDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    display_id: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    severity: findingSeveritySchema.nullable().optional(),
    confidence: findingConfidenceSchema.nullable().optional(),
    rationale: z.string().nullable().optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    status: vocClusterStatusSchema,
    primary_managed_system_id: z.string().uuid(),
    created_by: z.string().uuid(),
    confirmed_by: z.string().uuid().nullable().optional(),
    confirmed_at: z.string().datetime().nullable().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    member_count: z.number().int().nonnegative(),
    members: z.array(vocClusterMemberDtoSchema).optional(),
    linked_findings: z.array(linkedFindingDtoSchema).optional(),
  })
  .strict();
export type VocClusterDto = z.infer<typeof vocClusterDtoSchema>;

export const listVocClustersResponseSchema = z
  .object({
    items: z.array(vocClusterDtoSchema),
  })
  .strict();
export type ListVocClustersResponse = z.infer<typeof listVocClustersResponseSchema>;

export const createFindingFromVocClusterRequestSchema = createFindingRequestSchema;
export type CreateFindingFromVocClusterRequest = z.infer<
  typeof createFindingFromVocClusterRequestSchema
>;

export const linkExistingFindingToVocClusterRequestSchema = z
  .object({
    finding_id: z.string().uuid(),
  })
  .strict();
export type LinkExistingFindingToVocClusterRequest = z.infer<
  typeof linkExistingFindingToVocClusterRequestSchema
>;
