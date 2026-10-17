import { z } from 'zod';

// ADR-0068 C9: human review metadata only, never copied VOC prose/titles.
export const VOC_CLUSTER_SUGGESTION_AUDIT_EVENT_TYPES = [
  'voc_cluster_suggestion_confirmed',
  'voc_cluster_suggestion_discarded',
  'voc_cluster_suggestion_restored',
] as const;

const reviewedPair = z
  .object({
    voc_a_id: z.string().uuid(),
    voc_b_id: z.string().uuid(),
    primary_managed_system_id: z.string().uuid(),
    revision: z.number().int().positive(),
    embedding_version: z.number().int().positive(),
    source_hash_a: z.string().trim().min(1),
    source_hash_b: z.string().trim().min(1),
    score: z.number().finite().min(0).max(1),
    cut: z.number().finite().min(0).max(1),
  })
  .strict();

const sortedPair = (pair: { voc_a_id: string; voc_b_id: string }) =>
  pair.voc_a_id.toLowerCase() < pair.voc_b_id.toLowerCase();

export const vocClusterSuggestionConfirmedDetailSchema = reviewedPair
  .extend({ voc_cluster_id: z.string().uuid() })
  .refine(sortedPair, { message: 'a sorted distinct pair is required' });
export const vocClusterSuggestionDiscardedDetailSchema = reviewedPair.refine(sortedPair, {
  message: 'a sorted distinct pair is required',
});
export const vocClusterSuggestionRestoredDetailSchema = reviewedPair.refine(sortedPair, {
  message: 'a sorted distinct pair is required',
});

export type VocClusterSuggestionConfirmedDetail = z.infer<
  typeof vocClusterSuggestionConfirmedDetailSchema
>;
export type VocClusterSuggestionDiscardedDetail = z.infer<
  typeof vocClusterSuggestionDiscardedDetailSchema
>;
export type VocClusterSuggestionRestoredDetail = z.infer<
  typeof vocClusterSuggestionRestoredDetailSchema
>;

export const VOC_CLUSTER_SUGGESTION_AUDIT_EVENT_DETAIL_SCHEMAS = {
  voc_cluster_suggestion_confirmed: vocClusterSuggestionConfirmedDetailSchema,
  voc_cluster_suggestion_discarded: vocClusterSuggestionDiscardedDetailSchema,
  voc_cluster_suggestion_restored: vocClusterSuggestionRestoredDetailSchema,
} as const satisfies Record<
  (typeof VOC_CLUSTER_SUGGESTION_AUDIT_EVENT_TYPES)[number],
  z.ZodTypeAny
>;
