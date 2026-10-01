import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddEvidenceModal } from './AddEvidenceModal';

describe('AddEvidenceModal source kind options', () => {
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
});
