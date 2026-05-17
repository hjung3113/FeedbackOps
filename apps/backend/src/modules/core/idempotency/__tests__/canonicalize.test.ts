import { describe, expect, it } from 'vitest';
import { canonicalizeJson, hashRequestBody } from '../canonicalize.js';

describe('canonicalizeJson undefined sentinel (S-008)', () => {
  it('distinguishes {} from { external_key: undefined }', () => {
    const a = hashRequestBody({});
    const b = hashRequestBody({ external_key: undefined });
    expect(a).not.toBe(b);
  });

  it('distinguishes { external_key: undefined } from { external_key: null }', () => {
    const undef = hashRequestBody({ external_key: undefined });
    const nul = hashRequestBody({ external_key: null });
    expect(undef).not.toBe(nul);
  });

  it('round-trips nested undefined-bearing objects deterministically', () => {
    const h1 = hashRequestBody({ a: { b: undefined, c: 1 } });
    const h2 = hashRequestBody({ a: { b: undefined, c: 1 } });
    expect(h1).toBe(h2);
  });
});
