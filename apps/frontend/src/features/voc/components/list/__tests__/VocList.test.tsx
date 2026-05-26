import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VocList } from '../VocList';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock @tanstack/react-router Link
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string;
    search?: Record<string, unknown>;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={to} data-search={JSON.stringify(search)} {...rest}>
      {children}
    </a>
  ),
}));

// Mock useManagedSystem via the api call (VocList uses useQuery + fetchManagedSystems)
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    fetchManagedSystems: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'ms-aaa',
          workspace_id: 'ws-1',
          slug: 'tableau',
          name: 'Tableau',
          external_key: null,
          default_owner_actor_id: null,
          default_owner_team_id: null,
          archived_at: null,
          archived_by_actor_id: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 1,
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVoc(overrides: Partial<VocListItem> = {}): VocListItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    display_id: 'VOC-001',
    title: 'Test VOC',
    primary_managed_system_id: 'ms-aaa',
    analytics_area_id: null,
    reporter_id: 'user-1',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high',
    reporter_facing_status: 'received',
    triage_state: 'untriaged',
    source_context: 'direct_use',
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    similar_count: 0,
    attachment_count: 0,
    ...overrides,
  };
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<VocList>', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
  });

  it('shows 10 skeletons when loading with no items', () => {
    render(<VocList items={[]} loading={true} error={null} onSelect={onSelect} />, {
      wrapper: makeWrapper(),
    });
    // Skeletons have role="row" + aria-busy="true"
    const skeletons = screen.getAllByRole('row');
    expect(skeletons).toHaveLength(10);
    expect(skeletons[0]).toHaveAttribute('aria-busy', 'true');
  });

  it('shows inbox empty state with "큐가 비었습니다" for view=inbox', () => {
    render(<VocList items={[]} loading={false} error={null} onSelect={onSelect} view="inbox" />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('큐가 비었습니다')).toBeInTheDocument();
    expect(screen.getByText('제출된 VOC가 표시됩니다.')).toBeInTheDocument();
  });

  it('shows my empty state with "내가 제출한 VOC가 없습니다" for view=my', () => {
    render(<VocList items={[]} loading={false} error={null} onSelect={onSelect} view="my" />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('내가 제출한 VOC가 없습니다')).toBeInTheDocument();
  });

  it('shows "불러오기 실패" error state when error and no items', () => {
    const onRetry = vi.fn();
    render(
      <VocList
        items={[]}
        loading={false}
        error={new Error('fetch failed')}
        onSelect={onSelect}
        onRetry={onRetry}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('불러오기 실패')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('retry button in error state calls onRetry', () => {
    const onRetry = vi.fn();
    render(
      <VocList
        items={[]}
        loading={false}
        error={new Error('fetch failed')}
        onSelect={onSelect}
        onRetry={onRetry}
      />,
      { wrapper: makeWrapper() },
    );
    fireEvent.click(screen.getByText('다시 시도'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders 3 rows for a 3-item list', () => {
    const items = [
      makeVoc({ id: 'id-1', display_id: 'VOC-001', title: 'First VOC' }),
      makeVoc({ id: 'id-2', display_id: 'VOC-002', title: 'Second VOC' }),
      makeVoc({ id: 'id-3', display_id: 'VOC-003', title: 'Third VOC' }),
    ];
    render(
      <VocList items={items} loading={false} error={null} onSelect={onSelect} view="inbox" />,
      { wrapper: makeWrapper() },
    );
    // Rows have role="row" (not aria-busy which skeletons have)
    const rows = screen.getAllByRole('row');
    // Filter to non-skeleton rows (no aria-busy)
    const dataRows = rows.filter((r) => r.getAttribute('aria-busy') !== 'true');
    expect(dataRows).toHaveLength(3);
  });

  it('marks the selected row with aria-selected=true', () => {
    const items = [
      makeVoc({ id: 'id-1', display_id: 'VOC-001', title: 'First VOC' }),
      makeVoc({ id: 'id-2', display_id: 'VOC-002', title: 'Second VOC' }),
    ];
    render(
      <VocList items={items} loading={false} error={null} selectedId="id-1" onSelect={onSelect} />,
      { wrapper: makeWrapper() },
    );
    const rows = screen.getAllByRole('row');
    const dataRows = rows.filter((r) => r.getAttribute('aria-busy') !== 'true');
    expect(dataRows[0]).toHaveAttribute('aria-selected', 'true');
    expect(dataRows[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect with the voc id when a row is clicked', () => {
    const items = [makeVoc({ id: 'id-1', display_id: 'VOC-001', title: 'Clickable VOC' })];
    render(<VocList items={items} loading={false} error={null} onSelect={onSelect} />, {
      wrapper: makeWrapper(),
    });
    const rows = screen.getAllByRole('row');
    const dataRows = rows.filter((r) => r.getAttribute('aria-busy') !== 'true');
    fireEvent.click(dataRows[0]!);
    expect(onSelect).toHaveBeenCalledWith('id-1');
  });

  it('checking a row checkbox reveals the bulk-action bar and does NOT open the row', () => {
    const items = [
      makeVoc({ id: 'id-1', display_id: 'VOC-001', title: 'First VOC' }),
      makeVoc({ id: 'id-2', display_id: 'VOC-002', title: 'Second VOC' }),
    ];
    render(
      <VocList items={items} loading={false} error={null} onSelect={onSelect} view="inbox" />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole('toolbar', { name: '일괄 작업' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('VOC-001 선택'));

    expect(screen.getByRole('toolbar', { name: '일괄 작업' })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    // Clicking the checkbox must not open the detail panel.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Clear button empties the selection and hides the bar', () => {
    const items = [makeVoc({ id: 'id-1', display_id: 'VOC-001', title: 'First VOC' })];
    render(
      <VocList items={items} loading={false} error={null} onSelect={onSelect} view="inbox" />,
      { wrapper: makeWrapper() },
    );
    fireEvent.click(screen.getByLabelText('VOC-001 선택'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('toolbar', { name: '일괄 작업' })).not.toBeInTheDocument();
  });
});
