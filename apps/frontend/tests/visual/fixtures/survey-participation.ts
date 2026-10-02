import {
  answerableSurveysResponseSchema,
  mySurveyResponsesResponseSchema,
  surveyRespondentFormDtoSchema,
  surveyResponseSubmittedDtoSchema,
} from '@fops/shared';

export const surveyParticipationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const questionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export const surveyParticipationAnswerableFixture = answerableSurveysResponseSchema.parse({
  items: [
    {
      survey_id: surveyParticipationId,
      display_id: 'SRV-21',
      title: 'Q3 매출 리포트 사용성 진단',
      type: 'discovery',
      question_count: 1,
      opened_at: '2026-07-21T00:00:00.000Z',
    },
  ],
  page: { has_more: false },
});

export const surveyParticipationEmptyFixture = answerableSurveysResponseSchema.parse({
  items: [],
  page: { has_more: false },
});

export const surveyParticipationHistoryFixture = mySurveyResponsesResponseSchema.parse({
  items: [
    {
      survey_id: surveyParticipationId,
      survey_title: 'Q3 매출 리포트 사용성 진단',
      submitted_at: '2026-07-21T00:00:00.000Z',
      identity_protected: true,
    },
  ],
  page: { has_more: false },
});

export const surveyRespondentFormFixture = surveyRespondentFormDtoSchema.parse({
  survey: {
    id: surveyParticipationId,
    title: 'Q3 매출 리포트 사용성 진단',
    type: 'discovery',
    identity_protected: true,
  },
  questions: [
    {
      id: questionId,
      kind: 'single_choice',
      prompt: '리포트를 얼마나 자주 사용하시나요?',
      is_required: true,
      sort_order: 0,
      options: [
        { key: 'often', label: '자주 사용' },
        { key: 'rarely', label: '거의 사용하지 않음' },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
});

export const surveyResponseSubmittedFixture = surveyResponseSubmittedDtoSchema.parse({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  survey_id: surveyParticipationId,
  submitted_at: '2026-07-22T00:00:00.000Z',
  identity_protected: true,
});

export type SurveyParticipationVisualScenario = 'populated' | 'empty';
