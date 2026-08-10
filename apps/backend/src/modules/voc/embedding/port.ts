/**
 * A single embed call is fulfilled by one provider/model, so its storage
 * metadata belongs to the result rather than to each individual vector.
 */
export interface EmbeddingResult {
  vectors: number[][];
  provider: string;
  model: string;
  dimensions: number;
  embeddingVersion: number;
}

/**
 * Implementations preserve input order and reject vectors whose length differs
 * from the declared dimensions. Empty input returns an empty result without an
 * external provider call.
 */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<EmbeddingResult>;
}
