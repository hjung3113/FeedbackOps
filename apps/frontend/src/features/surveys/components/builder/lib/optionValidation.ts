import type { SurveyQuestion } from '../../../types';

export const MIN = 2;
export const MAX = 50;

export function hasInvalidChoiceOptions(question: SurveyQuestion): boolean {
  if (question.kind !== 'single_choice' && question.kind !== 'multiple_choice') return false;
  const options = question.options;
  if (!options || options.length < MIN || options.length > MAX) return true;

  const keys = new Set<string>();
  for (const option of options) {
    if (!option.key || keys.has(option.key) || !option.label.trim()) return true;
    keys.add(option.key);
  }
  return false;
}
