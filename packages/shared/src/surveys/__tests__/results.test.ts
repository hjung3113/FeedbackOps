import { describe, expect, it } from 'vitest';

import {
  ERROR_CODES,
  getRatingBandForValue,
  getRatingBandPartition,
  surveyResultDtoSchema,
  surveyResultNextActionSchema,
} from '../../index.js';

const U = '01919b8c-0000-7000-8000-000000000001';
const V = '01919b8c-0000-7000-8000-000000000002';

function maximalValidResult() {
  return {
    survey_id: U,
    status: 'closed',
    identity_protected: true,
    questions: [
      {
        question_id: V,
        visibility: 'visible',
        kind: 'choice',
        answer_count: 8,
        option_buckets: [
          { key: 'yes', label: 'Yes', count: 5 },
          { key: 'no', label: 'No', count: 3 },
        ],
      },
      {
        question_id: '01919b8c-0000-7000-8000-000000000003',
        visibility: 'visible',
        kind: 'rating',
        answer_count: 7,
        distribution: { low: 2, mid: 3, high: 2 },
      },
      {
        question_id: '01919b8c-0000-7000-8000-000000000004',
        visibility: 'visible',
        kind: 'text',
        answer_count: 6,
        distribution: null,
        excerpts: [],
      },
      {
        question_id: '01919b8c-0000-7000-8000-000000000005',
        visibility: 'suppressed',
        response_count: null,
        suppression: { code: 'anonymity_threshold' },
      },
    ],
    next_actions: [
      {
        id: 'create_finding',
        availability: 'blocked_requestable',
        intent: 'open_finding_draft',
        requestable_permission: { permission: 'finding.manage', managed_system_id: U },
      },
      {
        id: 'request_task',
        availability: 'allowed',
        intent: 'open_task_request_draft',
        source_finding_id: V,
      },
    ],
  } as const;
}

describe('rating result bands', () => {
  it.each(Array.from({ length: 11 }, (_, index) => index + 1))(
    'partitions every n=%i integer domain into ordered contiguous bands',
    (size) => {
      const min = -3;
      const max = min + size - 1;
      const partition = getRatingBandPartition(min, max);
      const values = Array.from({ length: size }, (_, index) => min + index);
      const ranges = (Object.entries(partition) as [
        'low' | 'mid' | 'high',
        { min: number; max: number } | null,
      ][]).filter((entry): entry is ['low' | 'mid' | 'high', { min: number; max: number }] => entry[1] !== null);

      expect(ranges[0]?.[1].min).toBe(min);
      expect(ranges.at(-1)?.[1].max).toBe(max);
      expect(ranges.flatMap(([, range]) =>
        Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index),
      )).toEqual(values);

      for (const value of values) {
        const containingBands = ranges.filter(([, range]) => value >= range.min && value <= range.max);

        expect(containingBands).toHaveLength(1);
        expect(getRatingBandForValue(min, max, value)).toBe(containingBands[0]![0]);
      }
    },
  );

  it('documents the 1–10 boundary snapshot', () => {
    expect(getRatingBandPartition(1, 10)).toEqual({
      low: { min: 1, max: 4 },
      mid: { min: 5, max: 7 },
      high: { min: 8, max: 10 },
    });
  });

  it('handles one-value and two-value domains deterministically', () => {
    expect(getRatingBandPartition(4, 4)).toEqual({
      low: { min: 4, max: 4 },
      mid: null,
      high: null,
    });
    expect(getRatingBandPartition(4, 5)).toEqual({
      low: { min: 4, max: 4 },
      mid: { min: 5, max: 5 },
      high: null,
    });
  });
});

describe('SurveyResultDto privacy boundary', () => {
  it.each([
    { count: 1 },
    { answer_count: 1 },
    { distribution: { low: 1, mid: 0, high: 0 } },
    { option_buckets: [{ key: 'yes', label: 'Yes', count: 1 }] },
    { response_count: 1 },
  ])('rejects count or distribution leakage on a suppressed question: %o', (leak) => {
    const payload = maximalValidResult();
    const suppressed = payload.questions[3];

    expect(() =>
      surveyResultDtoSchema.parse({
        ...payload,
        questions: [...payload.questions.slice(0, 3), { ...suppressed, ...leak }],
      }),
    ).toThrow();
  });

  it('requires the exact suppressed-question key set', () => {
    const payload = maximalValidResult();
    const suppressed = payload.questions[3];

    expect(Object.keys(suppressed).sort()).toEqual([
      'question_id',
      'response_count',
      'suppression',
      'visibility',
    ]);
    expect(surveyResultDtoSchema.parse(payload).questions[3]).toEqual(suppressed);
    expect(() =>
      surveyResultDtoSchema.parse({
        ...payload,
        questions: [...payload.questions.slice(0, 3), { ...suppressed, extra: true }],
      }),
    ).toThrow();
    const { question_id: _questionId, ...withoutQuestionId } = suppressed;
    expect(() =>
      surveyResultDtoSchema.parse({
        ...payload,
        questions: [...payload.questions.slice(0, 3), withoutQuestionId],
      }),
    ).toThrow();
  });

  it('contains no forbidden identity or raw-answer keys', () => {
    const forbidden = /^(respondent.*|actor_id|email|external_id|response_id|submitted_at|created_at|session.*|ip.*|user_agent|answer_value|text|excerpt)$/;
    const seen: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          seen.push(key);
          walk(child);
        }
      }
    };

    walk(surveyResultDtoSchema.parse(maximalValidResult()));
    expect(seen.filter((key) => forbidden.test(key))).toEqual([]);
  });
});

describe('SurveyResultNextAction closed union', () => {
  it('contains exactly create_finding and request_task IDs at runtime', () => {
    const options = surveyResultNextActionSchema.options;
    const ids = options.map((option) => option.shape.id.value).sort();

    expect(ids).toEqual(['create_finding', 'request_task']);
  });

  it('does not permit create_voc at the type level', () => {
    // @ts-expect-error create_voc must never become a shared survey result action.
    const forbiddenAction: import('../../index.js').SurveyResultNextAction = { id: 'create_voc' };
    expect(forbiddenAction).toBeDefined();
  });
});

describe('@fops/shared survey result public API', () => {
  it('exports the result contract from the package root', () => {
    expect(surveyResultDtoSchema).toBeDefined();
    expect(getRatingBandPartition).toBeDefined();
  });

  it('exports conflict.survey_results_unavailable', () => {
    expect(ERROR_CODES).toContain('conflict.survey_results_unavailable');
  });
});
