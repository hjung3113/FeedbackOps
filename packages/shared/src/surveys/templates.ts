import { z } from 'zod';
import { surveyTypeSchema } from './dto.js';

const question = {
  key: z.string().min(1),
  prompt: z.string().min(1),
  is_required: z.boolean(),
  sort_order: z.number().int().nonnegative(),
};
const choice = {
  ...question,
  options: z
    .array(z.object({ key: z.string().min(1), label: z.string().min(1) }).strict())
    .min(2)
    .max(50),
};

// Definition previews use symbolic keys, never persisted question/Survey IDs.
export const surveyTemplateQuestionSchema = z
  .discriminatedUnion('kind', [
    z.object({ ...choice, kind: z.literal('single_choice') }).strict(),
    z.object({ ...choice, kind: z.literal('multiple_choice') }).strict(),
    z
      .object({
        ...question,
        kind: z.literal('rating'),
        rating_min: z.number().int().min(0).max(10),
        rating_max: z.number().int().min(0).max(10),
        rating_low_label: z.string().min(1),
        rating_high_label: z.string().min(1),
      })
      .strict(),
    z.object({ ...question, kind: z.literal('text') }).strict(),
  ])
  .refine((value) => value.kind !== 'rating' || value.rating_min < value.rating_max, {
    message: 'rating_min must be below rating_max',
  });
export type SurveyTemplateQuestion = z.infer<typeof surveyTemplateQuestionSchema>;

export const surveyTemplateSchema = z
  .object({
    template_id: z.enum(['discovery-basic', 'validation-basic', 'outcome-basic']),
    version: z.number().int().positive(),
    type: surveyTypeSchema,
    title: z.string().min(1),
    description: z.string().min(1),
    questions: z.array(surveyTemplateQuestionSchema).nonempty(),
  })
  .strict();
export type SurveyTemplate = z.infer<typeof surveyTemplateSchema>;

/** GET /surveys/templates; ordered items and dense visible question sort_order. */
export const surveyTemplatesResponseSchema = z
  .object({
    items: z.array(surveyTemplateSchema),
  })
  .strict();
export type SurveyTemplatesResponse = z.infer<typeof surveyTemplatesResponseSchema>;
