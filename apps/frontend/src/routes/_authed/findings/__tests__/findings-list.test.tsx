import { ApiError } from '@/lib/api/types';
import {
  FINDING_CONFIDENCE_LABELS,
  FINDING_SEVERITY_LABELS,
  FINDING_STATUS_LABELS,
} from '@/lib/copy/enum-labels';
import {
  type FindingDto,
  findingConfidenceSchema,
  findingSeveritySchema,
  findingStatusSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Route as FindingDeepLinkRoute } from '../$findingId';
import { FindingsListPage, findingsSearchSchema } from '../index';

vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
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
    PermissionBlockedPanel: ({
      state,
      category,
      reason,
    }: {
      state: string;
      category: string;
      reason?: string;
    }) => (
      <div data-testid="permission-blocked" data-state={state}>
        {category}
        {reason !== undefined ? <p>{reason}</p> : null}
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
  };
});

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

vi.mock('@/features/findings/hooks/useFindingsList', () => ({
  useFindingsList: useFindingsListMock,
}));

vi.mock('@/features/findings/components/FindingDetail', () => ({
  FindingDetailPanel: ({ findingId }: { findingId: string }) => (
    <section data-testid="finding-detail-panel">finding:{findingId}</section>
  ),
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
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

  // Selection lives in the router search (?selected=:findingId), so the page
  // mounts inside a real memory-history router with the route's own search
  // schema (same harness as the reference URL-state tests).
  async function renderFindingsPage(initialPath = '/findings') {
    const findingBeforeLoad = FindingDeepLinkRoute.options.beforeLoad;
    const findingValidateSearch = FindingDeepLinkRoute.options.validateSearch;
    if (!findingBeforeLoad) throw new Error('Finding deep-link route must register beforeLoad');
    if (!findingValidateSearch) throw new Error('Finding deep-link route must validate search');

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const route = createRoute({
      getParentRoute: () => rootRoute,
      path: '/findings',
      validateSearch: (raw) => findingsSearchSchema.parse(raw),
      component: FindingsListPage,
    });
    const deepLinkRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/findings/$findingId',
      validateSearch: findingValidateSearch,
      // The isolated harness has a different root context; it exercises the real route handler.
      beforeLoad: (context) => findingBeforeLoad(context as never),
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([route, deepLinkRoute]),
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    });
    // Router matches load asynchronously; load first so the page is painted
    // synchronously and the existing sync assertions below stay untouched.
    await router.load();
    const view = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    return { ...view, router };
  }

  async function renderFindingRow(overrides: Partial<FindingDto> = {}) {
    const finding = { ...findings[0], ...overrides } as FindingDto;
    useFindingsListMock.mockReturnValue({
      data: { items: [finding] },
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
    });
    await renderFindingsPage();
    return screen.getByTestId(`finding-row-${finding.display_id}`);
  }

  it('renders finding rows from the list hook', async () => {
    await renderFindingsPage();

    expect(screen.getByText('Findings')).toBeInTheDocument();
    expect(screen.getByTestId('finding-row-FND-101')).toHaveTextContent('결제 실패 반복');
    expect(screen.getByTestId('finding-row-FND-102')).toHaveTextContent('배송 지연 문의 증가');
  });

  it('renders the selected finding in the detail panel', async () => {
    await renderFindingsPage();
    fireEvent.click(screen.getByTestId('finding-row-FND-101'));

    // Selection is a router navigation now (?selected=…), which lands async.
    await waitFor(() =>
      expect(screen.getByTestId('finding-detail-panel')).toHaveTextContent(
        'finding:11111111-1111-1111-1111-111111111111',
      ),
    );
    expect(screen.getByTestId('finding-row-FND-101')).toHaveAttribute('data-selected', 'true');
  });

  it('redirects a direct Finding URL to the selected list panel and preserves returnTo', async () => {
    const findingId = '11111111-1111-1111-1111-111111111111';
    const returnTo = '/vocs?view=inbox&selected=22222222-2222-2222-2222-222222222222';
    const { router } = await renderFindingsPage(
      `/findings/${findingId}?returnTo=${encodeURIComponent(returnTo)}`,
    );

    expect(await screen.findByTestId('finding-detail-panel')).toHaveTextContent(
      `finding:${findingId}`,
    );
    expect(router.state.location.pathname).toBe('/findings');
    expect(router.state.location.search).toEqual({ selected: findingId, returnTo });
  });

  it('redirects a direct Finding URL without returnTo to the selected list panel', async () => {
    const findingId = findings[0]?.id;
    if (!findingId) throw new Error('The selected Finding fixture must exist');
    const { router } = await renderFindingsPage(`/findings/${findingId}`);

    expect(await screen.findByTestId('finding-detail-panel')).toHaveTextContent(
      `finding:${findingId}`,
    );
    expect(router.state.location.pathname).toBe('/findings');
    expect(router.state.location.search).toEqual({ selected: findingId });
  });

  it('keeps a deep-linked Finding selected while the cached list is refetching', async () => {
    const findingId = '55555555-5555-4555-8555-555555555555';
    useFindingsListMock.mockReturnValue({
      data: { items: [] },
      isPending: false,
      isError: false,
      isSuccess: true,
      isFetching: true,
      error: null,
    });

    const { router } = await renderFindingsPage(`/findings/${findingId}`);

    expect(await screen.findByTestId('finding-detail-panel')).toHaveTextContent(
      `finding:${findingId}`,
    );
    expect(router.state.location.search).toEqual({ selected: findingId });
  });

  it('renders severity, confidence, and owner enrichment in finding rows', async () => {
    await renderFindingsPage();

    const richRow = screen.getByTestId('finding-row-FND-101');
    expect(richRow.querySelector('[data-token="--severity-high"]')).toBeInTheDocument();
    expect(screen.getByTestId('finding-confidence-badge-FND-101')).toHaveTextContent(
      '신뢰도 · 중간',
    );
    expect(within(richRow).getByTestId('owner-avatar-박서연')).toHaveAttribute('data-size', 'sm');

    const nullConfidenceRow = screen.getByTestId('finding-row-FND-102');
    expect(nullConfidenceRow.querySelector('[data-token="--severity-medium"]')).toBeInTheDocument();
    expect(screen.queryByTestId('finding-confidence-badge-FND-102')).not.toBeInTheDocument();
  });

  it.each(findingStatusSchema.options)(
    'renders Finding status %s with its shared label',
    async (status) => {
      const row = await renderFindingRow({ status });
      const badge = within(row).getByTestId(`finding-status-badge-${status}`);

      expect(badge.textContent).toBe(FINDING_STATUS_LABELS[status]);
    },
  );

  it.each(findingSeveritySchema.options)(
    'renders Finding severity %s with its shared label',
    async (severity) => {
      const row = await renderFindingRow({ severity });
      const label = within(row).getByText(FINDING_SEVERITY_LABELS[severity]);

      expect(label.textContent).toBe(FINDING_SEVERITY_LABELS[severity]);
    },
  );

  it('renders medium Finding severity as "중간" in the list row', async () => {
    const row = await renderFindingRow({ severity: 'medium' });

    expect(within(row).getByText('중간')).toBeInTheDocument();
  });

  it.each(findingConfidenceSchema.options)(
    'renders Finding confidence %s with its shared label',
    async (confidence) => {
      const row = await renderFindingRow({ confidence });
      const badge = within(row).getByTestId('finding-confidence-badge-FND-101');

      expect(badge).toHaveTextContent(`신뢰도 · ${FINDING_CONFIDENCE_LABELS[confidence]}`);
      expect(badge).not.toHaveTextContent(/Confidence/);
    },
  );

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
    await renderFindingsPage();

    expect(screen.getByTestId('permission-blocked')).toHaveAttribute('data-state', 'denied');
    expect(
      screen.getByText(
        'Finding 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('finding.read capability required')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finding-list-error')).not.toBeInTheDocument();
    expect(screen.queryByText('0개')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finding-detail-empty-state')).not.toBeInTheDocument();
  });

  it('keeps a non-permission failure as the existing failed-load state', async () => {
    useFindingsListMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    });
    await renderFindingsPage();

    expect(screen.getByTestId('finding-list-error')).toHaveTextContent(
      'Finding 목록을 불러오지 못했습니다',
    );
    expect(screen.getByTestId('finding-list-error')).toHaveTextContent('잠시 후 다시 시도하세요.');
    expect(screen.queryByTestId('permission-blocked')).not.toBeInTheDocument();
    expect(screen.queryByText('0개')).not.toBeInTheDocument();
  });
});
