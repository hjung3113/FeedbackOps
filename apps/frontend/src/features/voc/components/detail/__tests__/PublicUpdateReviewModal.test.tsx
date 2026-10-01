import type { VocDetailEnvelope } from '@fops/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicUpdateReviewModal } from '../PublicUpdateReviewModal';

const reviewHooks = vi.hoisted(() => ({
  candidates: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@/features/voc/hooks/usePublicUpdateReviewCandidates', () => ({
  usePublicUpdateReviewCandidates: reviewHooks.candidates,
  useResolvePublicUpdateReviewCandidate: () => ({
    mutate: reviewHooks.mutate,
    isPending: false,
  }),
}));

const candidate = {
  id: 'candidate-1',
  created_at: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  reviewHooks.candidates.mockReset().mockReturnValue({
    data: { items: [candidate] },
    isLoading: false,
  });
  reviewHooks.mutate.mockReset();
});

describe('PublicUpdateReviewModal shared pickers', () => {
  it('submits the selected candidate and reporter status with the same public update body', async () => {
    render(
      <PublicUpdateReviewModal
        voc={{ id: 'voc-1' } as VocDetailEnvelope}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '취소' })).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );

    fireEvent.click(screen.getByRole('combobox', { name: '후보' }));
    fireEvent.click(await screen.findByRole('option', { name: /Released Task 후보/ }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Reporter-facing status' }));
    fireEvent.click(await screen.findByRole('option', { name: '해결됨' }));
    fireEvent.change(screen.getByRole('textbox', { name: '공개 업데이트' }), {
      target: { value: '작업 완료 내용을 공유합니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply public update' }));

    expect(reviewHooks.mutate.mock.calls[0]?.[0]).toEqual({
      action: 'apply',
      candidate_id: candidate.id,
      public_update: {
        skip_public_update: false,
        body_rich_content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '작업 완료 내용을 공유합니다.' }],
            },
          ],
        },
        next_reporter_facing_status: 'resolved',
      },
    });
  });

  it('shows candidate read errors with retry instead of the empty state', () => {
    const refetch = vi.fn();
    reviewHooks.candidates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('candidate read failed'),
      refetch,
    });

    render(
      <PublicUpdateReviewModal
        voc={{ id: 'voc-1' } as VocDetailEnvelope}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.queryByText('검토할 후보가 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '후보' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty candidate state without review fields or an error', () => {
    reviewHooks.candidates.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
    });

    render(
      <PublicUpdateReviewModal
        voc={{ id: 'voc-1' } as VocDetailEnvelope}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('검토할 후보가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('후보 목록을 불러오지 못했습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '후보' })).not.toBeInTheDocument();
  });
});
