// #398 — survey DTO schemas must accept exactly the backend wire shape
// (apps/backend/src/modules/surveys/service.ts `dto`/`questionDto`) and
// reject payloads a consumer cannot render. Tolerance contract: additive
// unknown fields are stripped, never fatal.

import { describe, expect, it } from 'vitest';
import {
  listSurveysResponseSchema,
  surveyDtoSchema,
  surveyQuestionDtoSchema,
} from '../dto.js';

const QUESTION = {
  id: '6f1c2b3a-1111-4222-8333-444455556666',
  survey_id: 'a1b2c3d4-0000-4111-8222-333344445555',
  kind: 'single_choice',
  prompt: '가장 불편한 점은?',
  is_required: true,
  options: [
    { key: 'slow', label: '느림' },
    { key: 'complex', label: '복잡함' },
  ],
  rating_min: null,
  rating_max: null,
  rating_low_label: null,
  rating_high_label: null,
  sort_order: 0,
  branch_depth: 0,
  branch_parent_question_id: null,
  branch_trigger_option_key: null,
} as const;

const SURVEY = {
  id: 'a1b2c3d4-0000-4111-8222-333344445555',
  workspace_id: '9a1b2c3d-0000-4111-8222-333344445555',
  display_id: 'SUR-12',
  type: 'discovery',
  status: 'open',
  title: '온보딩 탐구 설문',
  description: null,
  primary_managed_system_id: '3a1b2c3d-0000-4111-8222-333344445555',
  analytics_area_id: null,
  operator_actor_id: '4a1b2c3d-0000-4111-8222-333344445555',
  responses_identity_protected: true,
  created_by: '4a1b2c3d-0000-4111-8222-333344445555',
  opened_at: '2026-07-01T00:00:00.000Z',
  closed_at: null,
  created_at: '2026-06-30T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
} as const;

describe('surveyDtoSchema', () => {
  it('parses the GET /surveys/:id wire shape (survey + questions)', () => {
    const parsed = surveyDtoSchema.parse({ ...SURVEY, questions: [QUESTION] });
    expect(parsed.status).toBe('open');
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions?.[0]?.kind).toBe('single_choice');
  });

  it('parses a GET /surveys list item without questions', () => {
    const parsed = surveyDtoSchema.parse(SURVEY);
    expect(parsed.questions).toBeUndefined();
    expect(surveyQuestionDtoSchema.safeParse(QUESTION).success).toBe(true);
  });

  it('strips additive backend fields instead of failing (tolerant reader)', () => {
    const parsed = surveyDtoSchema.parse({ ...SURVEY, future_field: { nested: true } });
    expect('future_field' in parsed).toBe(false);
  });

  it('rejects a missing id', () => {
    const { id: _dropped, ...withoutId } = SURVEY;
    const result = surveyDtoSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['id']);
  });

  it('rejects an unknown survey type', () => {
    const result = surveyDtoSchema.safeParse({ ...SURVEY, type: 'bogus' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.code).toBe('invalid_enum_value');
  });

  it('rejects a non-uuid primary_managed_system_id', () => {
    const result = surveyDtoSchema.safeParse({ ...SURVEY, primary_managed_system_id: 'ms-1' });
    expect(result.success).toBe(false);
  });
});

describe('listSurveysResponseSchema', () => {
  it('parses the bare-array GET /surveys body', () => {
    const parsed = listSurveysResponseSchema.parse([SURVEY, { ...SURVEY, status: 'draft' }]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.status).toBe('draft');
  });

  it('rejects an enveloped object body (wire shape is an array, not {items})', () => {
    expect(listSurveysResponseSchema.safeParse({ items: [SURVEY] }).success).toBe(false);
  });

  it('rejects an element with a malformed field', () => {
    expect(
      listSurveysResponseSchema.safeParse([{ ...SURVEY, responses_identity_protected: 'yes' }])
        .success,
    ).toBe(false);
  });
});
