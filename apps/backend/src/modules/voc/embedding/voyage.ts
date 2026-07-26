import type { EmbeddingProvider, EmbeddingResult } from './port.js';

const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const DEFAULT_VOYAGE_DIMENSIONS = 1024;

export interface VoyageFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type VoyageFetch = (
  input: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<VoyageFetchResponse>;

export interface VoyageEmbeddingProviderOptions {
  apiKey: string;
  embeddingVersion: number;
  fetch: VoyageFetch;
  dimensions?: number;
}

export class VoyageEmbeddingProviderError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'VoyageEmbeddingProviderError';
    this.status = status;
  }
}

function vectorsFromResponse(body: unknown): number[][] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { data?: unknown }).data)) {
    throw new VoyageEmbeddingProviderError('Voyage embedding response had an invalid shape');
  }

  return (body as { data: unknown[] }).data.map((item) => {
    const vector = item && typeof item === 'object' ? (item as { embedding?: unknown }).embedding : undefined;
    if (!Array.isArray(vector) || !vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new VoyageEmbeddingProviderError('Voyage embedding response contained an invalid vector');
    }
    return vector;
  });
}

export function createVoyageEmbeddingProvider(
  options: VoyageEmbeddingProviderOptions,
): EmbeddingProvider {
  const dimensions = options.dimensions ?? DEFAULT_VOYAGE_DIMENSIONS;
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error('Voyage embedding dimensions must be a positive integer');
  }

  return {
    async embed(texts: string[]): Promise<EmbeddingResult> {
      if (texts.length === 0) {
        return {
          vectors: [],
          provider: 'voyage',
          model: VOYAGE_MODEL,
          dimensions,
          embeddingVersion: options.embeddingVersion,
        };
      }

      let response: VoyageFetchResponse;
      try {
        response = await options.fetch(VOYAGE_EMBEDDINGS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
        });
      } catch {
        throw new VoyageEmbeddingProviderError('Voyage embedding request failed');
      }

      if (!response.ok) {
        // Do not read or include the response body: it can contain sensitive provider data.
        throw new VoyageEmbeddingProviderError(
          `Voyage embedding request failed with status ${response.status}`,
          response.status,
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new VoyageEmbeddingProviderError('Voyage embedding response could not be decoded');
      }
      const vectors = vectorsFromResponse(body);
      if (vectors.length !== texts.length) {
        throw new VoyageEmbeddingProviderError('Voyage embedding response vector count did not match input');
      }
      if (vectors.some((vector) => vector.length !== dimensions)) {
        throw new VoyageEmbeddingProviderError('Voyage embedding response vector dimensions did not match');
      }

      return {
        vectors,
        provider: 'voyage',
        model: VOYAGE_MODEL,
        dimensions,
        embeddingVersion: options.embeddingVersion,
      };
    },
  };
}
