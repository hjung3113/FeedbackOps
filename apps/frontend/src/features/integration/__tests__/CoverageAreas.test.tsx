import { AuthedLayout } from '@/routes/_authed';
import { validateIntegrationCoverageSearch } from '@/routes/_authed/integration/coverage';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import { areaReportLink, dashboardAreaReportQuerySchema, listTasksQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { areaReportFixture } from '../../../../tests/visual/fixtures/area-report';
import {
  COVERAGE_IDS as IDS,
  coverageAnalyticsAreasFixture,
  coverageEmptySummaryFixture,
  coverageManagedSystemsFixture,
} from '../../../../tests/visual/fixtures/coverage';
import { CoverageRoute } from '../routes/CoverageRoute';
const requests: URL[] = [];
let catalogResponse: ((url: URL) => Response) | undefined;
let reportResponse: (url: URL) => Response | Promise<Response>;
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  requests.length = 0;
  catalogResponse = undefined;
});
async function mount(
  path = '/integration/coverage',
  layout = false,
  initialReport = areaReportFixture,
  identity?: Promise<Response>,
) {
  reportResponse = () => json(initialReport);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = new URL(input, 'http://localhost');
      requests.push(url);
      if (url.pathname === '/dashboard/analytics-areas') {
        dashboardAreaReportQuerySchema.parse(Object.fromEntries(url.searchParams));
        expect(url.searchParams.has('limit')).toBe(false);
        return reportResponse(url);
      }
      if (url.pathname === '/dashboard/summary') return json(coverageEmptySummaryFixture);
      if (url.pathname === '/managed-systems') return json(coverageManagedSystemsFixture);
      if (url.pathname === '/analytics-areas')
        return catalogResponse?.(url) ?? json(coverageAnalyticsAreasFixture);
      if (url.pathname === '/nav/counts') return json({ counts: {} });
      if (url.pathname === '/tasks') {
        listTasksQuerySchema.parse(Object.fromEntries(url.searchParams));
        return json({ items: [], total: 0, page: { has_more: false } });
      }
      if (url.pathname === '/actors' || url.pathname === '/teams')
        return json({ items: [], total: 0 });
      if (url.pathname === '/me/permissions/check')
        return json({ state: 'approved', decision: { allow: true } });
      if (url.pathname === '/me')
        return (
          identity ??
          json({
            workspace_id: IDS.workspace,
            actor: {
              id: IDS.systemB,
              role_level: 'admin',
              email: 'a@example.test',
              external_id: 'a',
              display_name: 'A',
            },
          })
        );
      return json({ code: 'internal.unexpected', message: input }, 500);
    }),
  );
  const root = createRootRoute({ component: Outlet });
  const parent = layout
    ? createRoute({ getParentRoute: () => root, id: '_authed', component: AuthedLayout })
    : root;
  const route = createRoute({
    getParentRoute: () => parent,
    path: '/integration/coverage',
    validateSearch: validateIntegrationCoverageSearch,
    component: CoverageRoute,
  });
  const tasks = createRoute({
    getParentRoute: () => parent,
    path: '/tasks',
    validateSearch: validateTasksSearch,
    component: () => <TasksRouteView search={tasks.useSearch()} />,
  });
  const tree = layout
    ? root.addChildren([parent.addChildren([route, tasks])])
    : root.addChildren([route, tasks]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByTestId('integration-coverage');
  return { router, qc };
}
it('requests only on tab entry, restores URL paging and filters with history, and drops them on exit', async () => {
  const { router } = await mount();
  expect(requests.filter((url) => url.pathname === '/dashboard/analytics-areas')).toHaveLength(0);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Analytics Area별 현황' }));
  await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' });
  await act(() =>
    router.navigate({
      to: '/integration/coverage',
      search: { view: 'areas', managedSystem: IDS.systemA, 'filter.analytics_area': 'unset' },
    }),
  );
  await screen.findByRole('button', { name: '다음' });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      cursor: 'page-2',
      'filter.analytics_area': 'unset',
      managedSystem: IDS.systemA,
    }),
  );
  await act(() => router.history.back());
  await waitFor(() => expect(router.state.location.search.cursor).toBeUndefined());
  await act(() => router.history.forward());
  await waitFor(() => expect(router.state.location.search.cursor).toBe('page-2'));
  fireEvent.click(await screen.findByRole('button', { name: '처음으로' }));
  await waitFor(() => expect(router.state.location.search.cursor).toBeUndefined());
  await act(async () => {
    router.history.back();
  });
  await waitFor(() => expect(router.state.location.search.cursor).toBe('page-2'));
  fireEvent.keyDown(screen.getByRole('tab', { name: '개요' }), { key: 'Enter' });
  await waitFor(() => expect(router.state.location.search.view).toBeUndefined());
  expect(router.state.location.search.managedSystem).toBe(IDS.systemA);
  expect(router.state.location.search.cursor).toBeUndefined();
  expect(router.state.location.search['filter.analytics_area']).toBeUndefined();
  const number = requests.filter((url) => url.pathname === '/dashboard/analytics-areas').length;
  fireEvent.click(screen.getByTestId('coverage-refresh'));
  await act(async () => {
    await Promise.resolve();
  });
  expect(requests.filter((url) => url.pathname === '/dashboard/analytics-areas')).toHaveLength(
    number,
  );
  await act(async () => {
    router.history.back();
  });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Analytics Area별 현황' })).toHaveAttribute(
      'aria-selected',
      'true',
    ),
  );
  expect(router.state.location.search).toMatchObject({
    cursor: 'page-2',
    'filter.analytics_area': 'unset',
    managedSystem: IDS.systemA,
  });
  await act(async () => {
    router.history.forward();
  });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true'),
  );
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Analytics Area별 현황' }));
  await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' });
});
it('removes prior scope counts while a new report is delayed', async () => {
  const { router, qc } = await mount(
    `/integration/coverage?view=areas&managedSystem=${IDS.systemA}`,
  );
  await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' });
  let resolve!: (value: Response) => void;
  reportResponse = () =>
    new Promise<Response>((done) => {
      resolve = done;
    });
  await act(() =>
    router.navigate({
      to: '/integration/coverage',
      search: {
        view: 'areas',
        managedSystem: IDS.systemB,
        'filter.analytics_area': 'unset',
        cursor: 'later',
      },
    }),
  );
  await screen.findByTestId('area-report-pending');
  expect(screen.queryByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' })).toBeNull();
  await waitFor(() =>
    expect(
      requests
        .filter((url) => url.pathname === '/dashboard/analytics-areas')
        .at(-1)
        ?.searchParams.get('cursor'),
    ).toBe('later'),
  );
  await act(async () => resolve(json({ ...areaReportFixture, items: [] })));
  await screen.findByText('표시할 Analytics Area 현황이 없습니다');
  expect(
    qc
      .getQueryCache()
      .findAll({ queryKey: ['dashboard-area-report'] })
      .map((query) => query.queryKey),
  ).toEqual(
    expect.arrayContaining([
      ['dashboard-area-report', IDS.workspace, IDS.systemB, IDS.systemB, 'unset', 'later'],
    ]),
  );
});

it.each([
  [IDS.systemA, IDS.systemB, IDS.areaA, undefined],
  [IDS.systemA, 'all', IDS.areaA, IDS.areaA],
  ['all', IDS.systemA, IDS.areaA, undefined],
  [IDS.systemA, IDS.systemB, 'unset', 'unset'],
])(
  'global scope %s → %s clears paging and incompatible Area %s',
  async (from, to, area, expected) => {
    const { router } = await mount(
      `/integration/coverage?view=areas&managedSystem=${from}&filter.analytics_area=${area}&cursor=old`,
      true,
    );
    fireEvent.click(await screen.findByTestId('scope-selector'));
    fireEvent.click(await screen.findByTestId(`scope-option-${to}`));
    await waitFor(() =>
      expect(router.state.location.search.managedSystem).toBe(to === 'all' ? undefined : to),
    );
    expect(router.state.location.search.cursor).toBeUndefined();
    expect(router.state.location.search['filter.analytics_area']).toBe(expected);
    expect(router.state.location.search.view).toBe('areas');
  },
);
it.each([
  [IDS.systemA, IDS.systemB, IDS.areaA, undefined, 'Data Warehouse'],
  [IDS.systemA, 'all', IDS.areaA, IDS.areaA, '전체 Managed System'],
  ['all', IDS.systemA, IDS.areaA, undefined, 'Identity Platform'],
  [IDS.systemA, IDS.systemB, 'unset', 'unset', 'Data Warehouse'],
])(
  'local scope %s → %s clears paging and incompatible Area %s',
  async (from, to, area, expected, name) => {
    const { router } = await mount(
      `/integration/coverage?view=areas&managedSystem=${from}&filter.analytics_area=${area}&cursor=old`,
    );
    fireEvent.click(screen.getByTestId('coverage-filter-button'));
    fireEvent.keyDown(screen.getByTestId('coverage-filter-managed-system'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name }));
    await waitFor(() =>
      expect(router.state.location.search.managedSystem).toBe(to === 'all' ? undefined : to),
    );
    expect(router.state.location.search.cursor).toBeUndefined();
    expect(router.state.location.search['filter.analytics_area']).toBe(expected);
  },
);
it.each([IDS.areaA, 'unset'])(
  'a real %s count link reaches the shipped Task validator and typed list request',
  async (area) => {
    const row = areaReportFixture.items[0];
    if (!row?.task) throw new Error('Task fixture missing');
    const report =
      area === 'unset'
        ? {
            ...areaReportFixture,
            items: [
              {
                ...row,
                analytics_area_id: null,
                analytics_area_name: null,
                task: {
                  ...row.task,
                  overdue: { count: 2, link: areaReportLink('task.overdue', IDS.systemA, null) },
                },
              },
            ],
          }
        : areaReportFixture;
    const { router } = await mount('/integration/coverage?view=areas', false, report);
    fireEvent.click(
      await screen.findByRole('link', {
        name: `Identity Platform · ${area === 'unset' ? '미지정' : '인증'} Task 기한 지남 2건`,
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'));
    expect(router.state.location.search).toMatchObject({
      managedSystem: IDS.systemA,
      'filter.analytics_area': area,
      overdue: true,
      view: 'backlog',
    });
    expect(router.state.location.searchStr).toContain('overdue=true');
    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.pathname === '/tasks' &&
            url.searchParams.get('overdue') === 'true' &&
            url.searchParams.get('analytics_area_id') === area &&
            url.searchParams.get('managed_system_id') === IDS.systemA,
        ),
      ).toBe(true),
    );
  },
);
it.each(['permission.denied', 'permission.scope_required', 'internal.unexpected', 'empty'])(
  'renders %s without fabricated counts and retries errors',
  async (code) => {
    const { qc } = await mount('/integration/coverage?view=areas');
    await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' });
    reportResponse = () =>
      code === 'empty'
        ? json({ ...areaReportFixture, items: [] })
        : json({ code, message: 'failed' }, code.startsWith('permission') ? 403 : 500);
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['dashboard-area-report'] });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' }),
      ).toBeNull(),
    );
    if (code === 'empty')
      expect(await screen.findByText('표시할 Analytics Area 현황이 없습니다')).toBeVisible();
    else if (code.startsWith('permission'))
      expect(await screen.findByRole('heading', { name: 'Analytics Area별 현황' })).toBeVisible();
    else {
      reportResponse = () => json(areaReportFixture);
      fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
      expect(
        await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' }),
      ).toBeVisible();
    }
  },
);

