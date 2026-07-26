import type { AppConfig } from '../../../config.js';

import { createDisabledEmbeddingProvider } from './disabled.js';
import { createFakeEmbeddingProvider } from './fake.js';
import type { EmbeddingProvider } from './port.js';
import { createVoyageEmbeddingProvider, type VoyageFetch } from './voyage.js';

const DEFAULT_DIMENSIONS = 1024;

export function createEmbeddingProvider(
  config: AppConfig,
  fetch: VoyageFetch = globalThis.fetch as unknown as VoyageFetch,
): EmbeddingProvider {
  if (config.EMBEDDING_PROVIDER === 'disabled') return createDisabledEmbeddingProvider();
  if (config.EMBEDDING_PROVIDER === 'fake') {
    return createFakeEmbeddingProvider({
      dimensions: DEFAULT_DIMENSIONS,
      embeddingVersion: config.EMBEDDING_VERSION,
    });
  }

  // loadConfig already rejects voyage-without-key, but this factory also takes
  // hand-built AppConfig objects in tests and callers. A non-null assertion
  // would turn that mistake into an `Authorization: Bearer undefined` request;
  // fail where the cause is still visible.
  if (!config.EMBEDDING_API_KEY) {
    throw new Error('EMBEDDING_API_KEY is required when EMBEDDING_PROVIDER=voyage');
  }

  return createVoyageEmbeddingProvider({
    apiKey: config.EMBEDDING_API_KEY,
    embeddingVersion: config.EMBEDDING_VERSION,
    fetch,
  });
}
