import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdempotencyKey } from '../useIdempotencyKey';

describe('useIdempotencyKey', () => {
  it('returns a stable key across re-renders with same ifMatchEtag', () => {
    const { result, rerender } = renderHook(
      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
      { initialProps: { etag: 'W/"v1"' } },
    );
    const k1 = result.current.key;
    rerender({ etag: 'W/"v1"' });
    expect(result.current.key).toBe(k1);
  });

  it('mints a fresh key when ifMatchEtag changes', () => {
    const { result, rerender } = renderHook(
      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
      { initialProps: { etag: 'W/"v1"' } },
    );
    const k1 = result.current.key;
    rerender({ etag: 'W/"v2"' });
    // Synchronous derivation: no microtask or setTimeout wait needed.
    expect(result.current.key).not.toBe(k1);
  });

  it('key is fresh in the SAME render where ifMatchEtag changes', () => {
    const { result, rerender } = renderHook(
      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
      { initialProps: { etag: 'W/"v1"' } },
    );
    const k1 = result.current.key;
    // Switch etag and immediately read key — no async wait.
    rerender({ etag: 'W/"v2"' });
    const k2 = result.current.key;
    expect(k2).not.toBe(k1);
    // Confirm key is stable on subsequent re-renders with same etag
    rerender({ etag: 'W/"v2"' });
    expect(result.current.key).toBe(k2);
  });

  it('markConsumed() mints a fresh key', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const k1 = result.current.key;
    act(() => { result.current.markConsumed(); });
    expect(result.current.key).not.toBe(k1);
  });
});