it('a late old-scope response cannot replace the current scope', async () => {
  const { router, qc } = await mount(
    `/integration/coverage?view=areas&managedSystem=${IDS.systemA}`,
  );
  await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' });
  let resolveOld!: (value: Response) => void;
  let resolveNew!: (value: Response) => void;
  reportResponse = (url) =>
    new Promise<Response>((done) => {
      if (url.searchParams.get('managed_system_id') === IDS.systemA) resolveOld = done;
      else resolveNew = done;
    });
  const refresh = qc.invalidateQueries({ queryKey: ['dashboard-area-report'] });
  await waitFor(() => expect(resolveOld).toBeDefined());
  await act(() =>
    router.navigate({
      to: '/integration/coverage',
      search: { view: 'areas', managedSystem: IDS.systemB },
    }),
  );
  await screen.findByTestId('area-report-pending');
  expect(screen.queryByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' })).toBeNull();
  await waitFor(() => expect(resolveNew).toBeDefined());
  await act(async () => resolveNew(json({ ...areaReportFixture, items: [] })));
  await screen.findByText('표시할 Analytics Area 현황이 없습니다');
  await act(async () => {
    resolveOld(json(areaReportFixture));
    await refresh;
  });
  expect(screen.getByText('표시할 Analytics Area 현황이 없습니다')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' })).toBeNull();
});

it('walks the scoped archived Area catalog, selects an Area and clears paging', async () => {
  const { router, qc } = await mount(
    `/integration/coverage?view=areas&managedSystem=${IDS.systemA}&cursor=old`,
  );
  await screen.findByTestId('analytics-area-report');
  const first = coverageAnalyticsAreasFixture.items[0];
  if (!first) throw new Error('Area fixture missing');
  catalogResponse = (url) =>
    json({
      items: [
        {
          ...first,
          id: url.searchParams.get('offset') === '0' ? IDS.areaA : IDS.systemB,
          name: url.searchParams.get('offset') === '0' ? '첫 Area' : '나중 Area',
          archived_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 2,
    });
  await act(async () => {
    await qc.invalidateQueries({ queryKey: ['coverage-area-options'] });
  });
  fireEvent.click(screen.getByTestId('coverage-filter-button'));
  fireEvent.keyDown(screen.getByLabelText('Analytics Area'), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: '나중 Area · 보관됨' }));
  await waitFor(() =>
    expect(router.state.location.search['filter.analytics_area']).toBe(IDS.systemB),
  );
  expect(router.state.location.search.cursor).toBeUndefined();
  const catalog = requests.filter(
    (url) => url.pathname === '/analytics-areas' && url.searchParams.get('limit') === '500',
  );
  expect(
    catalog.some(
      (url) =>
        url.searchParams.get('managed_system_id') === IDS.systemA &&
        url.searchParams.get('include_archived') === 'true' &&
        url.searchParams.get('offset') === '1',
    ),
  ).toBe(true);
  fireEvent.keyDown(screen.getByLabelText('Analytics Area'), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: '미지정' }));
  await waitFor(() => expect(router.state.location.search['filter.analytics_area']).toBe('unset'));
  fireEvent.click(screen.getByRole('button', { name: 'Analytics Area: 미지정 필터 제거' }));
  await waitFor(() =>
    expect(router.state.location.search['filter.analytics_area']).toBeUndefined(),
  );
});

it('waits for the current actor before requesting a report', async () => {
  let resolve!: (response: Response) => void;
  const identity = new Promise<Response>((done) => {
    resolve = done;
  });
  await mount('/integration/coverage?view=areas', false, areaReportFixture, identity);
  expect(screen.getByTestId('area-report-pending')).toBeVisible();
  expect(requests.some((url) => url.pathname === '/dashboard/analytics-areas')).toBe(false);
  await act(async () =>
    resolve(
      json({
        workspace_id: IDS.workspace,
        actor: {
          id: IDS.systemB,
          role_level: 'admin',
          email: 'a@example.test',
          external_id: 'a',
          display_name: 'A',
        },
      }),
    ),
  );
  expect(
    await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' }),
  ).toBeVisible();
});

it('renders both paging actions as visible secondary controls', async () => {
  await mount('/integration/coverage?view=areas&cursor=page-2');
  for (const name of ['다음', '처음으로']) {
    expect(await screen.findByRole('button', { name })).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );
  }
});
