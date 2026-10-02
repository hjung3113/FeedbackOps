import { ApiError } from '@/lib/api';
import { listVocClustersResponseSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IDS,
  draftNoFinding,
  emptyList,
  populatedList,
} from '../../../../../tests/visual/fixtures/voc-clusters';
import { VocClusterListShell } from './VocClusterListShell';

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: apiRequestMock,
}));

function renderClusterList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: () => 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <VocClusterListShell
        selectedId={null}
        onSelect={() => undefined}
        onCloseDetail={() => undefined}
        managedSystemId={IDS.managedSystem}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('VocClusterListShell list states (#609)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it.each(['empty', 'filtered', 'error'] as const)(
    'shows the %s state and recovers from retryable or filtered reads',
    async (state) => {
      const user = userEvent.setup();
      if (state === 'empty') {
        apiRequestMock.mockResolvedValue({ data: emptyList });
      } else if (state === 'filtered') {
        apiRequestMock.mockResolvedValue({
          data: listVocClustersResponseSchema.parse({ items: [draftNoFinding] }),
        });
      } else {
        apiRequestMock
          .mockRejectedValueOnce(new Error('temporary read failure'))
          .mockRejectedValueOnce(new Error('temporary read failure'))
          .mockResolvedValueOnce({ data: populatedList });
      }

      renderClusterList();

      if (state === 'empty') {
        expect(await screen.findByTestId('list-state-message')).toHaveAttribute(
          'data-variant',
          'empty',
        );
        expect(screen.getByText('생성된 VOC Cluster가 없습니다.')).toBeInTheDocument();
        expect(
          screen.getByText('VOC를 묶어 만든 Cluster가 여기에 표시됩니다.'),
        ).toBeInTheDocument();
        return;
      }

      if (state === 'filtered') {
        await screen.findByText(draftNoFinding.title);
        await user.click(screen.getByRole('tab', { name: /^확정/ }));
        expect(await screen.findByTestId('list-state-message')).toHaveAttribute(
          'data-variant',
          'filtered',
        );
        expect(screen.getByText('이 필터에 해당하는 Cluster가 없습니다')).toBeInTheDocument();
        expect(screen.getByText('선택한 조건: 확정')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '필터 초기화' }));
        expect(await screen.findByText(draftNoFinding.title)).toBeInTheDocument();
        expect(
          apiRequestMock.mock.calls.every(([, path]) =>
            String(path).includes(`managed_system_id=${IDS.managedSystem}`),
          ),
        ).toBe(true);
        return;
      }

      expect(
        await screen.findByTestId('list-state-message', {}, { timeout: 5000 }),
      ).toHaveAttribute('data-variant', 'error');
      expect(screen.getByText('VOC Cluster 목록을 불러오지 못했습니다')).toBeInTheDocument();
      expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '다시 시도' }));
      expect(await screen.findByText(draftNoFinding.title)).toBeInTheDocument();
    },
  );

  it('keeps permission denials on the blocked panel path', async () => {
    const denied = new ApiError(403, {
      code: 'permission.denied',
      message: 'voc_cluster.read required',
    });
    apiRequestMock.mockRejectedValueOnce(denied).mockRejectedValueOnce(denied);

    renderClusterList();

    expect(
      await screen.findByText(
        'VOC Cluster 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('VOC Cluster')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Cluster 필터' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/전체 0|확정 0|Finding 없음 0/)).not.toBeInTheDocument();
    expect(screen.queryByText('0개')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-state-message')).not.toBeInTheDocument();
  });
});

// #706 — tab counts are unknown until the list read succeeds; unknown must
// never render as 0.
describe('VocClusterListShell tab counts (#706)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it.each(['pending', 'failed', 'empty', 'populated'] as const)(
    'shows tab counts only after the list read succeeds (%s)',
    async (state) => {
      if (state === 'pending') {
        // Never resolves: pins the read in its pending state. (The tsconfig
        // lib predates Promise.withResolvers, and no resolver is needed.)
        apiRequestMock.mockReturnValue(new Promise(() => undefined));
      } else if (state === 'failed') {
        apiRequestMock.mockRejectedValue(new Error('temporary read failure'));
      } else if (state === 'empty') {
        apiRequestMock.mockResolvedValue({ data: emptyList });
      } else {
        apiRequestMock.mockResolvedValue({ data: populatedList });
      }

      renderClusterList();

      if (state === 'pending') {
        expect(screen.getByTestId('cluster-list-skeleton')).toBeInTheDocument();
      } else if (state === 'failed') {
        expect(
          await screen.findByTestId('list-state-message', {}, { timeout: 5000 }),
        ).toHaveAttribute('data-variant', 'error');
      } else if (state === 'empty') {
        expect(await screen.findByTestId('cluster-empty-state')).toBeInTheDocument();
      } else {
        expect(await screen.findByText(draftNoFinding.title)).toBeInTheDocument();
      }

      if (state === 'pending' || state === 'failed') {
        expect(screen.getByRole('tab', { name: '전체' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '확정' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Finding 없음' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^전체 \d+$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^확정 \d+$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^Finding 없음 \d+$/ })).not.toBeInTheDocument();
        return;
      }
      if (state === 'empty') {
        expect(screen.getByRole('tab', { name: '전체 0' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '확정 0' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Finding 없음 0' })).toBeInTheDocument();
        return;
      }
      expect(screen.getByRole('tab', { name: '전체 3' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: '확정 2' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Finding 없음 2' })).toBeInTheDocument();
    },
  );

  it('recovers from a failed read through a no-data refetch to real zero counts', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockRejectedValueOnce(new Error('temporary read failure'));
    let releaseRead: (() => void) | undefined;
    apiRequestMock.mockReturnValueOnce(
      new Promise<{ data: typeof emptyList }>((resolve) => {
        releaseRead = () => resolve({ data: emptyList });
      }),
    );

    renderClusterList();

    expect(await screen.findByTestId('list-state-message', {}, { timeout: 5000 })).toHaveAttribute(
      'data-variant',
      'error',
    );
    expect(screen.queryByRole('tab', { name: /^전체 \d+$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    // Post-error refetch resets to pending with no data: the skeleton replaces
    // the error view and the counts stay absent while it is unresolved.
    expect(await screen.findByTestId('cluster-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('list-state-message')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^전체 \d+$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^확정 \d+$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Finding 없음 \d+$/ })).not.toBeInTheDocument();

    await act(async () => {
      releaseRead?.();
    });

    expect(await screen.findByRole('tab', { name: '전체 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '확정 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Finding 없음 0' })).toBeInTheDocument();
  });
});
