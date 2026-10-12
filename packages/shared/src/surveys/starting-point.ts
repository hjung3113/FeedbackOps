import { z } from 'zod';

// Add the existing_survey arm only when #1074 delivers its source/token checks.
export const surveyStartingPointSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('builtin'),
      template_id: z.string().min(1),
      version: z.number().int().positive(),
    })
    .strict(),
]);
export type SurveyStartingPoint = z.infer<typeof surveyStartingPointSchema>;
