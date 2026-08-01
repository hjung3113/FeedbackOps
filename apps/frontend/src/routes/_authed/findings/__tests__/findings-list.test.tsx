import { ApiError } from '@/lib/api/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock('@fops/ui', () => ({
  ListShell: ({
    toolbar,
    list,
    detailPanel,
  }: {
    toolbar?: { title: string; subtitle?: string; actions?: React.ReactNode };
    list: React.ReactNode;
    detailPanel?: React.ReactNode;
  }) => (
    <div data-shell="list">
      {toolbar && (
        <header data-testid="list-shell-toolbar">
          <h1>{toolbar.title}</h1>
          {toolbar.subtitle && <p>{toolbar.subtitle}</p>}
          <div>{toolbar.actions}</div>
        </header>
      )}
      <main>{list}</main>
      <aside data-testid="list-shell-detail-slot">{detailPanel}</aside>
    </div>
  ),
  ObjectRow: ({
    id,
    title,
    badges,
    meta,
    trailing,
    severity,
    selected,
    onClick,
  }: {
    id?: string;
    title: React.ReactNode;
    badges?: React.ReactNode;
    meta?: React.ReactNode;
    trailing?: React.ReactNode;
    severity?: string;
    selected?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button
      type="button"
      data-testid={`finding-row-${id}`}
      data-selected={selected ? 'true' : 'false'}
      onClick={onClick}
    >
      {severity ? <span data-token={`--severity-${severity}`} /> : null}
      <span>{id}</span>
      <span>{title}</span>
      <span>{badges}</span>
      <span>{meta}</span>
      <span>{trailing}</span>
    </button>
  ),
  OutlineBadge: ({ children, ...props }: { children: React.ReactNode }) => (
    <span {...props}>{children}</span>
  ),
  PermissionBlockedPanel: ({ state, category }: { state: string; category: string }) => (
    <div data-testid="permission-blocked" data-state={state}>
      {category}
    </div>
  ),
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  UserAvatar: ({
    user,
    size,
  }: {
    user: { display_name: string };
    size?: 'sm' | 'md' | 'lg';
  }) => (
    <span data-size={size} data-testid={`owner-avatar-${user.display_name}`}>
      {user.display_name}
    </span>
  ),
}));

const findings = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    display_id: 'FND-101',
    primary_managed_system_id: '99999999-9999-9999-9999-999999999999',
    title: '결제 실패 반복',
    summary: '결제 실패 VOC가 반복됩니다.',
    source_type: 'voc_cluster' as const,
    source_id: '22222222-2222-2222-2222-222222222222',
    evidence_count: 3,
    severity: 'high' as const,
    confidence: 'medium' as const,
    status: 'active' as const,
    analytics_area_id: null,
    linked_task_id: null,
    linked_milestone_id: null,
    created_by: '33333333-3333-3333-3333-333333333333',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    source: null,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    display_id: 'FND-102',
    primary_managed_system_id: '99999999-9999-9999-9999-999999999999',
    title: '배송 지연 문의 증가',
    summary: '배송 지연 문의가 증가했습니다.',
    source_type: 'manual' as const,
    source_id: null,
    evidence_count: 1,
    severity: 'medium' as const,
    confidence: null,
    status: 'draft' as const,
    analytics_area_id: null,
    linked_task_id: null,
    linked_milestone_id: null,
    created_by: '33333333-3333-3333-3333-333333333333',
    created_at: '2026-01-03T00:00:00.000Z',
    updated_at: '2026-01-04T00:00:00.000Z',
    source: null,
  },
];

const useFindingsListMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/integration/hooks/useFindingsList', () => ({
  useFindingsList: useFindingsListMock,
}));

vi.mock('@/features/integration/components/FindingDetail', () => ({
  FindingDetailPanel: ({ findingId }: { findingId: string }) => (
    <section data-testid="finding-detail-panel">finding:{findingId}</section>
  ),
}));

vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        display_name: '박서연',
        kind: 'user',
      },
    ],
  }),
}));

describe('FindingsListPage', () => {
  beforeEach(() => {
    useFindingsListMock.mockReturnValue({
      data: { items: findings },
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    });
  });

  it('renders finding rows from the list hook', async () => {
    const { FindingsListPage } = await import('../index');

    render(<FindingsListPage />);

    expect(screen.getByText('Findings')).toBeInTheDocument();
    expect(screen.getByTestId('finding-row-FND-101')).toHaveTextContent('결제 실패 반복');
    expect(screen.getByTestId('finding-row-FND-102')).toHaveTextContent('배송 지연 문의 증가');
  });

  it('renders the selected finding in the detail panel', async () => {
    const { FindingsListPage } = await import('../index');

    render(<FindingsListPage />);
    fireEvent.click(screen.getByTestId('finding-row-FND-101'));

    expect(screen.getByTestId('finding-detail-panel')).toHaveTextContent(
      'finding:11111111-1111-1111-1111-111111111111',
    );
    expect(screen.getByTestId('finding-row-FND-101')).toHaveAttribute('data-selected', 'true');
  });

  it('renders severity, confidence, and owner enrichment in finding rows', async () => {
    const { FindingsListPage } = await import('../index');

    render(<FindingsListPage />);

    const richRow = screen.getByTestId('finding-row-FND-101');
    expect(richRow.querySelector('[data-token="--severity-high"]')).toBeInTheDocument();
    expect(screen.getByTestId('finding-confidence-badge-FND-101')).toHaveTextContent(
      'Confidence · 중간',
    );
    expect(within(richRow).getByTestId('owner-avatar-박서연')).toHaveAttribute('data-size', 'sm');

    const nullConfidenceRow = screen.getByTestId('finding-row-FND-102');
    expect(nullConfidenceRow.querySelector('[data-token="--severity-medium"]')).toBeInTheDocument();
    expect(screen.queryByTestId('finding-confidence-badge-FND-102')).not.toBeInTheDocument();
  });

  it('renders permission denied without the failed-load copy or an authoritative count', async () => {
    useFindingsListMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(403, {
        code: 'permission.denied',
        message: 'finding.read capability required',
      }),
    });
    const { FindingsListPage } = await import('../index');

    render(<FindingsListPage />);

    expect(screen.getByTestId('permission-blocked')).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByTestId('finding-list-error')).not.toBeInTheDocument();
    expect(screen.queryByText('0개')).not.toBeInTheDocument();
  });

  it('keeps a non-permission failure as the existing failed-load state', async () => {
    useFindingsListMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    });
    const { FindingsListPage } = await import('../index');

    render(<FindingsListPage />);

    expect(screen.getByTestId('finding-list-error')).toHaveTextContent(
      '데이터를 불러오지 못했습니다.',
    );
    expect(screen.queryByTestId('permission-blocked')).not.toBeInTheDocument();
    expect(screen.queryByText('0개')).not.toBeInTheDocument();
  });
});
