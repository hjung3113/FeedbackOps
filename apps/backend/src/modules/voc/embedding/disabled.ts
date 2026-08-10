import type { EmbeddingProvider } from './port.js';

export class EmbeddingUnavailableError extends Error {
  constructor() {
    super('Embedding provider is unavailable');
    this.name = 'EmbeddingUnavailableError';
  }
}

/** Used only when embedding has not been configured for this environment. */
export function createDisabledEmbeddingProvider(): EmbeddingProvider {
  return {
    async embed(): Promise<never> {
      // D2 requires callers to distinguish unavailability from a legitimate
      // empty recommendation result, so this cannot quietly return [].
      throw new EmbeddingUnavailableError();
    },
  };
}
