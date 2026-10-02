import { surveyResultDtoSchema } from '@fops/shared';
import { z } from 'zod';
import { surveyVisualFixture, surveyVisualFixtureSchema } from './surveys';

export const surveyResultVisualFixture = surveyVisualFixtureSchema.parse({
  ...surveyVisualFixture,
  type: 'outcome' as const,
  status: 'closed' as const,
});

const ids = {
  choice: '11111111-1111-4111-8111-111111111111',
  rating: '22222222-2222-4222-8222-222222222222',
  text: '33333333-3333-4333-8333-333333333333',
  excerpt: '44444444-4444-4444-8444-444444444444',
  response: '66666666-6666-4666-8666-666666666666',
  finding: '55555555-5555-4555-8555-555555555555',
};

export const surveyResultsSurveyFixture = surveyVisualFixtureSchema.parse({
  ...surveyResultVisualFixture,
  questions: [
    {
      id: ids.choice,
      survey_id: surveyResultVisualFixture.id,
      kind: 'single_choice',
      prompt: '리포트를 사용할 때 가장 불편한 점은 무엇인가요?',
      is_required: true,
      options: [{ key: 'slow', label: '느린 로딩' }],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 0,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
    {
      id: ids.rating,
      survey_id: surveyResultVisualFixture.id,
      kind: 'rating',
      prompt: '리포트 내보내기 속도에 만족하시나요?',
      is_required: true,
      options: null,
      rating_min: 1,
      rating_max: 5,
      rating_low_label: '매우 불만족',
      rating_high_label: '매우 만족',
      sort_order: 1,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
    {
      id: ids.text,
      survey_id: surveyResultVisualFixture.id,
      kind: 'text',
      prompt: '리포트 사용 경험에서 개선할 점이 있나요?',
      is_required: false,
      options: null,
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 2,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
});

export const surveyResultsNonOutcomeVisualFixture = surveyVisualFixtureSchema.parse({
  ...surveyResultsSurveyFixture,
  type: 'discovery' as const,
});

export const surveyResultVisualListFixture = z
  .array(surveyVisualFixtureSchema)
  .parse([surveyResultsSurveyFixture]);

export const surveyResultsNonOutcomeVisualListFixture = z
  .array(surveyVisualFixtureSchema)
  .parse([surveyResultsNonOutcomeVisualFixture]);

export const surveyResultsVisualScenarios = z
  .array(
    z.enum([
      'populated',
      'threshold-suppressed',
      'zero-response',
      'below-threshold',
      'no-permission',
      'poor-outcome',
      'empty-next-actions',
      'finding-draft',
      'non-outcome',
    ]),
  )
  .parse([
    'populated',
    'threshold-suppressed',
    'zero-response',
    'below-threshold',
    'no-permission',
    'poor-outcome',
    'empty-next-actions',
    'finding-draft',
    'non-outcome',
  ]);
export type SurveyResultsVisualScenario = (typeof surveyResultsVisualScenarios)[number];

export function surveyResultsFixtureFor(scenario: SurveyResultsVisualScenario) {
  let questions: unknown[] = [
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
      excerpts: [
        {
          id: ids.excerpt,
          text: '내보내기가 너무 느립니다.',
          response_id: ids.response,
        },
      ],
    },
  ];
  if (scenario === 'threshold-suppressed') {
    questions.push({
      question_id: '66666666-6666-4666-8666-666666666666',
      visibility: 'suppressed' as const,
      response_count: null,
      suppression: { code: 'anonymity_threshold' as const },
    });
  }
  const response_state =
    scenario === 'zero-response'
      ? 'none'
      : scenario === 'below-threshold'
        ? 'below_threshold'
        : 'visible';
  if (response_state !== 'visible') {
    questions = [ids.choice, ids.rating, ids.text].map((question_id) => ({
      question_id,
      visibility: 'suppressed' as const,
      response_count: null,
      suppression: { code: 'anonymity_threshold' as const },
    }));
  }
  return surveyResultDtoSchema.parse({
    survey_id: surveyResultVisualFixture.id,
    status: 'closed',
    identity_protected: true,
    response_state,
    anonymity_threshold: 5,
    questions,
    next_actions:
      scenario === 'empty-next-actions'
        ? []
        : [{ id: 'create_finding', availability: 'allowed', intent: 'open_finding_draft' }],
  });
}

export const surveyResultsFixtureSchema = surveyResultDtoSchema;
