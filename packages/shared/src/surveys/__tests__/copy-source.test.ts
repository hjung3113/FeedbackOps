import { describe, expect, it } from 'vitest';
import { surveyCopySourceResponseSchema, surveyCopySourcesResponseSchema } from '../../index.js';

const id = '01919b8c-0000-7000-8000-000000000001';
const metadata = { survey_id: id, display_id: 'SRV-1000', title: 'Saved round', type: 'outcome' };
const question = {
  id,
  kind: 'rating',
  prompt: 'Useful?',
  is_required: true,
  options: null,
  rating_min: 1,
  rating_max: 5,
  rating_low_label: null,
  rating_high_label: 'High',
  sort_order: 0,
  branch_depth: 0,
  branch_parent_question_id: null,
  branch_trigger_option_key: null,
};
const selected = { ...metadata, definition_token: 'opaque-token', questions: [question] };

describe('Saved Survey source response contracts (#1074)', () => {
  it('accepts persisted question IDs and nullable rating labels', () => {
    expect(surveyCopySourceResponseSchema.parse(selected)).toEqual(selected);
    const page = {
      items: [{ ...metadata, status: 'closed', question_count: 1 }],
      page: { has_more: false },
    };
    expect(surveyCopySourcesResponseSchema.parse(page)).toEqual(page);
  });
  it.each([
    'operator_actor_id',
    'responses_identity_protected',
    'responses',
    'answers',
    'follow_up',
    'links',
  ])('rejects extra source metadata %s', (field) => {
    expect(() =>
      surveyCopySourceResponseSchema.parse({ ...selected, [field]: 'private' }),
    ).toThrow();
    expect(() =>
      surveyCopySourcesResponseSchema.parse({
        items: [{ ...metadata, status: 'closed', question_count: 1, [field]: 'private' }],
        page: { has_more: false },
      }),
    ).toThrow();
  });
  it.each([
    { ...selected, definition_token: '' },
    { ...selected, questions: [] },
    { ...selected, questions: [{ ...question, id: 'symbolic-key' }] },
    { ...selected, questions: [{ ...question, answer: 'private' }] },
    { ...selected, questions: [{ ...question, rating_max: 1 }] },
    { ...selected, questions: [{ ...question, sort_order: 1 }] },
    { ...selected, questions: [{ ...question, kind: 'text' }] },
    { ...selected, questions: [{ ...question, branch_depth: 1 }] },
  ])('rejects incomplete or polluted selected definitions %j', (input) => {
    expect(() => surveyCopySourceResponseSchema.parse(input)).toThrow();
  });
});
