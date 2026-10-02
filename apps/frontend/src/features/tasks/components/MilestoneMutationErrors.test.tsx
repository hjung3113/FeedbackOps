import { GENERIC_ERROR_MESSAGE } from '@/lib/api/errorMapper';
import { createMilestone, getMilestone, updateMilestone } from '@/lib/api/milestones';
import { listTasks } from '@/lib/api/tasks';
import type { MilestoneDetailDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestoneCreatePanel, MilestoneDetailPanel } from './MilestoneDetailPanel';

vi.mock('@/lib/api/milestones', () => ({
  createMilestone: vi.fn(),
  getMilestone: vi.fn(),
  updateMilestone: vi.fn(),
}));

vi.mock('@/lib/api/tasks', () => ({ listTasks: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

const MANAGED_SYSTEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1';
const MILESTONE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1021';
const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002';
const WORKSPACE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';

const milestone: MilestoneDetailDto = {
  id: MILESTONE_ID,
  workspace_id: WORKSPACE_ID,
  display_id: 'MLS-1021',
  primary_managed_system_id: MANAGED_SYSTEM_ID,
  title: 'SSO Stabilization',
  why: 'SSO 세션 만료 후 재인증 흐름이 없습니다.',
  status: 'in_progress',
  owner_actor_id: ACTOR_ID,
  analytics_area_id: null,
  start_date: '2026-05-10',
  target_date: '2026-06-15',
  created_by: ACTOR_ID,
  created_at: '2026-07-21T01:00:00.000Z',
  updated_at: '2026-07-21T08:30:00.000Z',
  progress: { released_done: 0, in_flight: 0, queued: 0, total: 0, percent: 0 },
  source_finding: null,
};

function renderCreatePanel(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MilestoneCreatePanel
        managedSystems={[{ id: MANAGED_SYSTEM_ID, name: 'Power BI' }]}
        analyticsAreas={[]}
        actors={[]}
        defaultManagedSystemId={MANAGED_SYSTEM_ID}
        onCreated={() => {}}
        onCancel={() => {}}
      />
    </QueryClientProvider>,
  );
}

function renderDetailPanel(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MilestoneDetailPanel
        milestoneId={MILESTONE_ID}
        onClose={() => {}}
        actorNamesById={new Map([[ACTOR_ID, '박서연']])}
        managedSystemNamesById={new Map([[MANAGED_SYSTEM_ID, 'Power BI']])}
        analyticsAreaNamesById={new Map()}
      />
    </QueryClientProvider>,
  );
}

function fillRequiredCreateFields(): void {
  fireEvent.change(screen.getByRole('textbox', { name: '제목' }), {
    target: { value: 'Milestone 생성' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: '이 Milestone의 목적' }), {
    target: { value: 'A reason for this milestone' },
  });
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-05-10' } });
  fireEvent.change(screen.getByLabelText('목표일'), { target: { value: '2026-06-15' } });
}

beforeEach(() => {
  vi.mocked(createMilestone).mockReset();
  vi.mocked(getMilestone).mockReset().mockResolvedValue(milestone);
  vi.mocked(updateMilestone).mockReset();
  vi.mocked(listTasks).mockReset().mockResolvedValue({ items: [] });
});

describe('Milestone mutation error copy', () => {
  const rawError = 'private backend exception detail';

  it.each(['create', 'title', 'status'] as const)(
    'shows the catalog message after a failed %s mutation',
    async (mutation) => {
      const user = userEvent.setup();

      if (mutation === 'create') {
        vi.mocked(createMilestone).mockRejectedValue(new Error(rawError));
        renderCreatePanel();
        fillRequiredCreateFields();
        await user.click(screen.getByRole('button', { name: '생성' }));
      } else {
        vi.mocked(updateMilestone).mockRejectedValue(new Error(rawError));
        renderDetailPanel();
        await screen.findByRole('heading', { name: 'SSO Stabilization' });

        if (mutation === 'title') {
          await user.click(screen.getByRole('button', { name: '제목 편집' }));
          fireEvent.change(screen.getByRole('textbox', { name: '제목' }), {
            target: { value: 'SSO Stabilization v2' },
          });
          await user.click(screen.getByRole('button', { name: '저장' }));
        } else {
          fireEvent.click(screen.getByRole('combobox', { name: '상태' }));
          fireEvent.click(await screen.findByRole('option', { name: '릴리스됨' }));
        }
      }

      expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByText(rawError)).not.toBeInTheDocument();
    },
  );
});

describe('Milestone create idempotency', () => {
  it('reuses the original key when the payload is edited and reverted before retry', async () => {
    const user = userEvent.setup();
    vi.mocked(createMilestone).mockRejectedValue(new Error('temporary failure'));
    renderCreatePanel();
    fillRequiredCreateFields();

    await user.click(screen.getByRole('button', { name: '생성' }));
    await screen.findByText(GENERIC_ERROR_MESSAGE);
    const firstKey = vi.mocked(createMilestone).mock.calls[0]?.[1];
    if (firstKey === undefined) throw new Error('first create idempotency key missing');

    fireEvent.change(screen.getByRole('textbox', { name: '제목' }), {
      target: { value: 'Changed milestone' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '제목' }), {
      target: { value: 'Milestone 생성' },
    });
    await user.click(screen.getByRole('button', { name: '생성' }));
    await screen.findByText(GENERIC_ERROR_MESSAGE);
    const retryKey = vi.mocked(createMilestone).mock.calls[1]?.[1];
    expect(retryKey).toBe(firstKey);
  });
});
