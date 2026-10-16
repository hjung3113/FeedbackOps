import { z } from 'zod';

export const vocFollowUpStateSchema = z
  .object({
    decision: z
      .object({
        decision: z.literal('no_follow_up'),
        reason: z.string().min(1).max(2000),
        actor_id: z.string().uuid(),
        decided_at: z.string().datetime(),
      })
      .strict()
      .nullable(),
    can_record: z.boolean(),
    can_withdraw: z.boolean(),
  })
  .strict();
export type VocFollowUpState = z.infer<typeof vocFollowUpStateSchema>;
