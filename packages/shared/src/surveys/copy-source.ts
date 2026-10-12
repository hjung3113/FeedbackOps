import { z } from 'zod';
import { surveyQuestionDtoSchema, surveyStatusSchema, surveyTypeSchema } from './dto.js';

export const surveyCopySourceQuestionSchema = surveyQuestionDtoSchema
  .omit({ survey_id: true })
  .extend({
    prompt: z.string().min(1),
    sort_order: z.number().int().nonnegative(),
    branch_depth: z.union([z.literal(0), z.literal(1)]),
    branch_parent_question_id: z.string().uuid().nullable(),
    rating_min: z.number().int().min(0).max(10).nullable(),
    rating_max: z.number().int().min(0).max(10).nullable(),
    branch_trigger_option_key: z.string().min(1).nullable(),
    options: z
      .array(z.object({ key: z.string().min(1), label: z.string().min(1) }).strict())
      .min(2)
      .max(50)
      .nullable(),
  })
  .strict()
  .refine(
    (q) => {
      const choice = q.kind === 'single_choice' || q.kind === 'multiple_choice';
      if (
        choice
          ? !q.options || new Set(q.options.map((o) => o.key)).size !== q.options.length
          : q.options !== null
      )
        return false;
      if (q.kind === 'rating') {
        if (q.rating_min === null || q.rating_max === null || q.rating_min >= q.rating_max)
          return false;
      } else if (
        q.rating_min !== null ||
        q.rating_max !== null ||
        q.rating_low_label !== null ||
        q.rating_high_label !== null
      )
        return false;
      return q.branch_depth === 0
        ? q.branch_parent_question_id === null && q.branch_trigger_option_key === null
        : q.branch_parent_question_id !== null && q.branch_trigger_option_key !== null;
    },
    { message: 'invalid question definition' },
  );
export type SurveyCopySourceQuestion = z.infer<typeof surveyCopySourceQuestionSchema>;

const metadata = {
  survey_id: z.string().uuid(),
  display_id: z.string().min(1),
  title: z.string(),
  type: surveyTypeSchema,
};
export const surveyCopySourcesResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            ...metadata,
            status: surveyStatusSchema,
            question_count: z.number().int().positive(),
          })
          .strict(),
      )
      .max(50),
    page: z.object({ has_more: z.boolean(), cursor: z.string().min(1).optional() }).strict(),
  })
  .strict();
export type SurveyCopySourcesResponse = z.infer<typeof surveyCopySourcesResponseSchema>;

export const surveyCopySourceResponseSchema = z
  .object({
    ...metadata,
    definition_token: z.string().min(1).max(256),
    questions: z.array(surveyCopySourceQuestionSchema).nonempty(),
  })
  .strict()
  .refine(
    ({ questions }) => {
      if (new Set(questions.map((q) => q.id)).size !== questions.length) return false;
      return questions.every((q, index) => {
        if (q.sort_order !== index) return false;
        if (q.branch_depth === 0) return true;
        const parent = questions.find((p) => p.id === q.branch_parent_question_id);
        return (
          parent?.kind === 'single_choice' &&
          parent.branch_depth === 0 &&
          parent.options?.some((o) => o.key === q.branch_trigger_option_key)
        );
      });
    },
    { message: 'invalid ordered question graph' },
  );
export type SurveyCopySourceResponse = z.infer<typeof surveyCopySourceResponseSchema>;
