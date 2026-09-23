// VOC Cluster audit detail schemas (Slice 5 #126).
// Each schema describes the `detail` payload for one cluster write:
// cluster lifecycle, membership changes, and findings created from or
// linked to a cluster. Imported by audit-events.ts to register into
// AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

import { findingConfidenceSchema, findingSeveritySchema } from '../findings/index.js';

export const VOC_CLUSTER_AUDIT_EVENT_TYPES = [
  'voc_cluster_created',
  'voc_cluster_updated',
  'voc_cluster_member_added',
  'voc_cluster_member_removed',
  'finding_created_from_voc_cluster',
  'finding_linked_to_voc_cluster',
  'finding_unlinked_from_voc_cluster',
] as const;

const vocClusterStatusDetailSchema = z.enum(['draft', 'confirmed']);

export const vocClusterCreatedDetailSchema = z.object({
  voc_cluster_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  title: z.string().min(1),
  summary_present: z.boolean(),
  status: vocClusterStatusDetailSchema,
});
export type VocClusterCreatedDetail = z.infer<typeof vocClusterCreatedDetailSchema>;

export const vocClusterUpdatedDetailSchema = z.object({
  voc_cluster_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  changes: z
    .object({
      title: z.object({ from: z.string().min(1), to: z.string().min(1) }).optional(),
      summary: z
        .object({
          from: z.string().nullable(),
          to: z.string().nullable(),
        })
        .optional(),
      severity: z
        .object({
          from: findingSeveritySchema.nullable(),
          to: findingSeveritySchema.nullable(),
        })
        .optional(),
      confidence: z
        .object({
          from: findingConfidenceSchema.nullable(),
          to: findingConfidenceSchema.nullable(),
        })
        .optional(),
      rationale: z.object({ from: z.string().nullable(), to: z.string().nullable() }).optional(),
      owner_user_id: z
        .object({ from: z.string().uuid().nullable(), to: z.string().uuid().nullable() })
        .optional(),
      status: z
        .object({
          from: vocClusterStatusDetailSchema,
          to: vocClusterStatusDetailSchema,
        })
        .optional(),
      confirmed_by: z
        .object({ from: z.string().uuid().nullable(), to: z.string().uuid().nullable() })
        .optional(),
      confirmed_at: z
        .object({ from: z.string().datetime().nullable(), to: z.string().datetime().nullable() })
        .optional(),
    })
    .refine((changes) => Object.keys(changes).length > 0, {
      message: 'at least one cluster field change is required',
    }),
});
export type VocClusterUpdatedDetail = z.infer<typeof vocClusterUpdatedDetailSchema>;

export const vocClusterMemberAddedDetailSchema = z.object({
  voc_cluster_id: z.string().uuid(),
  voc_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
});
export type VocClusterMemberAddedDetail = z.infer<typeof vocClusterMemberAddedDetailSchema>;

export const vocClusterMemberRemovedDetailSchema = z.object({
  voc_cluster_id: z.string().uuid(),
  voc_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
});
export type VocClusterMemberRemovedDetail = z.infer<typeof vocClusterMemberRemovedDetailSchema>;

export const findingCreatedFromVocClusterDetailSchema = z.object({
  finding_id: z.string().uuid(),
  source_voc_cluster_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  source_type: z.literal('voc_cluster'),
});
export type FindingCreatedFromVocClusterDetail = z.infer<
  typeof findingCreatedFromVocClusterDetailSchema
>;

export const findingLinkedToVocClusterDetailSchema = z.object({
  finding_id: z.string().uuid(),
  voc_cluster_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  relation_type: z.literal('evidence_of'),
});
export type FindingLinkedToVocClusterDetail = z.infer<typeof findingLinkedToVocClusterDetailSchema>;

export const findingUnlinkedFromVocClusterDetailSchema = z.object({
  link_id: z.string().uuid(),
  finding_id: z.string().uuid(),
  voc_cluster_id: z.string().uuid(),
  primary_managed_system_id: z.string().uuid(),
  relation_type: z.literal('evidence_of'),
  reason: z.string().min(1),
});
export type FindingUnlinkedFromVocClusterDetail = z.infer<
  typeof findingUnlinkedFromVocClusterDetailSchema
>;

export const VOC_CLUSTER_AUDIT_EVENT_DETAIL_SCHEMAS = {
  voc_cluster_created: vocClusterCreatedDetailSchema,
  voc_cluster_updated: vocClusterUpdatedDetailSchema,
  voc_cluster_member_added: vocClusterMemberAddedDetailSchema,
  voc_cluster_member_removed: vocClusterMemberRemovedDetailSchema,
  finding_created_from_voc_cluster: findingCreatedFromVocClusterDetailSchema,
  finding_linked_to_voc_cluster: findingLinkedToVocClusterDetailSchema,
  finding_unlinked_from_voc_cluster: findingUnlinkedFromVocClusterDetailSchema,
} as const satisfies Record<
  (typeof VOC_CLUSTER_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;
