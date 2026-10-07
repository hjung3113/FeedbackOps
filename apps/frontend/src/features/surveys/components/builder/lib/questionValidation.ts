import type { SurveyQuestion } from '../../../types';

export function hasInvalidRatingRange(question: SurveyQuestion): boolean {
  if (question.kind !== 'rating') return false;
  const min = question.rating_min;
  const max = question.rating_max;
  if (min === null || max === null) return true;
  return (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 0 ||
    max < 0 ||
    min > 10 ||
    max > 10 ||
    min >= max
  );
}
