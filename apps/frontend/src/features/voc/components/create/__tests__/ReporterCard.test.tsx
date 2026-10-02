import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReporterCard } from '../ReporterCard';

// Mock useMe so ReporterCard does not need QueryClientProvider
vi.mock('@/lib/auth/useMe', () => ({
  useMe: vi.fn(),
}));

import { useMe } from '@/lib/auth/useMe';
import type { MeResponse } from '@/lib/auth/useMe';
import type { UseQueryResult } from '@tanstack/react-query';

const MOCK_ME: MeResponse = {
  actor: {
    id: '00000000-0000-0000-0000-000000000001',
    external_id: 'reporter-1',
    email: 'reporter@feedbackops.local',
    display_name: '김호중',
    role_level: 'user',
  },
  workspace_id: '11111111-1111-1111-1111-111111111111',
};

function makeQuery(
  overrides: Partial<UseQueryResult<MeResponse>> = {},
): UseQueryResult<MeResponse> {
  return {
    data: MOCK_ME,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    isStale: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isInitialLoading: false,
    isPaused: false,
    refetch: vi.fn() as UseQueryResult<MeResponse>['refetch'],
    ...overrides,
  } as UseQueryResult<MeResponse>;
}

describe('<ReporterCard>', () => {
  it.each([
    ['admin', 'Admin'],
    ['developer', 'Developer'],
    ['user', 'User'],
  ] as const)('renders the canonical role label for %s', (role_level, label) => {
    vi.mocked(useMe).mockReturnValue(
      makeQuery({
        data: {
          ...MOCK_ME,
          actor: { ...MOCK_ME.actor, role_level },
        },
      }),
    );
    render(<ReporterCard />);
    expect(screen.getByText('김호중')).toBeInTheDocument();
    expect(screen.getByText(`역할: ${label}`)).toBeInTheDocument();
    expect(screen.queryByText(role_level, { exact: true })).not.toBeInTheDocument();
  });

  it('does NOT render the workspace UUID', () => {
    vi.mocked(useMe).mockReturnValue(makeQuery());
    render(<ReporterCard />);
    expect(screen.queryByText('11111111-1111-1111-1111-111111111111')).not.toBeInTheDocument();
  });

  it('renders a skeleton while loading', () => {
    vi.mocked(useMe).mockReturnValue(
      makeQuery({
        isLoading: true,
        isPending: true,
        isSuccess: false,
        status: 'pending',
        data: undefined,
      }),
    );
    const { container } = render(<ReporterCard />);
    // Skeleton uses animate-pulse class
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByText('김호중')).not.toBeInTheDocument();
  });

  it('renders nothing on error', () => {
    vi.mocked(useMe).mockReturnValue(
      makeQuery({
        isError: true,
        isSuccess: false,
        isLoading: false,
        isPending: false,
        status: 'error',
        error: new Error('auth'),
        data: undefined,
      }),
    );
    const { container } = render(<ReporterCard />);
    expect(container.firstChild).toBeNull();
  });
});
