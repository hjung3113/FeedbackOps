import { describe, expect, it, vi } from 'vitest';

import { createVoyageEmbeddingProvider } from '../voyage.js';

const API_KEY = 'voyage-key-must-never-appear';

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('VoyageEmbeddingProvider', () => {
  it('maps a successful response with its batch metadata', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response(200, { data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }] }),
    );
    const provider = createVoyageEmbeddingProvider({
      apiKey: API_KEY,
      dimensions: 3,
      embeddingVersion: 7,
      fetch,
    });

    await expect(provider.embed(['one', 'two'])).resolves.toEqual({
      vectors: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
      provider: 'voyage',
      model: 'voyage-3',
      dimensions: 3,
      embeddingVersion: 7,
    });
  });

  it('does not call fetch for empty input', async () => {
    const fetch = vi.fn();
    const provider = createVoyageEmbeddingProvider({
      apiKey: API_KEY,
      dimensions: 3,
      embeddingVersion: 1,
      fetch,
    });

    await expect(provider.embed([])).resolves.toMatchObject({ vectors: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['non-2xx response', response(429, { detail: API_KEY })],
    ['wrong vector count', response(200, { data: [{ embedding: [0.1, 0.2, 0.3] }] })],
    ['wrong vector dimensions', response(200, { data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] })],
  ])('rejects %s without exposing its API key', async (_name, fetchResponse) => {
    const fetch = vi.fn().mockResolvedValue(fetchResponse);
    const provider = createVoyageEmbeddingProvider({
      apiKey: API_KEY,
      dimensions: 3,
      embeddingVersion: 1,
      fetch,
    });

    const error = await provider.embed(['one', 'two']).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(API_KEY);
  });

  it('preserves the HTTP status on a non-2xx provider error', async () => {
    const provider = createVoyageEmbeddingProvider({
      apiKey: API_KEY,
      dimensions: 3,
      embeddingVersion: 1,
      fetch: vi.fn().mockResolvedValue(response(503, {})),
    });

    const error = await provider.embed(['one']).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 503 });
  });
});
