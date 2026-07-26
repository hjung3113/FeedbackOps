import { describe, expect, it } from 'vitest';

import { EmbeddingUnavailableError, createDisabledEmbeddingProvider } from '../disabled.js';

describe('DisabledEmbeddingProvider', () => {
  it('signals that embeddings are unavailable instead of returning an empty result', async () => {
    await expect(createDisabledEmbeddingProvider().embed(['text'])).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });
});
