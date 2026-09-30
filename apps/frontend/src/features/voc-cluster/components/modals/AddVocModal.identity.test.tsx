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
  mutate: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/features/voc-cluster/hooks/useAddClusterMember', () => ({
  useAddClusterMember: () => ({
    mutate: modalState.mutate,
    reset: modalState.reset,
    isPending: false,
  }),
}));

vi.mock('@/features/voc-cluster/hooks/useCandidatePeers', () => ({
  useCandidatePeers: () => ({
    data: { candidates: modalState.candidates },
    isLoading: false,
    isError: false,
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
  });

  it('shows the VOC label and muted id fragment in a candidate button tall enough for both lines', () => {
    render(<AddVocModal open clusterId="cluster-1" members={[]} onClose={() => undefined} />);

    const candidate = screen.getByTestId(`add-voc-candidate-${candidateId}`);
    expect(screen.getByText('VOC · 결제 실패 · high · received')).toBeInTheDocument();
    expect(screen.getByText('60000000')).toHaveClass('font-mono', 'text-xs', 'text-text-muted');
    expect(candidate).toHaveClass('h-auto', 'min-h-8', 'py-1');
  });
});
