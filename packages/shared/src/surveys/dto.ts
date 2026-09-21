// Survey read-model DTO schemas (#398). Wire shapes mirror the backend
// serializers in apps/backend/src/modules/surveys/service.ts (`dto` and
// `questionDto`): GET /surveys returns a bare array of surveys WITHOUT
// questions; GET /surveys/:id returns one survey WITH its questions array.
// Response objects intentionally use zod's default strip semantics (no
// `.strict()`) so additive backend fields never break older clients.

import { z } from 'zod';

export const surveyTypeSchema = z.enum(['discovery', 'validation', 'outcome']);
export type SurveyType = z.infer<typeof surveyTypeSchema>;

export const surveyStatusSchema = z.enum(['draft', 'open', 'closed']);
export type SurveyStatus = z.infer<typeof surveyStatusSchema>;

export const surveyQuestionKindSchema = z.enum([
  'single_choice',
  'multiple_choice',
  'rating',
  'text',
]);
export type SurveyQuestionKind = z.infer<typeof surveyQuestionKindSchema>;

const surveyOptionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
});

export const surveyQuestionDtoSchema = z.object({
  id: z.string().uuid(),
  survey_id: z.string().uuid(),
  kind: surveyQuestionKindSchema,
  prompt: z.string(),
  is_required: z.boolean(),
  options: z.array(surveyOptionSchema).nullable(),
  rating_min: z.number().int().nullable(),
  rating_max: z.number().int().nullable(),
  rating_low_label: z.string().nullable(),
  rating_high_label: z.string().nullable(),
  sort_order: z.number().int(),
  branch_depth: z.number().int(),
  branch_parent_question_id: z.string().nullable(),
  branch_trigger_option_key: z.string().nullable(),
});
export type SurveyQuestionDto = z.infer<typeof surveyQuestionDtoSchema>;

export const surveyDtoSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid().optional(),
  display_id: z.string(),
  type: surveyTypeSchema,
  status: surveyStatusSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  primary_managed_system_id: z.string().uuid(),
  analytics_area_id: z.string().uuid().nullable(),
  operator_actor_id: z.string().uuid().nullable(),
  responses_identity_protected: z.boolean(),
  created_by: z.string().uuid(),
  opened_at: z.string().datetime().nullable(),
  closed_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  questions: z.array(surveyQuestionDtoSchema).optional(),
});
export type SurveyDto = z.infer<typeof surveyDtoSchema>;

/**
 * GET /surveys/:id always emits the questions array; requiring it here means a
 * malformed detail payload fails at the network seam instead of rendering an
 * empty survey.
 */
export const surveyDetailDtoSchema = surveyDtoSchema.extend({
  questions: z.array(surveyQuestionDtoSchema),
});
export type SurveyDetailDto = z.infer<typeof surveyDetailDtoSchema>;

/** GET /surveys responds with a bare array (no envelope), questions omitted. */
export const listSurveysResponseSchema = z.array(surveyDtoSchema);
export type ListSurveysResponse = z.infer<typeof listSurveysResponseSchema>;
