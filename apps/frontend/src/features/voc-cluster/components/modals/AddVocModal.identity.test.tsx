import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const modalState = vi.hoisted(() => ({
  candidates: [] as Array<{
    voc_id: string;
    display_id: string | null;
    title: string;
    severity: string | null;
    reporter_facing_status: string;
  }>,
  mutateAsync: vi.fn(),
  data: undefined as undefined | { pages: Array<{ candidates: unknown[]; page: object }> },
}));

vi.mock('@/features/voc-cluster/hooks/useAddClusterMember', () => ({
  useAddClusterMember: () => ({ mutateAsync: modalState.mutateAsync, isPending: false }),
}));

vi.mock('@/features/voc-cluster/hooks/useCandidatePeers', () => ({
  useCandidatePeers: () => ({
    data: modalState.data,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
  }),
}));

import { AddVocModal } from './AddVocModal.js';

const candidateId = '60000000-0000-0000-0000-000000000006';

describe('AddVocModal candidate identity', () => {
  beforeEach(() => {
    modalState.candidates = [
      {
        voc_id: candidateId,
        display_id: null,
        title: '결제 실패',
        severity: 'high',
        reporter_facing_status: 'received',
      },
    ];
    // react-query hands back a stable data object; the mock must too.
    modalState.data = { pages: [{ candidates: modalState.candidates, page: { has_more: false } }] };
  });

  it('shows the VOC label with translated severity/status and a muted id fragment', () => {
    render(<AddVocModal open clusterId="cluster-1" onClose={() => undefined} />);

    expect(screen.getByText('VOC · 결제 실패 · 높음 · 접수됨')).toBeInTheDocument();
    expect(screen.getByText('60000000')).toHaveClass('font-mono', 'text-xs', 'text-text-muted');
    expect(screen.getByRole('button', { name: 'VOC 추가' })).toBeInTheDocument();
  });
});
