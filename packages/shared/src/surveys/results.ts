import { z } from 'zod';

const nonnegativeCountSchema = z.number().int().nonnegative();

export const surveyResultVisibilitySchema = z.enum(['suppressed', 'visible']);
export type SurveyResultVisibility = z.infer<typeof surveyResultVisibilitySchema>;

export const surveyResultSuppressionSchema = z
  .object({
    code: z.literal('anonymity_threshold'),
  })
  .strict();
export type SurveyResultSuppression = z.infer<typeof surveyResultSuppressionSchema>;

/**
 * The suppressed variant has exactly `question_id`, `visibility`,
 * `response_count`, and `suppression`. `question_id` remains because it is
 * survey-configuration data needed by the frontend to correlate the result;
 * it is not respondent identity data.
 */
const suppressedSurveyQuestionResultSchema = z
  .object({
    question_id: z.string().uuid(),
    visibility: z.literal('suppressed'),
    response_count: z.null(),
    suppression: surveyResultSuppressionSchema,
  })
  .strict();

const choiceSurveyQuestionResultSchema = z
  .object({
    question_id: z.string().uuid(),
    visibility: z.literal('visible'),
    kind: z.literal('choice'),
    answer_count: nonnegativeCountSchema,
    option_buckets: z
      .array(
        z
          .object({
            key: z.string().min(1),
            label: z.string(),
            count: nonnegativeCountSchema,
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();

const ratingSurveyQuestionResultSchema = z
  .object({
    question_id: z.string().uuid(),
    visibility: z.literal('visible'),
    kind: z.literal('rating'),
    answer_count: nonnegativeCountSchema,
    distribution: z
      .object({
        low: nonnegativeCountSchema,
        mid: nonnegativeCountSchema,
        high: nonnegativeCountSchema,
      })
      .strict(),
  })
  .strict();

const textSurveyQuestionResultSchema = z
  .object({
    question_id: z.string().uuid(),
    visibility: z.literal('visible'),
    kind: z.literal('text'),
    answer_count: nonnegativeCountSchema,
    distribution: z.null(),
    excerpts: z.tuple([]),
  })
  .strict();

/**
 * Aggregate-only result for one question. The suppressed variant deliberately
 * has no kind, answer count, bucket, or distribution fields, so a count leak
 * cannot be represented or parsed.
 */
export const surveyQuestionResultSchema = z.union([
  suppressedSurveyQuestionResultSchema,
  choiceSurveyQuestionResultSchema,
  ratingSurveyQuestionResultSchema,
  textSurveyQuestionResultSchema,
]);
export type SurveyQuestionResult = z.infer<typeof surveyQuestionResultSchema>;

export const surveyResultNextActionSchema = z.discriminatedUnion('id', [
  z
    .object({
      id: z.literal('create_finding'),
      availability: z.enum(['allowed', 'blocked_requestable']),
      intent: z.literal('open_finding_draft'),
      requestable_permission: z
        .object({
          permission: z.literal('finding.manage'),
          managed_system_id: z.string().uuid(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      id: z.literal('request_task'),
      availability: z.enum(['allowed', 'blocked_requestable']),
      intent: z.literal('open_task_request_draft'),
      source_finding_id: z.string().uuid(),
      requestable_permission: z
        .object({
          permission: z.literal('finding.manage'),
          managed_system_id: z.string().uuid(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type SurveyResultNextAction = z.infer<typeof surveyResultNextActionSchema>;

/**
 * An aggregate-only survey result. The route produces this only for open or
 * closed surveys; draft surveys have no result DTO.
 */
export const surveyResultDtoSchema = z
  .object({
    survey_id: z.string().uuid(),
    status: z.enum(['open', 'closed']),
    identity_protected: z.boolean(),
    questions: z.array(surveyQuestionResultSchema),
    next_actions: z.array(surveyResultNextActionSchema),
  })
  .strict();
export type SurveyResultDto = z.infer<typeof surveyResultDtoSchema>;

export const ratingBandSchema = z.enum(['low', 'mid', 'high']);
export type RatingBand = z.infer<typeof ratingBandSchema>;

export interface RatingBandRange {
  min: number;
  max: number;
}

export interface RatingBandPartition {
  low: RatingBandRange | null;
  mid: RatingBandRange | null;
  high: RatingBandRange | null;
}

function assertIntegerDomain(min: number, max: number): void {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError('rating domain must be an ordered pair of integers');
  }
}

/**
 * Splits an inclusive integer domain into contiguous low, mid, and high
 * ranges using integer arithmetic. Each band gets `floor(n / 3)` values, then
 * the remainder is assigned in order to low and then mid. Consequently 1–10
 * is low 1–4, mid 5–7, high 8–10. Domains smaller than three leave trailing
 * bands empty: `min === max` yields only low, and a two-value domain yields
 * low then mid. No value is skipped or belongs to more than one band.
 */
export function getRatingBandPartition(min: number, max: number): RatingBandPartition {
  assertIntegerDomain(min, max);

  const size = max - min + 1;
  const baseSize = Math.floor(size / 3);
  const remainder = size % 3;
  const sizes = [baseSize + Number(remainder > 0), baseSize + Number(remainder > 1), baseSize];
  let nextMin = min;

  const ranges = sizes.map((bandSize) => {
    if (bandSize === 0) return null;
    const range = { min: nextMin, max: nextMin + bandSize - 1 };
    nextMin = range.max + 1;
    return range;
  });

  return { low: ranges[0]!, mid: ranges[1]!, high: ranges[2]! };
}

/** Returns the deterministic low/mid/high band containing a configured rating value. */
export function getRatingBandForValue(min: number, max: number, value: number): RatingBand {
  assertIntegerDomain(min, max);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError('rating value must be an integer within its configured domain');
  }

  const partition = getRatingBandPartition(min, max);
  if (partition.low !== null && value <= partition.low.max) return 'low';
  if (partition.mid !== null && value <= partition.mid.max) return 'mid';
  return 'high';
}
