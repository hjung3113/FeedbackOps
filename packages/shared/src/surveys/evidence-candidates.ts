import { z } from 'zod';
import { surveyTypeSchema } from './dto.js';

export const surveyEvidenceCandidatesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export type SurveyEvidenceCandidatesQuery = z.infer<typeof surveyEvidenceCandidatesQuerySchema>;

export const surveyEvidenceCandidateSchema = z
  .object({
    approved_excerpt_id: z.string().uuid(),
    redacted_excerpt: z.string().min(1),
    question_label: z.string(),
    survey_type: surveyTypeSchema,
    survey_display_id: z.string(),
    identity_protected: z.boolean(),
  })
  .strict();
export type SurveyEvidenceCandidate = z.infer<typeof surveyEvidenceCandidateSchema>;

export const surveyEvidenceCandidatesResponseSchema = z
  .object({
    response_state: z.enum(['none', 'below_threshold', 'visible']),
    items: z.array(surveyEvidenceCandidateSchema),
    page: z.object({ has_more: z.boolean(), cursor: z.string().min(1).optional() }).strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.page.has_more !== (value.page.cursor !== undefined) ||
      (value.response_state !== 'visible' && (value.items.length > 0 || value.page.has_more))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['page'],
        message: 'invalid candidate page',
      });
    }
  });
export type SurveyEvidenceCandidatesResponse = z.infer<
  typeof surveyEvidenceCandidatesResponseSchema
>;
