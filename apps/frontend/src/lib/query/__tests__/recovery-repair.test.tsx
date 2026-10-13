import { useFindingStatusMutation } from '@/features/findings/hooks/useFindingStatusMutation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());
it('source repair invalidates inactive recovery pages, detail, history and every summary scope after unmount', async () => {
  let settle!: (response: Response) => void;
  const fetch = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        settle = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient();
  const keys = [
    ['recovery', 'list', 'visible'],
    ['recovery', 'list', 'hidden'],
    ['recovery', 'detail', 'selected'],
    ['recovery', 'history'],
    ['dashboard-summary'],
    ['dashboard-summary', 'scope'],
  ];
  for (const key of keys) client.setQueryData(key, { value: 'before' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(
    () =>
      useFindingStatusMutation({
        findingId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: '11111111-1111-4111-8111-111111111112',
      }),
    { wrapper },
  );
  act(() => result.current.mutate({ status: 'not_actionable' }));
  await waitFor(() => expect(settle).toBeTypeOf('function'));
  unmount();
  await act(async () =>
    settle(
      new Response(
        JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', status: 'not_actionable' }),
      ),
    ),
  );
  await waitFor(() =>
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]),
  );
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ status: 'not_actionable' });
});
