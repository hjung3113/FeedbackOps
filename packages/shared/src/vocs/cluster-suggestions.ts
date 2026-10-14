import { z } from 'zod';

export const discardVocClusterSuggestionRequestSchema = z
  .object({
    expected_revision: z.number().int().positive(),
  })
  .strict();
const reviewedRequest = discardVocClusterSuggestionRequestSchema.extend({
  embedding_version: z.number().int().positive(),
  source_hashes: z.tuple([z.string().min(1), z.string().min(1)]),
});
export const confirmVocClusterSuggestionRequestSchema = reviewedRequest;
export const restoreVocClusterSuggestionRequestSchema = reviewedRequest;
const pairVoc = z
  .object({
    id: z.string().uuid(),
    display_id: z.string(),
    title: z.string(),
    description_rich_content: z.record(z.unknown()).nullable(),
  })
  .strict();
export const vocClusterSuggestionItemSchema = z
  .object({
    id: z.string().uuid(),
    primary_managed_system_id: z.string().uuid(),
    revision: z.number().int().positive(),
    embedding_version: z.number().int().positive(),
    source_hashes: z.tuple([z.string().min(1), z.string().min(1)]),
    vocs: z.tuple([pairVoc, pairVoc]),
  })
  .strict()
  .refine((item) => item.vocs[0].id.toLowerCase() < item.vocs[1].id.toLowerCase(), {
    path: ['vocs'],
    message: 'a sorted distinct pair is required',
  });
export const vocClusterSuggestionsResponseSchema = z.discriminatedUnion('available', [
  z
    .object({ available: z.literal(true), items: z.array(vocClusterSuggestionItemSchema).max(20) })
    .strict(),
  z
    .object({
      available: z.literal(false),
      reason: z.literal('provider_disabled'),
      items: z.array(vocClusterSuggestionItemSchema).max(0),
    })
    .strict(),
]);
export const confirmVocClusterSuggestionResponseSchema = z
  .object({
    voc_cluster_id: z.string().uuid(),
    cluster_created: z.literal(true),
  })
  .strict();
export const discardVocClusterSuggestionResponseSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    discarded_at: z.string().datetime(),
    undo_until: z.string().datetime(),
  })
  .strict();
export const restoreVocClusterSuggestionResponseSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type ConfirmVocClusterSuggestionRequest = z.infer<typeof reviewedRequest>;
export type RestoreVocClusterSuggestionRequest = z.infer<typeof reviewedRequest>;
export type DiscardVocClusterSuggestionRequest = z.infer<
  typeof discardVocClusterSuggestionRequestSchema
>;
export type VocClusterSuggestionItem = z.infer<typeof vocClusterSuggestionItemSchema>;
export type VocClusterSuggestionsResponse = z.infer<typeof vocClusterSuggestionsResponseSchema>;
export type ConfirmVocClusterSuggestionResponse = z.infer<
  typeof confirmVocClusterSuggestionResponseSchema
>;
export type DiscardVocClusterSuggestionResponse = z.infer<
  typeof discardVocClusterSuggestionResponseSchema
>;
export type RestoreVocClusterSuggestionResponse = z.infer<
  typeof restoreVocClusterSuggestionResponseSchema
>;
