import { z } from 'zod';

import { reporterFacingStatusEnumSchema } from './list-item.js';

export const vocRecommendationItemSchema = z.object({
  voc_id: z.string().uuid(),
  display_id: z.string(),
  title: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).nullable(),
  reporter_facing_status: reporterFacingStatusEnumSchema,
  score: z.number().min(0).max(1),
}).strict();

export type VocRecommendationItem = z.infer<typeof vocRecommendationItemSchema>;

export const vocRecommendationsResponseSchema = z.discriminatedUnion('available', [
  z.object({
    available: z.literal(false),
    reason: z.enum(['provider_disabled', 'source_not_embedded']),
    embedding_version: z.number().int().positive(),
    items: z.array(vocRecommendationItemSchema).max(0),
    total: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    available: z.literal(true),
    embedding_version: z.number().int().positive(),
    items: z.array(vocRecommendationItemSchema),
    total: z.number().int().nonnegative(),
  }).strict(),
]);

export type VocRecommendationsResponse = z.infer<typeof vocRecommendationsResponseSchema>;

export const confirmVocRecommendationResponseSchema = z.object({
  voc_cluster_id: z.string().uuid(),
  cluster_created: z.boolean(),
}).strict();

export type ConfirmVocRecommendationResponse = z.infer<
  typeof confirmVocRecommendationResponseSchema
>;
