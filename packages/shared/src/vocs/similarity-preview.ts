import { z } from 'zod';
import { createVocRequestSchema } from './create-request.js';

export const similarityPreviewRequestSchema = createVocRequestSchema
  .pick({
    primary_managed_system_id: true,
    title: true,
    description_rich_content: true,
  })
  .strict();
export type SimilarityPreviewRequest = z.infer<typeof similarityPreviewRequestSchema>;

export const similarityPreviewItemSchema = z
  .object({
    id: z.string().uuid(),
    display_id: z.string(),
    title: z.string(),
    created_at: z.string().datetime(),
  })
  .strict();
export const similarityPreviewResponseSchema = z.discriminatedUnion('available', [
  z
    .object({ available: z.literal(true), items: z.array(similarityPreviewItemSchema).max(3) })
    .strict(),
  z
    .object({
      available: z.literal(false),
      reason: z.enum([
        'provider_disabled',
        'provider_failed',
        'provider_timeout',
        'preview_expired',
        'provider_outcome_unknown',
      ]),
      items: z.array(z.never()).max(0),
    })
    .strict(),
]);
export type SimilarityPreviewResponse = z.infer<typeof similarityPreviewResponseSchema>;
