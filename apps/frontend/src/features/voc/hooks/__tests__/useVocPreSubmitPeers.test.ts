import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiClient: vi.fn() }));

import { apiClient } from '@/lib/api';
import { useVocPreSubmitPeers } from '../useVocPreSubmitPeers';

const mockApiClient = vi.mocked(apiClient);
const msA = '11111111-1111-4111-8111-111111111111';
const msB = '22222222-2222-4222-8222-222222222222';
const peerA = { id: '33333333-3333-4333-8333-333333333333', display_id: 'VOC-293-A', title: 'A 후보', created_at: '2026-08-01T00:00:00.000Z' };
const peerB = { id: '44444444-4444-4444-8444-444444444444', display_id: 'VOC-293-B', title: 'B 후보', created_at: '2026-08-02T00:00:00.000Z' };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useVocPreSubmitPeers', () => {
  afterEach(() => vi.clearAllMocks());

  test('MS가 바뀌면 이전 후보가 사라지고 새 MS 후보를 표시한다', async () => {
    // `apiClient` resolves a full ApiResponse; the hook only reads `.data`, so
    // the double supplies that field alone and casts through `unknown`.
    mockApiClient.mockImplementation(
      async (_method, path) =>
        ({
          data: path.includes(msA) ? { items: [peerA] } : { items: [peerB] },
        }) as unknown as Awaited<ReturnType<typeof apiClient>>,
    );
    const { result, rerender } = renderHook(({ managedSystemId }) => useVocPreSubmitPeers(managedSystemId), {
      initialProps: { managedSystemId: msA },
      wrapper,
    });
    await waitFor(() => expect(result.current.data?.items).toEqual([peerA]));
    rerender({ managedSystemId: msB });
    await waitFor(() => expect(result.current.data?.items).toEqual([peerB]));
    expect(result.current.data?.items).not.toContainEqual(peerA);
  });

  test('MS가 없으면 요청하지 않는다', () => {
    renderHook(() => useVocPreSubmitPeers(undefined), { wrapper });
    expect(mockApiClient).not.toHaveBeenCalled();
  });
});
