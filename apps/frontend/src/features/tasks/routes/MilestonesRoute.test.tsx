import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { listMilestones } from '@/lib/api/milestones';
import type { MilestoneDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestonesRoute } from './MilestonesRoute';

// Shared across renders so a test can assert where selection sends the actor.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [
      { id: IDS.ownerU1, display_name: '김지원', kind: 'user' },
      { id: IDS.ownerU2, display_name: '박서연', kind: 'user' },
      { id: IDS.ownerU3, display_name: '이도윤', kind: 'user' },
    ],
  }),
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: IDS.msPowerBi, name: 'Power BI', archived_at: null }],
    total: 1,
  })),
}));

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({
    items: [{ id: IDS.areaProduct, name: 'Product Usage' }],
    total: 1,
  })),
}));

vi.mock('@/lib/api/milestones', () => ({
  listMilestones: vi.fn(async () => ({ items: MILESTONES })),
}));

const IDS = {
  workspace: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  msPowerBi: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1',
  areaProduct: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a1',
  areaRevenue: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a2',
  ownerU1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  ownerU2: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
  ownerU3: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003',
  sso: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1021',
  notif: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1022',
  ux: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1018',
};

const MILESTONE_BASE = {
  workspace_id: IDS.workspace,
  primary_managed_system_id: IDS.msPowerBi,
  analytics_area_id: IDS.areaProduct as string | null,
  start_date: '2026-05-10',
  target_date: '2026-06-15',
  created_at: '2026-07-21T01:00:00.000Z',
  updated_at: '2026-07-21T08:30:00.000Z',
};

