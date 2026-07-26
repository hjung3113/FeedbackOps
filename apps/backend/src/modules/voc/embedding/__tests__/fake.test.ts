import { describe, expect, it } from 'vitest';

import { createFakeEmbeddingProvider } from '../fake.js';

describe('FakeEmbeddingProvider', () => {
  it('returns deterministic, distinct unit vectors', async () => {
    const provider = createFakeEmbeddingProvider({ dimensions: 8, embeddingVersion: 1 });

    const first = await provider.embed(['same text', 'other text']);
    const second = await provider.embed(['same text']);

    expect(first.vectors[0]).toEqual(second.vectors[0]);
    expect(first.vectors[0]).not.toEqual(first.vectors[1]);
    expect(first.dimensions).toBe(8);
    expect(first.provider).toBe('fake');
    expect(first.embeddingVersion).toBe(1);

    const norm = Math.sqrt(first.vectors[0]!.reduce((sum, value) => sum + value ** 2, 0));
    expect(norm).toBeCloseTo(1, 12);
  });

  it('preserves input order', async () => {
    const provider = createFakeEmbeddingProvider({ dimensions: 8, embeddingVersion: 1 });

    const batch = await provider.embed(['first', 'second', 'third']);
    const first = await provider.embed(['first']);
    const second = await provider.embed(['second']);
    const third = await provider.embed(['third']);

    expect(batch.vectors).toEqual([first.vectors[0], second.vectors[0], third.vectors[0]]);
  });
});
