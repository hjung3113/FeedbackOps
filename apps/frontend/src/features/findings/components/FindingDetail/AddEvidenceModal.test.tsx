import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const evidenceMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
}));

vi.mock('../../hooks/useEvidenceMutations', () => ({
  useAddEvidenceHighlightMutation: () => evidenceMutation,
}));

import { AddEvidenceModal } from './AddEvidenceModal';

describe('AddEvidenceModal source kind options', () => {
  beforeEach(() => {
    evidenceMutation.mutate.mockClear();
    evidenceMutation.reset.mockClear();
  });

  it('labels every evidence source kind from the shared copy map', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddEvidenceModal findingId="10000000-0000-0000-0000-000000000001" open onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('evidence-source-type-select'));

    expect(await screen.findByRole('option', { name: 'Manual note' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'VOC' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Survey' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Note (manual)' })).not.toBeInTheDocument();
  });

  it.each(['VOC', 'Survey'] as const)(
    'shows Korean validation when %s has no source ID and prevents submission',
    async (sourceLabel) => {
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AddEvidenceModal
            findingId="10000000-0000-0000-0000-000000000001"
            open
            onClose={vi.fn()}
          />
        </QueryClientProvider>,
      );

      fireEvent.click(screen.getByTestId('evidence-source-type-select'));
      fireEvent.click(await screen.findByRole('option', { name: sourceLabel }));
      await user.type(screen.getByTestId('evidence-quote-input'), '로그인 실패 요약');

      await user.click(screen.getByTestId('add-evidence-submit'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'VOC 또는 Survey 출처를 선택하면 ID가 필요합니다.',
      );
      expect(screen.getByRole('alert')).not.toHaveTextContent(
        'source_id is required unless source_type is note',
      );

      expect(evidenceMutation.mutate).not.toHaveBeenCalled();
    },
  );
});
