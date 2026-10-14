import { describe, expect, it } from 'vitest';
import { similarityPreviewBudgetDetailSchema } from '../../errors/codes.js';
import { similarityPreviewAvailabilityResponseSchema } from '../../index.js';
import {
  similarityPreviewRequestSchema,
  similarityPreviewResponseSchema,
} from '../similarity-preview.js';

const body = {
  primary_managed_system_id: '11111111-1111-4111-8111-111111111111',
  title: 'Draft',
  description_rich_content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
  },
};
describe('draft preview wire boundary', () => {
  it('validates paid budget details independently of abuse envelopes', () => {
    expect(
      similarityPreviewBudgetDetailSchema.parse({ budget_period: 'day', retry_after_seconds: 30 }),
    ).toEqual({ budget_period: 'day', retry_after_seconds: 30 });
    expect(similarityPreviewBudgetDetailSchema.safeParse({ retry_after_seconds: 30 }).success).toBe(
      false,
    );
  });
  it.each([
    { ...body, extra: true },
    { ...body, title: '' },
    { ...body, description_rich_content: { type: 'doc' } },
  ])('rejects invalid input %j', (input) => {
    expect(similarityPreviewRequestSchema.safeParse(input).success).toBe(false);
  });
  it('accepts the strict draft and availability union only', () => {
    expect(similarityPreviewRequestSchema.parse(body)).toEqual(body);
    expect(
      similarityPreviewResponseSchema.parse({
        available: false,
        reason: 'provider_timeout',
        items: [],
      }),
    ).toEqual({ available: false, reason: 'provider_timeout', items: [] });
    expect(
      similarityPreviewResponseSchema.safeParse({ available: true, items: [], total: 0 }).success,
    ).toBe(false);
    const item = {
      id: body.primary_managed_system_id,
      display_id: 'VOC-1',
      title: 'Old',
      created_at: '2026-10-14T00:00:00.000Z',
    };
    expect(
      similarityPreviewResponseSchema.safeParse({
        available: true,
        items: [item, item, item, item],
      }).success,
    ).toBe(false);
    expect(
      similarityPreviewResponseSchema.safeParse({ available: true, items: [{ ...item, score: 1 }] })
        .success,
    ).toBe(false);
  });
});

describe('preview availability wire boundary', () => {
  it.each([{ available: true }, { available: false, reason: 'provider_disabled' }])(
    'accepts the availability response %j',
    (response) =>
      expect(similarityPreviewAvailabilityResponseSchema.parse(response)).toEqual(response),
  );
  it.each([
    { available: true, reason: 'provider_disabled' },
    { available: false },
    { available: false, reason: 'provider_failed' },
    { available: true, items: [] },
  ])('rejects non-contract availability %j', (response) => {
    expect(similarityPreviewAvailabilityResponseSchema.safeParse(response).success).toBe(false);
  });
});
