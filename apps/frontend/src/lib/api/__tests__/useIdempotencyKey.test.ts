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

  it('mints a fresh key when ifMatchEtag changes', async () => {
    const { result, rerender } = renderHook(
      ({ etag }: { etag?: string }) => useIdempotencyKey(etag),
      { initialProps: { etag: 'W/"v1"' } },
    );
    const k1 = result.current.key;
    rerender({ etag: 'W/"v2"' });
    // wait for queueMicrotask to fire
    await new Promise((r) => setTimeout(r, 0));
    rerender({ etag: 'W/"v2"' });
    expect(result.current.key).not.toBe(k1);
  });

  it('markConsumed() mints a fresh key', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const k1 = result.current.key;
    act(() => { result.current.markConsumed(); });
    expect(result.current.key).not.toBe(k1);
  });
});
