import { z } from 'zod';
import { surveyQuestionKindSchema, surveyTypeSchema } from './dto.js';

const surveyOptionSchema = z.object({ key: z.string().min(1), label: z.string().min(1) }).strict();

const respondentQuestionSchema = z
  .object({
    id: z.string().uuid(),
    kind: surveyQuestionKindSchema,
    prompt: z.string(),
    is_required: z.boolean(),
    sort_order: z.number().int(),
    options: z.array(surveyOptionSchema).nullable(),
    rating_min: z.number().int().nullable(),
    rating_max: z.number().int().nullable(),
    rating_low_label: z.string().nullable(),
    rating_high_label: z.string().nullable(),
    branch_parent_question_id: z.string().uuid().nullable(),
    branch_trigger_option_key: z.string().nullable(),
  })
  .strict();

export const surveyRespondentFormDtoSchema = z
  .object({
    survey: z
      .object({
        id: z.string().uuid(),
        title: z.string(),
        type: surveyTypeSchema,
        identity_protected: z.boolean(),
      })
      .strict(),
    questions: z.array(respondentQuestionSchema),
  })
  .strict();
export type SurveyRespondentFormDto = z.infer<typeof surveyRespondentFormDtoSchema>;
export type SurveyRespondentQuestion = SurveyRespondentFormDto['questions'][number];

export const surveyResponseSubmissionSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            question_id: z.string().uuid(),
            value: z.union([z.string(), z.array(z.string()), z.number()]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type SurveyResponseSubmission = z.infer<typeof surveyResponseSubmissionSchema>;

export const surveyResponseSubmittedDtoSchema = z
  .object({
    id: z.string().uuid(),
    survey_id: z.string().uuid(),
    submitted_at: z.string().datetime({ offset: true }),
    identity_protected: z.boolean(),
  })
  .strict();
export type SurveyResponseSubmittedDto = z.infer<typeof surveyResponseSubmittedDtoSchema>;
