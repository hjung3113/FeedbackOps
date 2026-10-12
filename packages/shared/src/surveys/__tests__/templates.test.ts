import { describe, expect, it } from 'vitest';
import { surveyStartingPointSchema, surveyTemplatesResponseSchema } from '../../index.js';

const preview = {
  items: [
    {
      template_id: 'validation-basic',
      version: 1,
      type: 'validation',
      title: 'Validation 기본 템플릿',
      description: '제안된 개선 내용을 Survey 설명에 입력하세요.',
      questions: [
        {
          key: 'expected-usefulness',
          kind: 'rating',
          prompt: '제안된 개선이 업무에 얼마나 도움이 될 것으로 예상하나요?',
          is_required: true,
          sort_order: 0,
          rating_min: 1,
          rating_max: 5,
          rating_low_label: '전혀 도움이 되지 않음',
          rating_high_label: '매우 도움이 됨',
        },
      ],
    },
  ],
};

describe('Survey built-in preview contract (#1073)', () => {
  it('parses symbolic previews without persisted Survey or question UUIDs', () => {
    expect(surveyTemplatesResponseSchema.parse(preview)).toEqual(preview);
  });

  it.each([
    { questions: [{ key: 'x', kind: 'rating', prompt: 'Rate', is_required: true, sort_order: 0 }] },
    { version: 0 },
    { questions: [{ ...preview.items[0]?.questions[0], id: 'invented-persisted-id' }] },
    { questions: [{ ...preview.items[0]?.questions[0], rating_max: 1 }] },
  ])('rejects an incomplete or invalid preview %j', (override) => {
    expect(() =>
      surveyTemplatesResponseSchema.parse({ items: [{ ...preview.items[0], ...override }] }),
    ).toThrow();
  });

  it.each([
    { kind: 'builtin', template_id: 'validation-basic', version: 1, questions: [] },
    {
      kind: 'existing_survey',
      survey_id: '01919b8c-0000-7000-8000-000000000001',
      definition_token: '',
    },
    { kind: 'builtin', template_id: 'validation-basic', version: '1' },
    {
      kind: 'existing_survey',
      survey_id: '01919b8c-0000-7000-8000-000000000001',
      definition_token: 'token',
      questions: [],
    },
  ])('rejects raw question bodies and invalid starting-point fields %j', (input) => {
    expect(() => surveyStartingPointSchema.parse(input)).toThrow();
  });
});

it('accepts a saved-source ID and required token', () => {
  const input = {
    kind: 'existing_survey',
    survey_id: '01919b8c-0000-7000-8000-000000000001',
    definition_token: 'opaque-token',
  };
  expect(surveyStartingPointSchema.parse(input)).toEqual(input);
});
it.each([
  { kind: 'existing_survey', definition_token: 'token' },
  { kind: 'existing_survey', survey_id: 'bad', definition_token: 'token' },
  { kind: 'existing_survey', survey_id: '01919b8c-0000-7000-8000-000000000001' },
])('rejects missing or invalid source credentials %j', (input) => {
  expect(() => surveyStartingPointSchema.parse(input)).toThrow();
});
