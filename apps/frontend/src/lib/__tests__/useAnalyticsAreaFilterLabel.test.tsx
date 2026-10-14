import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnalyticsAreaFilterLabel } from '../useAnalyticsAreaFilterLabel';

const AREA = '11111111-1111-4111-8111-111111111111';
const MS = '22222222-2222-4222-8222-222222222222';
function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => vi.unstubAllGlobals());
describe('Area filter label', () => {
  it('finds an archived UUID on the second catalog page in the current scope', async () => {
    const requests: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input, 'http://localhost');
        requests.push(url);
        const offset = Number(url.searchParams.get('offset'));
        return new Response(
          JSON.stringify({
            items:
              offset === 0
                ? Array.from({ length: 500 }, (_, i) => ({ id: `other-${i}` }))
                : [{ id: AREA, name: '결제', archived_at: '2026-01-01' }],
            total: 501,
          }),
        );
      }),
    );
    const { result } = renderHook(() => useAnalyticsAreaFilterLabel(AREA, MS), { wrapper });
    expect(result.current).toBe('Analytics Area: 선택한 Area');
    await waitFor(() => expect(result.current).toBe('Analytics Area: 결제 (보관됨)'));
    expect(requests.map((url) => url.searchParams.get('offset'))).toEqual(['0', '500']);
    expect(
      requests.every(
        (url) =>
          url.searchParams.get('include_archived') === 'true' &&
          url.searchParams.get('managed_system_id') === MS,
      ),
    ).toBe(true);
  });
  it.each(['missing', 'error'])('keeps the safe fallback for %s', async (mode) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [], total: 0 }), {
            status: mode === 'error' ? 500 : 200,
          }),
      ),
    );
    const { result } = renderHook(() => useAnalyticsAreaFilterLabel(AREA), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(result.current).toBe('Analytics Area: 선택한 Area');
  });
  it('ignores an old scope response after scope changes and resolves an unarchived label', async () => {
    let finishOld!: (response: Response) => void;
    let oldStarted = false;
    let currentStarted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input, 'http://localhost');
        if (url.searchParams.get('managed_system_id') === MS) {
          oldStarted = true;
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        }
        currentStarted = true;
        return new Response(
          JSON.stringify({ items: [{ id: AREA, name: '현재 Area', archived_at: null }], total: 1 }),
        );
      }),
    );
    const { result, rerender } = renderHook(
      ({ scope }) => useAnalyticsAreaFilterLabel(AREA, scope),
      { initialProps: { scope: MS }, wrapper },
    );
    await waitFor(() => expect(oldStarted).toBe(true));
    rerender({ scope: AREA });
    await waitFor(() => expect(currentStarted).toBe(true));
    await waitFor(() => expect(result.current).toBe('Analytics Area: 현재 Area'));
    await act(async () =>
      finishOld(
        new Response(
          JSON.stringify({ items: [{ id: AREA, name: '이전 Area', archived_at: null }], total: 1 }),
        ),
      ),
    );
    expect(result.current).toBe('Analytics Area: 현재 Area');
  });

  it('labels unset without fetching', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useAnalyticsAreaFilterLabel('unset'), { wrapper });
    expect(result.current).toBe('Analytics Area: 미지정');
    expect(fetch).not.toHaveBeenCalled();
  });
});
