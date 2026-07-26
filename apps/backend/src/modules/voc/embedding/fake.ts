import { createHash } from 'node:crypto';

import type { EmbeddingProvider, EmbeddingResult } from './port.js';

export interface FakeEmbeddingProviderOptions {
  dimensions: number;
  embeddingVersion: number;
}

const FAKE_MODEL = 'fake-hash-v1';

function vectorFor(text: string, dimensions: number): number[] {
  const values: number[] = [];
  let block = 0;

  while (values.length < dimensions) {
    const digest = createHash('sha256').update(`${block}:${text}`, 'utf8').digest();
    for (let offset = 0; offset < digest.length && values.length < dimensions; offset += 4) {
      const unsigned = digest.readUInt32BE(offset);
      values.push((unsigned / 0xffffffff) * 2 - 1);
    }
    block += 1;
  }

  const norm = Math.hypot(...values);
  // A SHA-256-derived vector cannot practically be zero, but protect the
  // provider invariant rather than ever returning an invalid vector.
  if (norm === 0) throw new Error('Fake embedding produced a zero vector');
  return values.map((value) => value / norm);
}

/**
 * This fake only guarantees deterministic, valid vectors for offline tests.
 * Hashes do not preserve meaning, so it must not be used for semantic-similarity assertions.
 */
export function createFakeEmbeddingProvider(
  options: FakeEmbeddingProviderOptions,
): EmbeddingProvider {
  if (!Number.isInteger(options.dimensions) || options.dimensions <= 0) {
    throw new Error('Fake embedding dimensions must be a positive integer');
  }

  return {
    async embed(texts: string[]): Promise<EmbeddingResult> {
      return {
        vectors: texts.map((text) => vectorFor(text, options.dimensions)),
        provider: 'fake',
        model: FAKE_MODEL,
        dimensions: options.dimensions,
        embeddingVersion: options.embeddingVersion,
      };
    },
  };
}
