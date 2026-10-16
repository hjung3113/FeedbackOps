import { z } from 'zod';
import { vocDetailEnvelopeSchema, vocSummaryEnvelopeSchema } from './detail.js';

export const recordVocNoFollowUpRequestSchema = z
  .object({
    reason: z.string().max(2000).trim().min(1),
  })
  .strict();
export type RecordVocNoFollowUpRequest = z.infer<typeof recordVocNoFollowUpRequestSchema>;

export { vocFollowUpStateSchema } from './follow-up-state.js';
export type { VocFollowUpState } from './follow-up-state.js';

export const vocNoFollowUpResponseSchema = z.union([
  vocDetailEnvelopeSchema,
  vocSummaryEnvelopeSchema,
]);
export type VocNoFollowUpResponse = z.infer<typeof vocNoFollowUpResponseSchema>;
