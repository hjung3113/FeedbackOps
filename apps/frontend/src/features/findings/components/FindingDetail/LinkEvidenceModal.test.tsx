import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkEvidenceModal } from './LinkEvidenceModal';

describe('LinkEvidenceModal copy', () => {
  it('does not show the raw source type value', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LinkEvidenceModal
          findingId="10000000-0000-0000-0000-000000000001"
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/현재 VOC 소스만 연결할 수 있습니다\./)).toBeInTheDocument();
    expect(screen.queryByText(/source_type: voc/)).not.toBeInTheDocument();
  });
});
