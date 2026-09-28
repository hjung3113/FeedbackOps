import { z } from 'zod';

/**
 * Route-shaped request for POST /survey-responses/:id/mark-no-follow-up and
 * POST /survey-responses/:id/reopen-follow-up (ADR-0055). The reason is the
 * operator's decision record; it must be non-empty after trimming.
 */
export const outcomeFollowUpDecisionRequestSchema = z
  .object({
    reason: z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => value.trim().length > 0, {
        message: 'reason must not be blank',
      }),
  })
  .strict();
export type OutcomeFollowUpDecisionRequest = z.infer<typeof outcomeFollowUpDecisionRequestSchema>;

export const outcomeFollowUpMarkedResultSchema = z
  .object({
    response_id: z.string().uuid(),
    resolution: z.literal('no_follow_up'),
    updated_at: z.string().datetime(),
  })
  .strict();
export type OutcomeFollowUpMarkedResult = z.infer<typeof outcomeFollowUpMarkedResultSchema>;

export const outcomeFollowUpReopenedResultSchema = z
  .object({
    response_id: z.string().uuid(),
    resolution: z.literal('open'),
    updated_at: z.string().datetime(),
  })
  .strict();
export type OutcomeFollowUpReopenedResult = z.infer<typeof outcomeFollowUpReopenedResultSchema>;
