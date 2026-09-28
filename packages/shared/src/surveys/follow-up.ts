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

const followUpRequestablePermissionSchema = z
  .object({
    permission: z.literal('finding.manage'),
    managed_system_id: z.string().uuid(),
  })
  .strict();

/**
 * Per-item follow-up action (ADR-0055 part C). `allowed` carries no
 * requestable permission; `blocked_requestable` carries the
 * `finding.manage` request target, or null when the capability cannot be
 * requested in this context.
 */
export const outcomeFollowUpNextActionSchema = z.discriminatedUnion('availability', [
  z
    .object({
      id: z.enum(['create_finding', 'mark_no_follow_up', 'reopen_follow_up']),
      availability: z.literal('allowed'),
    })
    .strict(),
  z
    .object({
      id: z.enum(['create_finding', 'mark_no_follow_up', 'reopen_follow_up']),
      availability: z.literal('blocked_requestable'),
      requestable_permission: followUpRequestablePermissionSchema.nullable(),
    })
    .strict(),
]);
export type OutcomeFollowUpNextAction = z.infer<typeof outcomeFollowUpNextActionSchema>;

/** One low-band rating answer of a poor response. Mid/high answers never appear. */
export const outcomeFollowUpLowAnswerSchema = z
  .object({
    question_id: z.string().uuid(),
    question_label: z.string(),
    value: z.number().int(),
    rating_min: z.number().int(),
    rating_max: z.number().int(),
  })
  .strict();
export type OutcomeFollowUpLowAnswer = z.infer<typeof outcomeFollowUpLowAnswerSchema>;

/** The qualifying generated_finding link's Finding (ADR-0055 live statuses only). */
export const outcomeFollowUpFindingSchema = z
  .object({
    id: z.string().uuid(),
    display_id: z.string(),
    status: z.enum(['draft', 'active', 'converted']),
  })
  .strict();
export type OutcomeFollowUpFinding = z.infer<typeof outcomeFollowUpFindingSchema>;

/** The current decision row on a response, whenever one exists. */
export const outcomeFollowUpDecisionStateSchema = z
  .object({
    state: z.enum(['no_follow_up', 'reopened']),
    reason: z.string(),
    updated_at: z.string().datetime(),
  })
  .strict();
export type OutcomeFollowUpDecisionState = z.infer<typeof outcomeFollowUpDecisionStateSchema>;

/** One poor response of the follow-up review list, ordered by response_number. */
export const outcomeFollowUpItemSchema = z
  .object({
    response_id: z.string().uuid(),
    response_number: z.number().int().positive(),
    submitted_at: z.string().datetime(),
    low_answers: z.array(outcomeFollowUpLowAnswerSchema),
    resolution: z.enum(['open', 'finding', 'no_follow_up']),
    finding: outcomeFollowUpFindingSchema.nullable(),
    decision: outcomeFollowUpDecisionStateSchema.nullable(),
    next_actions: z.array(outcomeFollowUpNextActionSchema),
  })
  .strict();
export type OutcomeFollowUpItem = z.infer<typeof outcomeFollowUpItemSchema>;

/**
 * `GET /surveys/:id/outcome-follow-up` (ADR-0055 part C). The survey-grain
 * booleans are the only classification data a non-holder of
 * `survey.read_personal_responses` receives: `items` is null for a
 * non-holder, so no count, response id, or per-response flag can be
 * represented or parsed.
 */
export const outcomeFollowUpReadDtoSchema = z
  .object({
    survey_id: z.string().uuid(),
    classifiable: z.boolean(),
    follow_up_needed: z.boolean(),
    personal_access: z.boolean(),
    items: z.array(outcomeFollowUpItemSchema).nullable(),
  })
  .strict();
export type OutcomeFollowUpReadDto = z.infer<typeof outcomeFollowUpReadDtoSchema>;
