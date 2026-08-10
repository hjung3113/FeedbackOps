import { describe, expect, it } from 'vitest';

import { vocRecommendationsResponseSchema } from '../recommendations.js';

const item = {
  voc_id: '01919b8c-0000-7000-8000-000000000001',
  display_id: 'VOC-001',
  title: 'Test VOC',
  severity: 'high' as const,
  reporter_facing_status: 'received',
  score: 0.75,
};

describe('vocRecommendationsResponseSchema', () => {
  it('accepts the available result with scored items', () => {
    expect(vocRecommendationsResponseSchema.parse({
      available: true,
      embedding_version: 1,
      items: [item],
      total: 1,
    })).toMatchObject({ available: true, items: [item] });
  });

  it('accepts an unavailable result only with its reason and an empty item list', () => {
    expect(vocRecommendationsResponseSchema.parse({
      available: false,
      reason: 'provider_disabled',
      embedding_version: 1,
      items: [],
      total: 0,
    })).toMatchObject({ available: false, reason: 'provider_disabled' });
  });

  it('rejects a reason on available results and items on unavailable results', () => {
    expect(() => vocRecommendationsResponseSchema.parse({
      available: true, reason: 'provider_disabled', embedding_version: 1, items: [], total: 0,
    })).toThrow();
    expect(() => vocRecommendationsResponseSchema.parse({
      available: false, reason: 'source_not_embedded', embedding_version: 1, items: [item], total: 1,
    })).toThrow();
  });
});
