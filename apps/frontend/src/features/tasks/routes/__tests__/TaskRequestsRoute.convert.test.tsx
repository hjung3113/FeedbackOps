import { listMilestones } from '@/lib/api/milestones';
import { type MilestoneDto, convertTaskRequestRequestSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestsRoute } from '../TaskRequestsRoute';

const api = vi.hoisted(() => ({ apiClient: vi.fn(), convertTaskRequest: vi.fn() }));
const requestedOutcome225 = `핵심 결과 ${'x'.repeat(219)}`;
const requestedOutcome69 = `업무 결과 ${'x'.repeat(63)}`;
const truncationMarker = '…';
const taskTitleMaxLength = convertTaskRequestRequestSchema.shape.title.maxLength;

if (taskTitleMaxLength === null) {
  throw new Error('Task conversion title requires a canonical maximum length.');
}

const overLimitTitle = 'x'.repeat(taskTitleMaxLength + 1);
const taskRequest = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-42',
  source_type: 'finding' as const,
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: '쿼리 플랜 개선 필요',
  requested_outcome: requestedOutcome225,
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'approved' as const,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
};

const milestoneOtherSystemId = 'cccccccc-cccc-4ccc-8ccc-cccccccc00c2';
const milestoneBase = {
  workspace_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  analytics_area_id: null,
  why: 'Milestone for conversion picker tests',
  status: 'in_progress',
  owner_actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  start_date: '2026-07-01',
  target_date: '2026-09-30',
  created_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
};
const milestoneForRequestSystem: MilestoneDto = {
  ...milestoneBase,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb3001',
  primary_managed_system_id: taskRequest.primary_managed_system_id,
  display_id: 'MLS-3001',
  title: 'Billing Q3 cutoff',
};
const milestoneForOtherSystem: MilestoneDto = {
  ...milestoneBase,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb3002',
  primary_managed_system_id: milestoneOtherSystemId,
  display_id: 'MLS-3002',
  title: 'Other system milestone',
};
const MILESTONES: MilestoneDto[] = [milestoneForRequestSystem, milestoneForOtherSystem];

vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    ListShell: ({
      list,
      detailPanel,
    }: {
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div>
        <main>{list}</main>
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: () => ({ data: null }),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/milestones', () => ({
  listMilestones: vi.fn(),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: taskRequest.primary_managed_system_id, name: 'Billing Ops' }],
  })),
}));
vi.mock('@/lib/api', () => ({
  apiClient: api.apiClient,
  approveTaskRequest: vi.fn(),
  convertTaskRequest: api.convertTaskRequest,
  fetchMe: vi.fn(async () => ({
    actor: { id: '60000000-0000-0000-0000-000000000006', role_level: 'admin' },
  })),
  fetchPermissionCheck: vi.fn(async () => ({ state: 'approved' })),
  fetchTaskRequests: vi.fn(async () => ({ items: [taskRequest] })),
  linkExistingTask: vi.fn(),
  listTasks: vi.fn(async () => ({ items: [] })),
  rejectTaskRequest: vi.fn(),
  requestMoreEvidenceForTaskRequest: vi.fn(),
  resolveActors: vi.fn(async () => ({ actors: [], teams: [] })),
}));

function renderRoute(requestedOutcome = requestedOutcome225) {
  taskRequest.requested_outcome = requestedOutcome;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TaskRequestsRoute selectedParam={taskRequest.id} />
    </QueryClientProvider>,
  );
}

async function openConvertForm() {
  renderRoute();
  await screen.findByText('REQ-42');
  fireEvent.click(screen.getByRole('button', { name: 'Convert to Task' }));
  return screen.findByTestId('task-request-convert-title-input');
}

beforeEach(() => {
  vi.mocked(listMilestones).mockReset();
  vi.mocked(listMilestones).mockImplementation(async (options) => ({
    items: MILESTONES.filter(
      (milestone) => milestone.primary_managed_system_id === options?.managed_system_id,
    ),
  }));
});

describe('TaskRequestsRoute conversion title', () => {
  it('AC-C6a parses the generated default title with the canonical conversion schema', async () => {
    const input = await openConvertForm();
    expect(
      convertTaskRequestRequestSchema.parse({ title: input.getAttribute('value') }).title,
    ).toHaveLength(taskTitleMaxLength);
  });

  it('AC-C6b shows a truncation marker and character count for a 225-character requested outcome', async () => {
    const input = await openConvertForm();
    expect(input).toHaveValue(
      `${requestedOutcome225.slice(0, taskTitleMaxLength - truncationMarker.length)}${truncationMarker}`,
    );
    expect(screen.getByTestId('task-request-convert-title-count')).toHaveTextContent(
      `${taskTitleMaxLength}/${taskTitleMaxLength}`,
    );
  });

  it('AC-C6c leaves a 69-character requested outcome unchanged', async () => {
    renderRoute(requestedOutcome69);
    await screen.findByText('REQ-42');
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Task' }));
    expect(await screen.findByTestId('task-request-convert-title-input')).toHaveValue(
      requestedOutcome69,
    );
  });

  it('AC-C6d shows an inline error, focuses the title, and makes no API mutation for an over-limit submit', async () => {
    const input = await openConvertForm();
    fireEvent.change(input, { target: { value: overLimitTitle } });
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    expect(await screen.findByTestId('task-request-convert-title-error')).toBeInTheDocument();
    expect(input).toHaveFocus();
    await Promise.resolve();
    expect(api.convertTaskRequest).toHaveBeenCalledTimes(0);
    expect(api.apiClient).toHaveBeenCalledTimes(0);
  });

  it('AC-C6e keeps submit enabled for an over-limit title', async () => {
    const input = await openConvertForm();
    fireEvent.change(input, { target: { value: overLimitTitle } });
    expect(screen.getByTestId('task-request-convert-submit')).toBeEnabled();
  });
});

describe('TaskRequestsRoute conversion milestone picker', () => {
  beforeEach(() => {
    api.convertTaskRequest.mockResolvedValue({ display_id: 'TASK-7' });
  });

  it('B3a offers None plus the milestones of the request primary Managed System', async () => {
    await openConvertForm();
    const select = screen.getByRole('combobox', { name: 'Milestone' });
    await waitFor(() => {
      expect(within(select).getByRole('option', { name: milestoneForRequestSystem.title }));
    });
    const optionNames = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionNames).toEqual(['None', milestoneForRequestSystem.title]);
    expect(optionNames).not.toContain(milestoneForOtherSystem.title);
    expect(vi.mocked(listMilestones)).toHaveBeenCalledWith(
      expect.objectContaining({ managed_system_id: taskRequest.primary_managed_system_id }),
    );
  });

  it('B3a submits the selected milestone id to convertTaskRequest', async () => {
    await openConvertForm();
    fireEvent.change(screen.getByRole('combobox', { name: 'Milestone' }), {
      target: { value: milestoneForRequestSystem.id },
    });
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    await waitFor(() => {
      expect(api.convertTaskRequest).toHaveBeenCalledWith(
        taskRequest.id,
        expect.objectContaining({ milestone_id: milestoneForRequestSystem.id }),
        expect.any(String),
      );
    });
  });

  it('B3a submits milestone_id null when None is selected', async () => {
    await openConvertForm();
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    await waitFor(() => {
      expect(api.convertTaskRequest).toHaveBeenCalledWith(
        taskRequest.id,
        expect.objectContaining({ milestone_id: null }),
        expect.any(String),
      );
    });
  });
});
