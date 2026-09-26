import { getMilestone } from '@/lib/api/milestones';
import type { MilestoneDetailDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestoneDetailPanel } from './MilestoneDetailPanel';

vi.mock('@/lib/api/milestones', () => ({
  getMilestone: vi.fn(),
}));

const MANAGED_SYSTEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1';
const AREA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd00a1';
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002';
const MILESTONE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1021';
const FINDING_ID = 'ffffffff-ffff-4fff-8fff-ffffffff0181';

const linkedDetail: MilestoneDetailDto = {
  id: MILESTONE_ID,
  workspace_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  display_id: 'MLS-1021',
  primary_managed_system_id: MANAGED_SYSTEM_ID,
  title: 'SSO Stabilization',
  why: 'SSO 세션 만료 후 재인증 흐름이 없습니다.',
  status: 'in_progress',
  owner_actor_id: OWNER_ID,
  analytics_area_id: AREA_ID,
  start_date: '2026-05-10',
  target_date: '2026-06-15',
  created_by: OWNER_ID,
  created_at: '2026-07-21T01:00:00.000Z',
  updated_at: '2026-07-21T08:30:00.000Z',
  progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
  source_finding: {
    id: FINDING_ID,
    display_id: 'FIN-181',
    title: 'Power BI 임베디드 보고서의 SSO 세션 재인증 흐름 누락',
    summary: '여러 팀에서 401 응답 후 빈 화면을 겪고 있습니다.',
    evidence_count: 7,
  },
};

const standaloneDetail: MilestoneDetailDto = {
  ...linkedDetail,
  analytics_area_id: null,
  source_finding: null,
};

const ACTOR_NAMES = new Map([[OWNER_ID, '박서연']]);
const MANAGED_SYSTEM_NAMES = new Map([[MANAGED_SYSTEM_ID, 'Power BI']]);
const AREA_NAMES = new Map([[AREA_ID, 'Product Usage']]);

function renderPanel(detail: MilestoneDetailDto): void {
  vi.mocked(getMilestone).mockResolvedValue(detail);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MilestoneDetailPanel
        milestoneId={MILESTONE_ID}
        onClose={() => {}}
        actorNamesById={ACTOR_NAMES}
        managedSystemNamesById={MANAGED_SYSTEM_NAMES}
        analyticsAreaNamesById={AREA_NAMES}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getMilestone).mockReset();
});

describe('MilestoneDetailPanel (#514 B2d)', () => {
  it('renders the overview copy, progress strip, and property labels from the detail DTO', async () => {
    renderPanel(linkedDetail);

    expect(await screen.findByRole('heading', { name: 'SSO Stabilization' })).toBeInTheDocument();
    expect(screen.getByText('Why this milestone exists')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 tasks released')).toBeInTheDocument();
    for (const label of [
      'Status',
      'Managed System',
      'Analytics Area',
      'Owner',
      'Start',
      'Target',
      'Created',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Existing linked source Finding keeps its display card (approved contract).
    expect(screen.getByText('From finding')).toBeInTheDocument();
    expect(screen.getByText('FIN-181')).toBeInTheDocument();
    expect(screen.getByText('Evidence · 7')).toBeInTheDocument();
  });

  it('renders the standalone source copy and no Link source finding control when source_finding is null', async () => {
    renderPanel(standaloneDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(
      screen.getByText(
        '근거 Finding 이 연결되어 있지 않습니다. Standalone milestone 으로 운영 중입니다.',
      ),
    ).toBeInTheDocument();
    // The Finding → Milestone writer is out of scope (#514); no control may
    // pretend one exists.
    expect(screen.queryByRole('button', { name: 'Link source finding' })).not.toBeInTheDocument();
  });

  it('renders empty Evidence and Activity copy without outcome-survey controls', async () => {
    renderPanel(linkedDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(screen.getByText('연결된 evidence highlight 가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('활동 기록이 없습니다.')).toBeInTheDocument();
    // FOP-OUT-014: no Milestone → Outcome Survey validation in MVP.
    expect(screen.queryByText(/Outcome survey/)).not.toBeInTheDocument();
  });

  it('has exactly Overview, Evidence, Activity in the section nav — no Timeline, no Tasks', async () => {
    renderPanel(linkedDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    const nav = screen.getByRole('button', { name: 'Overview' }).closest('div');
    if (!nav) throw new Error('section nav not found');
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual(['Overview', 'Evidence', 'Activity']);
    expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tasks/ })).not.toBeInTheDocument();
  });

  it('renders Managed System as read-only text, not an input', async () => {
    renderPanel(linkedDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByText('Power BI').length).toBeGreaterThan(0);
  });
});