// Same three statuses the tabs filter on; display ids use the MLS- prefix.
const MILESTONES: MilestoneDto[] = [
  {
    ...MILESTONE_BASE,
    id: IDS.sso,
    display_id: 'MLS-1021',
    title: 'SSO Stabilization',
    why: 'Power BI 임베디드 보고서 SSO 세션 만료 후 재인증 흐름이 없습니다.',
    status: 'in_progress',
    owner_actor_id: IDS.ownerU2,
    created_by: IDS.ownerU2,
    progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
  },
  {
    ...MILESTONE_BASE,
    id: IDS.notif,
    display_id: 'MLS-1022',
    title: 'Notification Reliability',
    why: 'Looker 알림 워커가 토큰 만료 시 조용히 종료됩니다.',
    status: 'planning',
    owner_actor_id: IDS.ownerU1,
    created_by: IDS.ownerU1,
    progress: { released_done: 0, in_flight: 0, queued: 2, total: 2, percent: 0 },
  },
  {
    ...MILESTONE_BASE,
    id: IDS.ux,
    display_id: 'MLS-1018',
    title: 'Q1 UX Polish',
    why: '모바일/iPad 시야 UX 잔여 이슈를 정리합니다.',
    status: 'released',
    owner_actor_id: IDS.ownerU3,
    created_by: IDS.ownerU3,
    analytics_area_id: null,
    progress: { released_done: 2, in_flight: 0, queued: 0, total: 2, percent: 100 },
  },
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function renderMilestones(): Promise<void> {
  renderWithClient(<MilestonesRoute />);
  await screen.findByText('MLS-1021');
}

function ssoRow(): HTMLElement {
  return screen.getByText('MLS-1021').closest('[role="button"]') as HTMLElement;
}

describe('MilestonesRoute list (#514 B2c)', () => {
  beforeEach(() => {
    vi.mocked(listMilestones).mockReset();
    vi.mocked(listMilestones).mockImplementation(async () => ({ items: MILESTONES }));
    vi.mocked(fetchAnalyticsAreas).mockReset();
    vi.mocked(fetchAnalyticsAreas).mockImplementation(async () => ({
      items: [
        {
          id: IDS.areaProduct,
          workspace_id: IDS.workspace,
          managed_system_id: IDS.msPowerBi,
          slug: 'product-usage',
          name: 'Product Usage',
          owner_team_id: null,
          archived_at: null,
          archived_by_actor_id: null,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
        },
      ],
      total: 1,
    }));
  });

  it('renders All/In progress/Planning/Released tabs, no Blocked, counts from the unfiltered list', async () => {
    await renderMilestones();

    expect(screen.getByRole('tab', { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^In progress/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Planning/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Released/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Blocked/ })).not.toBeInTheDocument();

    // Counts come from the real unfiltered response, never hard-coded.
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveTextContent('3');
    expect(screen.getByRole('tab', { name: /^In progress/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /^Planning/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /^Released/ })).toHaveTextContent('1');
  });

  it('choosing In progress requests status=in_progress', async () => {
    await renderMilestones();
    vi.mocked(listMilestones).mockClear();

    await userEvent.click(screen.getByRole('tab', { name: /^In progress/ }));

    await waitFor(() => {
      expect(vi.mocked(listMilestones)).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
    });
  });

  it('search filters already-fetched rows locally and sends no q param', async () => {
    await renderMilestones();
    vi.mocked(listMilestones).mockClear();
    navigateMock.mockClear();

    await userEvent.type(screen.getByRole('textbox', { name: 'Milestone 검색' }), 'SSO');

    await waitFor(() => {
      expect(screen.queryByText('Notification Reliability')).not.toBeInTheDocument();
    });
    expect(screen.getByText('SSO Stabilization')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    for (const call of vi.mocked(listMilestones).mock.calls) {
      expect(call[0]).not.toHaveProperty('q');
    }
  });

  it('Filter is present but opens no menu', async () => {
    await renderMilestones();

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the empty copy for an empty payload', async () => {
    vi.mocked(listMilestones).mockResolvedValue({ items: [] });

    renderWithClient(<MilestonesRoute />);

    expect(await screen.findByText('표시할 milestone 이 없습니다.')).toBeInTheDocument();
  });

  it('renders display id, title, In progress label, and why excerpt without raw UUIDs', async () => {
    await renderMilestones();

    const row = ssoRow();
    expect(within(row).getByText('SSO Stabilization')).toBeInTheDocument();
    expect(within(row).getByText('In progress')).toBeInTheDocument();
    expect(within(row).getByText(/SSO 세션 만료/)).toBeInTheDocument();
    expect(within(row).getByText('Power BI')).toBeInTheDocument();
    expect(within(row).getByText('Product Usage')).toBeInTheDocument();
    expect(screen.queryByText(/cccccccc/)).not.toBeInTheDocument();
  });

  it('renders the summary strip with Evidence linked exactly 0', async () => {
    await renderMilestones();

    const summary = screen.getByTestId('milestones-summary');
    expect(within(summary).getByText('Milestones')).toBeInTheDocument();
    expect(within(summary).getByText('Tasks in flight')).toBeInTheDocument();
    expect(within(summary).getByText('Evidence linked')).toBeInTheDocument();
    expect(within(summary).getByText('Released')).toBeInTheDocument();
    expect(
      within(summary).getByText('Schedule risk · mini-timeline 우측 표시'),
    ).toBeInTheDocument();
    expect(within(summary).getByTestId('milestone-summary-evidence-linked')).toHaveTextContent('0');
    // Sum of progress.in_flight across the unfiltered list (1 + 0 + 0).
    expect(within(summary).getByTestId('milestone-summary-in-flight')).toHaveTextContent('1');
    expect(within(summary).getByTestId('milestone-summary-released')).toHaveTextContent('1');
  });

  it('renders no mini-timeline or Gantt test id', async () => {
    await renderMilestones();

    const testIds = Array.from(document.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(testIds.filter((id) => id && /gantt|timeline/i.test(id))).toEqual([]);
  });

  it('selects a row via param and keeps it in the list', async () => {
    await renderMilestones();
    navigateMock.mockClear();

    await userEvent.click(screen.getByText('SSO Stabilization'));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/tasks',
        search: { view: 'milestones', param: IDS.sso },
      }),
    );
    expect(screen.getByText('SSO Stabilization')).toBeInTheDocument();
  });

  it('keeps managedSystem on selection navigation and list requests (F1)', async () => {
    renderWithClient(<MilestonesRoute managedSystem={IDS.msPowerBi} />);
    await screen.findByText('MLS-1021');
    for (const call of vi.mocked(listMilestones).mock.calls) {
      expect(call[0]).toMatchObject({ managed_system_id: IDS.msPowerBi });
    }
    navigateMock.mockClear();

    await userEvent.click(screen.getByText('SSO Stabilization'));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/tasks',
        search: { view: 'milestones', param: IDS.sso, managedSystem: IDS.msPowerBi },
      }),
    );
    expect(screen.getByText('SSO Stabilization')).toBeInTheDocument();
  });

  it('clears the stale highlight when selectedParam is removed (F2)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MilestonesRoute selectedParam={IDS.sso} />
      </QueryClientProvider>,
    );
    const row = (await screen.findByText('MLS-1021')).closest('[role="button"]') as HTMLElement;
    expect(row.querySelector('[data-testid="object-row-selected-bar"]')).not.toBeNull();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MilestonesRoute />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('object-row-selected-bar')).toBeNull();
    });
    expect(screen.getByText('SSO Stabilization')).toBeInTheDocument();
  });

  it('keeps the prototype three-line row hierarchy (F3)', async () => {
    await renderMilestones();

    const titleLine = screen.getByText('MLS-1021').parentElement as HTMLElement;
    const body = titleLine.parentElement as HTMLElement;
    expect(titleLine.textContent).toContain('SSO Stabilization');
    expect(titleLine.textContent).toContain('In progress');
    expect(titleLine.textContent).toContain('Power BI');
    expect(titleLine.textContent).toContain('Product Usage');
    expect(body.childElementCount).toBe(3);

    const whyLine = body.children[1] as HTMLElement;
    expect(whyLine.textContent).toContain('SSO 세션 만료');
    expect(whyLine.textContent).not.toContain('released');

    const metricsLine = body.children[2] as HTMLElement;
    expect(metricsLine.textContent).toContain('0/1 released');
    expect(metricsLine.textContent).toContain('2026-06-15');
    expect(metricsLine.textContent).not.toContain('SSO 세션');
  });

  it('resolves archived Areas on later pages and omits null-area badges (F4)', async () => {
    vi.mocked(fetchAnalyticsAreas).mockReset();
    vi.mocked(fetchAnalyticsAreas)
      .mockResolvedValueOnce({
        items: [
          {
            id: IDS.areaRevenue,
            workspace_id: IDS.workspace,
            managed_system_id: IDS.msPowerBi,
            slug: 'revenue',
            name: 'Revenue',
            owner_team_id: null,
            archived_at: '2026-07-10T00:00:00.000Z',
            archived_by_actor_id: IDS.ownerU1,
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-10T00:00:00.000Z',
          },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: IDS.areaProduct,
            workspace_id: IDS.workspace,
            managed_system_id: IDS.msPowerBi,
            slug: 'product-usage',
            name: 'Product Usage',
            owner_team_id: null,
            archived_at: null,
            archived_by_actor_id: null,
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-01T00:00:00.000Z',
          },
        ],
        total: 2,
      });

    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');

    const row = screen.getByText('MLS-1021').closest('[role="button"]') as HTMLElement;
    expect(within(row).getByText('Product Usage')).toBeInTheDocument();

    const nullAreaRow = screen.getByText('MLS-1018').closest('[role="button"]') as HTMLElement;
    expect(within(nullAreaRow).queryByText(/Product Usage|Revenue/)).toBeNull();

    expect(vi.mocked(fetchAnalyticsAreas)).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: true, limit: 500, offset: 0 }),
    );
    expect(vi.mocked(fetchAnalyticsAreas)).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: true, limit: 500, offset: 1 }),
    );
  });
});
