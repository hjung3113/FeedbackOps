import { z } from 'zod';

import {
  createFindingRequestSchema,
  findingConfidenceSchema,
  findingSeveritySchema,
  findingStatusSchema,
} from '../findings/index.js';

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
  })
  .strict();
export type VocClusterMemberDto = z.infer<typeof vocClusterMemberDtoSchema>;

export const vocClusterDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    display_id: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    severity: findingSeveritySchema.nullable(),
    confidence: findingConfidenceSchema.nullable(),
    rationale: z.string().nullable(),
    owner_user_id: z.string().uuid().nullable(),
    status: vocClusterStatusSchema,
    primary_managed_system_id: z.string().uuid(),
    created_by: z.string().uuid(),
    confirmed_by: z.string().uuid().nullable(),
    confirmed_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    member_count: z.number().int().nonnegative(),
    members: z.array(vocClusterMemberDtoSchema).optional(),
    linked_findings: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            display_id: z.string(),
            status: findingStatusSchema,
          })
          .strict(),
      )
      .optional(),
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
