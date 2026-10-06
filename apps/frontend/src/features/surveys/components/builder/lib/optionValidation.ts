import { surveyQuestionInputSchema } from '@fops/shared';
import type { SurveyQuestion } from '../../../types';
import { toInput } from './questionDraft';

export function hasInvalidChoiceOptions(question: SurveyQuestion): boolean {
  if (question.kind !== 'single_choice' && question.kind !== 'multiple_choice') return false;
  return !surveyQuestionInputSchema.safeParse(toInput(question)).success;
}
