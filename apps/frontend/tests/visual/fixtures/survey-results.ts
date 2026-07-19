import { surveyResultDtoSchema } from '@fops/shared';
import { z } from 'zod';
import { surveyVisualFixture } from './surveys';

export const surveyResultVisualFixture = {
  ...surveyVisualFixture,
  status: 'closed' as const,
};

const ids = {
  choice: '11111111-1111-4111-8111-111111111111',
  rating: '22222222-2222-4222-8222-222222222222',
  text: '33333333-3333-4333-8333-333333333333',
  excerpt: '44444444-4444-4444-8444-444444444444',
  finding: '55555555-5555-4555-8555-555555555555',
};

export const surveyResultsVisualScenarios = z
  .array(
    z.enum([
      'populated',
      'threshold-suppressed',
      'no-permission',
      'poor-outcome',
      'empty-next-actions',
    ]),
  )
  .parse([
    'populated',
    'threshold-suppressed',
    'no-permission',
    'poor-outcome',
    'empty-next-actions',
  ]);
export type SurveyResultsVisualScenario = (typeof surveyResultsVisualScenarios)[number];

export function surveyResultsFixtureFor(scenario: SurveyResultsVisualScenario) {
  const questions = [
    {
      question_id: ids.choice,
      visibility: 'visible' as const,
      kind: 'choice' as const,
      answer_count: 12,
      option_buckets: [{ key: 'slow', label: '느린 로딩', count: 8 }],
    },
    {
      question_id: ids.rating,
      visibility: 'visible' as const,
      kind: 'rating' as const,
      answer_count: 12,
      distribution:
        scenario === 'poor-outcome' ? { low: 8, mid: 3, high: 1 } : { low: 1, mid: 3, high: 8 },
    },
    {
      question_id: ids.text,
      visibility: 'visible' as const,
      kind: 'text' as const,
      answer_count: 1,
      distribution: null,
      excerpts: [{ id: ids.excerpt, text: '내보내기가 너무 느립니다.' }],
    },
  ];
  if (scenario === 'threshold-suppressed') {
    questions.push({
      question_id: '66666666-6666-4666-8666-666666666666',
      visibility: 'suppressed' as const,
      response_count: null,
      suppression: { code: 'anonymity_threshold' as const },
    } as never);
  }
  return surveyResultDtoSchema.parse({
    survey_id: surveyResultVisualFixture.id,
    status: 'closed',
    identity_protected: true,
    questions,
    next_actions:
      scenario === 'empty-next-actions'
        ? []
        : [{ id: 'create_finding', availability: 'allowed', intent: 'open_finding_draft' }],
  });
}

export const surveyResultsFixtureSchema = surveyResultDtoSchema;
