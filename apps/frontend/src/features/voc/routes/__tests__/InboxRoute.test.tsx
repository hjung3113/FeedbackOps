// InboxRoute.test.tsx — unit tests for useInboxRoute hook (C9 of Slice 3 #20).
//
// Strategy: mount a thin wrapper that calls useInboxRoute() and renders its
// `list` slot. VocDetailPanel and VocList are stubbed to avoid full API setup.
// Asserting:
//   - 3 mocked VocList rows render
//   - clicking a row calls navigate with `selected` URL param
//   - VocDetailPanel is mounted when `selected` is set

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    search?: unknown;
    className?: string;
  }) => (
    <a href={to} data-search={JSON.stringify(search)} className={className}>
      {children}
    </a>
  ),
}));

// ── Stub useVocList ────────────────────────────────────────────────────────────

const MOCK_VOC_ITEMS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    display_id: 'VOC-001',
    title: '피드백 1',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u1',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high' as const,
    reporter_facing_status: 'received' as const,
    triage_state: 'untriaged' as const,
    source_context: 'direct_use' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    display_id: 'VOC-002',
    title: '피드백 2',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u2',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'low' as const,
    reporter_facing_status: 'reviewing' as const,
    triage_state: 'untriaged' as const,
    source_context: 'proxy_report' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    display_id: 'VOC-003',
    title: '피드백 3',
    primary_managed_system_id: 'ms-2',
    analytics_area_id: null,
    reporter_id: 'u3',
    owner_user_id: null,
    owner_team_id: null,
    severity: null,
    reporter_facing_status: 'assigned' as const,
    triage_state: 'triaged' as const,
    source_context: 'stakeholder_request' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
  },
];

vi.mock('../../hooks/useVocList', () => ({
  useVocList: () => ({
    data: { items: MOCK_VOC_ITEMS, next_cursor: undefined },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// ── Stub VocDetailPanel ───────────────────────────────────────────────────────

vi.mock('../../components/detail/VocDetailPanel', () => ({
  VocDetailPanel: ({
    vocId,
    onClose,
  }: {
    vocId: string;
    onClose: () => void;
  }) => (
    <div data-testid="voc-detail-panel-stub" data-voc-id={vocId}>
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  ),
}));

// ── Stub VocList to use real component but mock managed-systems query ─────────

// VocList imports useQuery for managed-systems — stub @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { items: [] } }),
}));

// ── Test harness ──────────────────────────────────────────────────────────────

import { useInboxRoute } from '../InboxRoute';

function InboxTestHarness({ view }: { view: 'inbox' | 'my' }) {
  const { list, detailPanel } = useInboxRoute(view);
  return (
    <div>
      {list}
      {detailPanel}
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useInboxRoute', () => {
  beforeEach(() => {
    searchState = {};
    navigateMock.mockClear();
  });

  it('renders 3 VocList rows for inbox view', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.getByText('피드백 1')).toBeInTheDocument();
      expect(screen.getByText('피드백 2')).toBeInTheDocument();
      expect(screen.getByText('피드백 3')).toBeInTheDocument();
    });
  });

  it('renders 3 VocList rows for my view', async () => {
    searchState = { view: 'my' };
    render(<InboxTestHarness view="my" />);

    await waitFor(() => {
      expect(screen.getByText('피드백 1')).toBeInTheDocument();
      expect(screen.getByText('피드백 2')).toBeInTheDocument();
      expect(screen.getByText('피드백 3')).toBeInTheDocument();
    });
  });

  it('clicking a row calls navigate with selected param', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.getByText('피드백 1')).toBeInTheDocument();
    });

    // VocRow emits click on the row element. Find the first row.
    const row = screen.getAllByRole('row')[0];
    if (row) {
      fireEvent.click(row);
    } else {
      // Fallback: click the title text directly (VocRow may use different role)
      fireEvent.click(screen.getByText('피드백 1'));
    }

    expect(navigateMock).toHaveBeenCalled();
    const callArg = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(callArg.to).toBe('/vocs');
    // The search reducer should return an object containing `selected`
    const result = callArg.search({});
    expect(result).toHaveProperty('selected');
  });

  it('mounts VocDetailPanel when selected is set in URL', async () => {
    searchState = {
      view: 'inbox',
      selected: '00000000-0000-0000-0000-000000000001',
    };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.getByTestId('voc-detail-panel-stub')).toBeInTheDocument();
    });
    expect(screen.getByTestId('voc-detail-panel-stub').getAttribute('data-voc-id')).toBe(
      '00000000-0000-0000-0000-000000000001',
    );
  });

  it('clears VocDetailPanel when selected is not set', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.queryByTestId('voc-detail-panel-stub')).not.toBeInTheDocument();
    });
  });

  it('inbox view renders tab labels', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      // Tab labels mirror the prototype (English): Untriaged / High / Unassigned / Similar / No link.
      expect(screen.getByText('Untriaged')).toBeInTheDocument();
    });
  });

  it('my view renders My VOCs title instead of tabs', async () => {
    searchState = { view: 'my' };
    render(<InboxTestHarness view="my" />);

    await waitFor(() => {
      expect(screen.getByText('My VOCs')).toBeInTheDocument();
    });
  });

  // ── Filter-key round-trip regression (#89) ──────────────────────────────────
  //
  // Bug: the status filter category declared key `filter.reporter_facing_status`
  // while the URL read/write used `filter.reporterStatus`, so the URL key and the
  // ListFilterButton key were two different names bridged by hand-rolled
  // translation. This test pins BOTH directions to the single unified key
  // `filter.reporterStatus`:
  //   (read)  a status value in the URL marks the matching popover option checked
  //   (write) toggling a status option writes back under `filter.reporterStatus`
  describe('status filter-key round-trip', () => {
    it('reads filter.reporterStatus from the URL into the filter popover (checked)', async () => {
      searchState = { view: 'inbox', 'filter.reporterStatus': 'reviewing' };
      render(<InboxTestHarness view="inbox" />);

      // Open the filter popover.
      fireEvent.click(await screen.findByRole('button', { name: /필터/ }));

      // The 검토중 option must be checked because the URL key matches the
      // category key. A mismatch would leave it unchecked.
      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox', { name: '검토중' });
        expect(checkbox).toHaveAttribute('data-state', 'checked');
      });
    });

    it('writes a toggled status filter back under filter.reporterStatus', async () => {
      searchState = { view: 'inbox' };
      render(<InboxTestHarness view="inbox" />);

      fireEvent.click(await screen.findByRole('button', { name: /필터/ }));
      fireEvent.click(await screen.findByRole('checkbox', { name: '접수됨' }));

      expect(navigateMock).toHaveBeenCalled();
      const call = navigateMock.mock.calls.at(-1)?.[0] as {
        to: string;
        search: (prev: Record<string, unknown>) => Record<string, unknown>;
      };
      const result = call.search({});
      // The unified key is present and carries the toggled value.
      expect(result['filter.reporterStatus']).toBe('received');
      // The legacy/long-form key must NOT leak into the URL.
      expect(result).not.toHaveProperty('filter.reporter_facing_status');
    });
  });
});
