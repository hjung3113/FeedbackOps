import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateFindingFromCluster } from './useCreateFindingFromCluster';

const apiClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient,
}));

describe('useCreateFindingFromCluster', () => {
  beforeEach(() => {
    apiClient.mockReset();
    apiClient.mockResolvedValue({
      data: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    });
  });

  it('invalidates the Findings list after successful creation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const findingsKey = ['findings', { managedSystemId: undefined, execution: undefined }];
    queryClient.setQueryData(findingsKey, { items: [] });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateFindingFromCluster(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        clusterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        body: { title: 'Finding', summary: 'Created from a cluster', severity: 'medium' },
      });
    });

    expect(queryClient.getQueryState(findingsKey)?.isInvalidated).toBe(true);
  });
});
