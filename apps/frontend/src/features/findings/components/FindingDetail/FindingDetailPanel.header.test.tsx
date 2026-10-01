import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findingDetailState = vi.hoisted(() => ({ state: 'loading' as 'loading' | 'blocked' }));

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: () => ({
    data: undefined,
    isLoading: findingDetailState.state === 'loading',
    isError: findingDetailState.state === 'blocked',
    isSuccess: false,
    isFetching: false,
    error: findingDetailState.state === 'blocked' ? { code: 'permission.denied' } : null,
  }),
}));

vi.mock('@/lib/router/document-title', () => ({
  formatRecordDocumentTitle: vi.fn(),
  useDocumentTitle: vi.fn(),
}));

import { FindingDetailPanel } from './FindingDetailPanel';

describe('FindingDetailPanel header rhythm', () => {
  beforeEach(() => {
    findingDetailState.state = 'loading';
  });

  it.each(['loading', 'blocked'] as const)('uses h-toolbar in the %s state', (state) => {
    findingDetailState.state = state;
    const { container } = render(
      <FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />,
    );

    expect(container.querySelector('.h-toolbar')).toBeInTheDocument();
  });
});
