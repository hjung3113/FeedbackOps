import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIdempotencyKey } from '../useIdempotencyKey';

describe('useIdempotencyKey payload fingerprint', () => {
  it.each([
    { label: 'an identical retry', nextFingerprint: 'payload-a', rotates: false },
    { label: 'a changed payload', nextFingerprint: 'payload-b', rotates: true },
  ])('keeps or replaces the key for $label', ({ nextFingerprint, rotates }) => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) => useIdempotencyKey(undefined, fingerprint),
      { initialProps: { fingerprint: 'payload-a' } },
    );
    const firstKey = result.current.key;

    rerender({ fingerprint: nextFingerprint });

    expect(result.current.key === firstKey).toBe(!rotates);
  });
});
