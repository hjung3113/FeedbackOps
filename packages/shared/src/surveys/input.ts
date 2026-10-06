import { z } from 'zod';
import { surveyQuestionKindSchema } from './dto.js';

export const SURVEY_CHOICE_OPTIONS_MIN = 2;
export const SURVEY_CHOICE_OPTIONS_MAX = 50;

const surveyQuestionOptionInputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
});

export const surveyQuestionInputSchema = z
  .object({
    kind: surveyQuestionKindSchema,
    prompt: z.string(),
    is_required: z.boolean().optional(),
    options: z.array(surveyQuestionOptionInputSchema).optional(),
    rating_min: z.number().int().optional(),
    rating_max: z.number().int().optional(),
    rating_low_label: z.string().nullable().optional(),
    rating_high_label: z.string().nullable().optional(),
    sort_order: z.number().int().optional(),
    branch_parent_question_id: z.string().nullable().optional(),
    branch_trigger_option_key: z.string().nullable().optional(),
  })
  .superRefine((input, context) => {
    const isChoice = input.kind === 'single_choice' || input.kind === 'multiple_choice';
    if (!isChoice) {
      if (input.options !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Only choice questions have options.',
        });
      }
      return;
    }

    if (
      !input.options ||
      input.options.length < SURVEY_CHOICE_OPTIONS_MIN ||
      input.options.length > SURVEY_CHOICE_OPTIONS_MAX
    ) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Choice questions need 2-50 options.',
      });
      return;
    }

    const keys = new Set<string>();
    input.options.forEach((option, index) => {
      if (!option.key.trim() || keys.has(option.key)) {
        context.addIssue({
          code: 'custom',
          path: ['options', index, 'key'],
          message: 'Option keys must be non-empty and unique.',
        });
      }
      if (!option.label.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['options', index, 'label'],
          message: 'Option labels must not be blank.',
        });
      }
      keys.add(option.key);
    });
  });

export type SurveyQuestionInput = z.infer<typeof surveyQuestionInputSchema>;
