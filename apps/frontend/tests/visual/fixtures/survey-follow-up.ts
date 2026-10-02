import { outcomeFollowUpReadDtoSchema, surveyResultDtoSchema } from '@fops/shared';
import { z } from 'zod';
import { surveyResultVisualFixture, surveyResultsFixtureFor } from './survey-results';
import { surveyVisualFixtureSchema } from './surveys';

const ids = {
  finding: '55555555-5555-4555-8555-555555555555',
  question: '22222222-2222-4222-8222-222222222222',
  responseOpen: '66666666-6666-4666-8666-666666666666',
  responseFinding: '77777777-7777-4777-8777-777777777777',
  responseNoFollowUp: '88888888-8888-4888-8888-888888888888',
};

export const surveyFollowUpVisualFixture = surveyVisualFixtureSchema.parse({
  ...surveyResultVisualFixture,
  title: 'Q3 Export 개선 효과 설문',
  type: 'outcome' as const,
  status: 'closed' as const,
});

export const surveyFollowUpVisualListFixture = z
  .array(surveyVisualFixtureSchema)
  .parse([surveyFollowUpVisualFixture]);

export const surveyFollowUpReadVisualFixture = outcomeFollowUpReadDtoSchema.parse({
  survey_id: surveyFollowUpVisualFixture.id,
  classifiable: true,
  follow_up_needed: true,
  personal_access: true,
  items: [
    {
      response_id: ids.responseOpen,
      response_number: 4,
      submitted_at: '2026-09-21T00:00:00.000Z',
      low_answers: [
        {
          question_id: ids.question,
          question_label: '만족도',
          value: 2,
          rating_min: 1,
          rating_max: 5,
        },
        {
          question_id: '99999999-9999-4999-8999-999999999999',
          question_label: '처리 속도',
          value: 1,
          rating_min: 1,
          rating_max: 5,
        },
      ],
      resolution: 'open',
      finding: null,
      decision: null,
      next_actions: [
        { id: 'create_finding', availability: 'allowed' },
        { id: 'mark_no_follow_up', availability: 'allowed' },
      ],
    },
    {
      response_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      response_number: 7,
      submitted_at: '2026-09-22T00:00:00.000Z',
      low_answers: [
        {
          question_id: ids.question,
          question_label: '만족도',
          value: 2,
          rating_min: 1,
          rating_max: 5,
        },
      ],
      resolution: 'open',
      finding: null,
      decision: null,
      next_actions: [{ id: 'mark_no_follow_up', availability: 'allowed' }],
    },
    {
      response_id: ids.responseFinding,
      response_number: 9,
      submitted_at: '2026-09-22T00:00:00.000Z',
      low_answers: [
        {
          question_id: ids.question,
          question_label: '만족도',
          value: 2,
          rating_min: 1,
          rating_max: 5,
        },
      ],
      resolution: 'finding',
      finding: { id: ids.finding, display_id: 'FND-118', status: 'active' },
      decision: null,
      next_actions: [],
    },
    {
      response_id: ids.responseNoFollowUp,
      response_number: 12,
      submitted_at: '2026-09-23T00:00:00.000Z',
      low_answers: [
        {
          question_id: ids.question,
          question_label: '처리 속도',
          value: 2,
          rating_min: 1,
          rating_max: 5,
        },
      ],
      resolution: 'no_follow_up',
      finding: null,
      decision: {
        state: 'no_follow_up',
        reason: '제품 범위 밖의 요청입니다.',
        updated_at: '2026-09-24T00:00:00.000Z',
      },
      next_actions: [{ id: 'reopen_follow_up', availability: 'allowed' }],
    },
  ],
});

export const surveyResultsFollowUpReadVisualFixture = outcomeFollowUpReadDtoSchema.parse({
  survey_id: surveyFollowUpVisualFixture.id,
  classifiable: true,
  follow_up_needed: false,
  personal_access: false,
  items: null,
});

const followUpResultsFixture = surveyResultsFixtureFor('poor-outcome');
export const surveyFollowUpResultsVisualFixture = surveyResultDtoSchema.parse({
  ...followUpResultsFixture,
  questions: followUpResultsFixture.questions.map((question) =>
    question.visibility === 'visible' && question.kind === 'text'
      ? {
          ...question,
          excerpts: question.excerpts.map((excerpt) => ({
            ...excerpt,
            text: '대용량 export가 여전히 10분 이상 걸립니다.',
          })),
        }
      : question,
  ),
});

export const surveyFollowUpReadFixtureSchema = outcomeFollowUpReadDtoSchema;
