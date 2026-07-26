import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { EmbeddingUnavailableError } from '../modules/voc/embedding/disabled.js';
import { createEmbeddingProvider } from '../modules/voc/embedding/factory.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('embedding configuration', () => {
  it('defaults to the disabled provider', () => {
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_API_KEY;

    expect(loadConfig().EMBEDDING_PROVIDER).toBe('disabled');
  });

  it('selects the disabled provider when no API key is configured', async () => {
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_API_KEY;

    await expect(createEmbeddingProvider(loadConfig()).embed(['text'])).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('rejects Voyage configuration without an API key', () => {
    process.env.EMBEDDING_PROVIDER = 'voyage';
    delete process.env.EMBEDDING_API_KEY;

    expect(() => loadConfig()).toThrow(/EMBEDDING_API_KEY/);
  });
});
