import { describe, expect, it } from 'vitest';
import {
  confirmVocClusterSuggestionRequestSchema,
  discardVocClusterSuggestionRequestSchema,
  vocClusterSuggestionItemSchema,
  vocClusterSuggestionsResponseSchema,
} from '../cluster-suggestions.js';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const voc = (id: string) => ({
  id,
  display_id: 'VOC-1',
  title: '제목',
  description_rich_content: null,
});
const item = {
  id: b,
  primary_managed_system_id: a,
  revision: 1,
  embedding_version: 1,
  source_hashes: ['a', 'b'],
  vocs: [voc(a), voc(b)],
};

describe('Cluster suggestion wire contract', () => {
  it('accepts the reviewed pair and availability union without a count', () => {
    expect(
      vocClusterSuggestionsResponseSchema.parse({ available: true, items: [item] }).items,
    ).toHaveLength(1);
    expect(
      vocClusterSuggestionsResponseSchema.parse({
        available: false,
        reason: 'provider_disabled',
        items: [],
      }).available,
    ).toBe(false);
    expect(
      confirmVocClusterSuggestionRequestSchema.parse({
        expected_revision: 1,
        embedding_version: 1,
        source_hashes: ['a', 'b'],
      }).expected_revision,
    ).toBe(1);
  });
  it.each([
    { ...item, vocs: [voc(b), voc(a)] },
    { ...item, vocs: [voc(a), voc(a)] },
    { ...item, vocs: [voc(a)] },
    { ...item, score: 0.9 },
  ])('rejects unsorted, duplicate, partial or augmented pairs', (value) => {
    expect(vocClusterSuggestionItemSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    { expected_revision: 0 },
    { expected_revision: 1.5 },
    { expected_revision: 1, surprise: true },
  ])('requires a strict positive revision body', (value) => {
    expect(discardVocClusterSuggestionRequestSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    { expected_revision: 1, embedding_version: 0, source_hashes: ['a', 'b'] },
    { expected_revision: 1, embedding_version: 1, source_hashes: ['', 'b'] },
    { expected_revision: 1, embedding_version: 1, source_hashes: ['a'] },
    { expected_revision: 1, embedding_version: 1, source_hashes: ['a', 'b'], title: 'private' },
  ])('rejects malformed reviewed metadata', (value) => {
    expect(confirmVocClusterSuggestionRequestSchema.safeParse(value).success).toBe(false);
  });
  it('rejects hidden totals and nonempty unavailable results', () => {
    expect(
      vocClusterSuggestionsResponseSchema.safeParse({ available: true, items: [], total: 0 })
        .success,
    ).toBe(false);
    expect(
      vocClusterSuggestionsResponseSchema.safeParse({
        available: false,
        reason: 'provider_disabled',
        items: [item],
      }).success,
    ).toBe(false);
  });
});
