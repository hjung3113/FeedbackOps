import { z } from 'zod';

import { publicUpdateRequestSchema } from './public-update-request.js';

export const publicUpdateReviewCandidateSchema = z.object({
  id: z.string().uuid(),
  voc_id: z.string().uuid(),
  source_task_id: z.string().uuid(),
  created_at: z.string().datetime(),
});

export type PublicUpdateReviewCandidate = z.infer<typeof publicUpdateReviewCandidateSchema>;

export const listPublicUpdateReviewCandidatesResponseSchema = z.object({
  items: z.array(publicUpdateReviewCandidateSchema),
});

export type ListPublicUpdateReviewCandidatesResponse = z.infer<
  typeof listPublicUpdateReviewCandidatesResponseSchema
>;

export const resolvePublicUpdateReviewCandidateRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('apply'),
      candidate_id: z.string().uuid(),
      public_update: publicUpdateRequestSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('dismiss'),
      candidate_id: z.string().uuid(),
      dismissal_reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);

export type ResolvePublicUpdateReviewCandidateRequest = z.infer<
  typeof resolvePublicUpdateReviewCandidateRequestSchema
>;
