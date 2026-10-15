import { areaReportLink } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  areaReportFixture,
  unclassifiedAreaReportFixture,
} from '../../../../tests/visual/fixtures/area-report';
import { COVERAGE_IDS as IDS } from '../../../../tests/visual/fixtures/coverage';
import { AnalyticsAreaReportTable } from '../components/AnalyticsAreaReportTable';

afterEach(cleanup);
it('renders exact domain links, neutral ratios, unavailable metrics and whole-system review queues', async () => {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <AnalyticsAreaReportTable report={areaReportFixture} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole('link', { name: 'Identity Platform · 인증 VOC 전체 10건' }),
  ).toHaveAttribute(
    'href',
    '/vocs?managedSystem=a1111111-1111-4111-8111-111111111111&filter.analytics_area=c3333333-3333-4333-8333-333333333333&view=inbox',
  );
  expect(
    screen.getByRole('link', { name: 'Identity Platform · 인증 Finding 진행 중 10건' }),
  ).toHaveAttribute('href', expect.stringContaining('status=active'));
  expect(
    screen.getByRole('link', { name: 'Data Warehouse · 미지정 Survey 후속 조치 필요 2건' }),
  ).toHaveAttribute('href', expect.stringContaining('filter.analytics_area=unset'));
  expect(
    screen.getByRole('link', { name: 'Identity Platform · 인증 Task 기한 지남 2건' }),
  ).toHaveAttribute('href', expect.stringContaining('overdue=true'));
  expect(
    screen.getByRole('link', { name: 'Identity Platform · 인증 VOC Task 연결 0/10 · 0%' }),
  ).toBeVisible();
  expect(screen.getByText('실행 연결 10/10 · 100%').closest('a')).toBeNull();
  expect(screen.getByText('공개 업데이트 해당 없음')).toBeVisible();
  for (const explanation of screen.getAllByText('현재 권한 범위에서 볼 수 없습니다')) {
    expect(explanation).toHaveClass('sr-only');
    expect(explanation.parentElement).toHaveAttribute('title', '현재 권한 범위에서 볼 수 없습니다');
    expect(explanation.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
  }
  expect(screen.getByText('미지정')).toBeVisible();
  expect(screen.getAllByText('보관됨')).toHaveLength(2);
  expect(screen.getAllByRole('link', { name: /Task Request 검토/ })).toHaveLength(2);
  for (const [system, id] of [
    ['Identity Platform', IDS.systemA],
    ['Data Warehouse', IDS.systemB],
  ]) {
    expect(
      screen.getByRole('link', { name: `Task Request 검토 · ${system} 전체 대기열` }),
    ).toHaveAttribute('href', `/tasks?view=requests&managedSystem=${id}`);
  }
  expect(
    screen.getByText('VOC 분류 10/10 · Finding 분류 10/10 · Task 분류 3/3 · Survey 분류 1/1'),
  ).toBeVisible();
  expect(
    screen.queryByText('모든 항목이 미분류 상태입니다. Analytics Area 분류는 선택 사항입니다.'),
  ).toBeNull();
  for (const [name, metric, system, area] of [
    ['Identity Platform · 인증 Finding 진행 중 10건', 'finding.active', IDS.systemA, IDS.areaA],
    ['Identity Platform · 인증 Task 기한 지남 2건', 'task.overdue', IDS.systemA, IDS.areaA],
    [
      'Data Warehouse · 미지정 Survey 후속 조치 필요 2건',
      'survey.follow_up_needed',
      IDS.systemB,
      null,
    ],
  ] as const) {
    const link = areaReportLink(metric, system, area);
    expect(screen.getByRole('link', { name })).toHaveAttribute(
      'href',
      `${link.pathname}?${new URLSearchParams(link.search)}`,
    );
  }
  const row = screen.getByRole('row', { name: /인증/ });
  for (const label of ['전체 10', 'In-flight (Todo·Doing·Review) 3', '기한 지남 2', 'Open 1']) {
    expect(within(row).getByText(label)).toBeVisible();
  }
  expect(
    screen.getByRole('link', { name: 'Identity Platform · 인증 Task Todo 3건' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Identity Platform · 인증 Survey Open 1건' }),
  ).toBeVisible();
  expect(within(row).getByText('미배정 0').closest('a')).toBeNull();
  expect(within(row).getByText('미배정 0')).not.toHaveClass('text-accent-primary');
});

it.each([
  ['all-unclassified', unclassifiedAreaReportFixture, true],
  [
    'unset page in classified context',
    { ...areaReportFixture, items: areaReportFixture.items.slice(1) },
    false,
  ],
  ['mixed scope', areaReportFixture, false],
  ['empty', { ...unclassifiedAreaReportFixture, items: [] }, false],
])('uses classification context for %s', (_name, report, shown) => {
  render(<AnalyticsAreaReportTable report={report} />);
  expect(
    screen.queryByText('모든 항목이 미분류 상태입니다. Analytics Area 분류는 선택 사항입니다.') !==
      null,
  ).toBe(shown);
});
