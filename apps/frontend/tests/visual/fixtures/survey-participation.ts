import {
  answerableSurveysResponseSchema,
  mySurveyResponsesResponseSchema,
  surveyRespondentFormDtoSchema,
  surveyResponseSubmittedDtoSchema,
} from '@fops/shared';

export const surveyParticipationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const questionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const multipleChoiceQuestionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const textQuestionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

export const surveyParticipationAnswerableFixture = answerableSurveysResponseSchema.parse({
  items: [
    {
      survey_id: surveyParticipationId,
      display_id: 'SRV-21',
      title: 'Q3 매출 리포트 사용성 진단',
      type: 'discovery',
      question_count: 3,
      opened_at: '2026-07-21T00:00:00.000Z',
    },
  ],
  page: { has_more: false },
});

export const surveyParticipationMoreAnswerableFixture = answerableSurveysResponseSchema.parse({
  items: surveyParticipationAnswerableFixture.items,
  page: { has_more: true, cursor: 'visual-more-surveys' },
});

export const surveyParticipationEmptyFixture = answerableSurveysResponseSchema.parse({
  items: [],
  page: { has_more: false },
});

export const surveyParticipationHistoryFixture = mySurveyResponsesResponseSchema.parse({
  items: [
    {
      survey_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      survey_title: 'Q2 분기 업무 흐름 설문',
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
      kind: 'rating',
      prompt: '리포트 사용 빈도를 평가해 주세요.',
      is_required: true,
      sort_order: 0,
      options: null,
      rating_min: 1,
      rating_max: 5,
      rating_low_label: '훨씬 자주',
      rating_high_label: '거의 없음',
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
    {
      id: multipleChoiceQuestionId,
      kind: 'multiple_choice',
      prompt: '자주 이용하는 기능을 선택해 주세요.',
      is_required: false,
      sort_order: 1,
      options: [
        { key: 'chart', label: '차트' },
        { key: 'download', label: '다운로드' },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
    {
      id: textQuestionId,
      kind: 'text',
      prompt: '개선할 점을 적어주세요.',
      is_required: false,
      sort_order: 2,
      options: null,
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

export type SurveyParticipationVisualScenario = 'populated' | 'empty' | 'has-more';
