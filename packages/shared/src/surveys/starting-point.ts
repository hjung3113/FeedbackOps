import { z } from 'zod';

export const surveyStartingPointSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('builtin'),
      template_id: z.string().min(1),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('existing_survey'),
      survey_id: z.string().uuid(),
      definition_token: z.string().min(1).max(256),
    })
    .strict(),
]);
export type SurveyStartingPoint = z.infer<typeof surveyStartingPointSchema>;
