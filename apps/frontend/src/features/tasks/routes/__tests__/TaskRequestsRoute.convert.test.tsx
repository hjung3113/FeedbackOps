import { listMilestones } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import {
  type MilestoneDto,
  convertTaskRequestRequestSchema,
  taskPrioritySchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestsRoute } from '../TaskRequestsRoute';

async function chooseOption(label: string, optionName: string): Promise<void> {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

async function readOptions(label: string): Promise<HTMLElement[]> {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  return screen.findAllByRole('option');
}

const api = vi.hoisted(() => ({
  apiClient: vi.fn(),
  convertTaskRequest: vi.fn(),
  fetchAnalyticsAreas: vi.fn(),
  useFindingDetail: vi.fn(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
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
const otherTaskRequest = {
  ...taskRequest,
  id: '10000000-0000-0000-0000-000000000002',
  display_id: 'REQ-43',
  requested_outcome: 'Review the second candidate task',
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
vi.mock('sonner', () => ({ toast }));

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: api.useFindingDetail,
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: api.fetchAnalyticsAreas,
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
  render(
    <QueryClientProvider client={queryClient}>
      <TaskRequestsRoute selectedParam={taskRequest.id} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

async function openConvertForm() {
  renderRoute();
  await screen.findByText('REQ-42');
  fireEvent.click(screen.getByRole('button', { name: 'Task로 전환' }));
  return screen.findByTestId('task-request-convert-title-input');
}

beforeEach(() => {
  api.fetchAnalyticsAreas.mockReset();
  api.fetchAnalyticsAreas.mockResolvedValue({ items: [] });
  api.useFindingDetail.mockReset();
  api.useFindingDetail.mockReturnValue({
    data: { id: taskRequest.source_id, analytics_area_id: null },
    isSuccess: true,
    isError: false,
  });
  vi.mocked(listMilestones).mockReset();
  toast.success.mockReset();
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
    fireEvent.click(screen.getByRole('button', { name: 'Task로 전환' }));
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

describe('TaskRequestsRoute conversion priority labels', () => {
  it.each(taskPrioritySchema.options)(
    'renders a display label for priority %s',
    async (priority) => {
      await openConvertForm();

      const options = await readOptions('우선순위');
      expect(
        options.some((option) => option.textContent?.trim() === TASK_PRIORITY_LABELS[priority]),
      ).toBe(true);
      expect(options.some((option) => option.textContent?.trim() === priority)).toBe(false);
    },
  );

  it('submits the selected shared priority, due date, and milestone values unchanged', async () => {
    await openConvertForm();
    await chooseOption('우선순위', TASK_PRIORITY_LABELS.urgent);
    fireEvent.change(screen.getByRole('textbox', { name: '마감일' }), {
      target: { value: '2026-09-30' },
    });
    await chooseOption('Milestone', milestoneForRequestSystem.title);
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));

    await waitFor(() =>
      expect(api.convertTaskRequest).toHaveBeenCalledWith(
        taskRequest.id,
        {
          title: `${requestedOutcome225.slice(0, taskTitleMaxLength - truncationMarker.length)}${truncationMarker}`,
          priority: 'urgent',
          assignee_actor_id: null,
          due_date: '2026-09-30',
          milestone_id: milestoneForRequestSystem.id,
          analytics_area_id: null,
        },
        expect.any(String),
      ),
    );
  });
});

describe('TaskRequestsRoute Analytics Area inheritance', () => {
  it('AC-681-3 defaults conversion to the source Finding Analytics Area', async () => {
    const analyticsAreaId = '30000000-0000-4000-8000-000000000021';
    api.useFindingDetail.mockReturnValue({
      data: { id: taskRequest.source_id, analytics_area_id: analyticsAreaId },
      isSuccess: true,
      isError: false,
    });
    api.fetchAnalyticsAreas.mockResolvedValue({
      items: [
        {
          id: analyticsAreaId,
          managed_system_id: taskRequest.primary_managed_system_id,
          name: '재무 전환 분석',
          archived_at: null,
        },
      ],
    });
    api.convertTaskRequest.mockResolvedValue({ display_id: 'TASK-7' });

    await openConvertForm();
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));

    await waitFor(() =>
      expect(api.convertTaskRequest).toHaveBeenLastCalledWith(
        taskRequest.id,
        expect.objectContaining({ analytics_area_id: analyticsAreaId }),
        expect.any(String),
      ),
    );
  });

  it('keeps conversion disabled during a deferred source Finding read until an explicit Area choice', async () => {
    const sourceAreaId = '30000000-0000-4000-8000-000000000021';
    const alternativeAreaId = '30000000-0000-4000-8000-000000000022';
    let settleSourceFinding:
      | ((finding: { id: string; analytics_area_id: string | null }) => void)
      | undefined;
    api.useFindingDetail.mockImplementation(function useDeferredSourceFinding(findingId: string) {
      return useQuery({
        queryKey: ['deferred-source-finding', findingId],
        queryFn: () =>
          new Promise<{ id: string; analytics_area_id: string | null }>((resolve) => {
            settleSourceFinding = resolve;
          }),
      });
    });
    api.fetchAnalyticsAreas.mockResolvedValue({
      items: [
        {
          id: sourceAreaId,
          managed_system_id: taskRequest.primary_managed_system_id,
          name: 'Source Area',
          archived_at: null,
        },
        {
          id: alternativeAreaId,
          managed_system_id: taskRequest.primary_managed_system_id,
          name: 'Alternative Area',
          archived_at: null,
        },
      ],
    });
    api.convertTaskRequest.mockReset().mockResolvedValue({ display_id: 'TASK-7' });

    await openConvertForm();
    await waitFor(() => expect(settleSourceFinding).toEqual(expect.any(Function)));

    const submit = screen.getByTestId('task-request-convert-submit');
    expect(submit).toBeDisabled();
    await chooseOption('Analytics Area', 'Alternative Area');
    expect(submit).toBeEnabled();

    if (!settleSourceFinding) throw new Error('Expected a deferred source Finding read.');
    settleSourceFinding({ id: taskRequest.source_id, analytics_area_id: sourceAreaId });
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Analytics Area' })).toHaveTextContent(
        'Alternative Area',
      ),
    );
    fireEvent.click(submit);

    await waitFor(() =>
      expect(api.convertTaskRequest).toHaveBeenLastCalledWith(
        taskRequest.id,
        expect.objectContaining({ analytics_area_id: alternativeAreaId }),
        expect.any(String),
      ),
    );
  });

  it.each([
    ['an alternate Area', 'Alternative Area', '30000000-0000-4000-8000-000000000022'],
    ['explicit None', '없음', null],
  ] as const)(
    'AC-681-3 preserves %s after a same-request refetch and submits that choice',
    async (_choice, label, expectedAreaId) => {
      const sourceAreaId = '30000000-0000-4000-8000-000000000021';
      const alternativeAreaId = '30000000-0000-4000-8000-000000000022';
      api.useFindingDetail.mockReturnValue({
        data: { id: taskRequest.source_id, analytics_area_id: sourceAreaId },
        isSuccess: true,
        isError: false,
      });
      api.fetchAnalyticsAreas.mockResolvedValue({
        items: [
          {
            id: sourceAreaId,
            managed_system_id: taskRequest.primary_managed_system_id,
            name: 'Source Area',
            archived_at: null,
          },
          {
            id: alternativeAreaId,
            managed_system_id: taskRequest.primary_managed_system_id,
            name: 'Alternative Area',
            archived_at: null,
          },
        ],
      });
      api.convertTaskRequest.mockReset().mockResolvedValue({ display_id: 'TASK-7' });

      const { queryClient } = await openConvertFormReturnsClient();
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Analytics Area' })).toHaveTextContent(
          'Source Area',
        );
      });
      await chooseOption('Analytics Area', label);

      queryClient.setQueryData(['task-requests', undefined], {
        items: [{ ...taskRequest, updated_at: '2026-07-10T01:00:00.000Z' }],
      });

      expect(await screen.findByTestId('task-request-convert-title-input')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Analytics Area' })).toHaveTextContent(label);
      fireEvent.click(screen.getByTestId('task-request-convert-submit'));

      await waitFor(() =>
        expect(api.convertTaskRequest).toHaveBeenLastCalledWith(
          taskRequest.id,
          expect.objectContaining({ analytics_area_id: expectedAreaId }),
          expect.any(String),
        ),
      );
    },
  );

  it('AC-681-3 resets conversion when selection moves to a different request', async () => {
    const { queryClient } = await openConvertFormReturnsClient();
    queryClient.setQueryData(['task-requests', undefined], {
      items: [taskRequest, otherTaskRequest],
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^승인됨/ }));
    fireEvent.click(await screen.findByRole('button', { name: /REQ-43/ }));

    await waitFor(() => {
      expect(screen.queryByTestId('task-request-convert-title-input')).not.toBeInTheDocument();
    });
  });

  it.each([
    ['없음', null],
    ['Current Area', '30000000-0000-4000-8000-000000000024'],
  ] as const)(
    'AC-681-3 requires an explicit %s choice for an archived source Area',
    async (choice, expectedAreaId) => {
      const archivedAreaId = '30000000-0000-4000-8000-000000000023';
      api.useFindingDetail.mockReturnValue({
        data: { id: taskRequest.source_id, analytics_area_id: archivedAreaId },
        isSuccess: true,
        isError: false,
      });
      api.fetchAnalyticsAreas.mockResolvedValue({
        items: [
          {
            id: '30000000-0000-4000-8000-000000000024',
            managed_system_id: taskRequest.primary_managed_system_id,
            name: 'Current Area',
            archived_at: null,
          },
        ],
      });
      api.convertTaskRequest.mockReset().mockResolvedValue({ display_id: 'TASK-7' });

      await openConvertForm();
      const hint = await screen.findByText(
        '원본 Finding의 Analytics Area가 보관되어 있습니다. 다른 Analytics Area를 선택하거나 없음을 선택하세요.',
      );
      const areaPicker = screen.getByRole('combobox', { name: 'Analytics Area' });
      expect(areaPicker).toHaveTextContent('Analytics Area 선택 필요');
      expect(areaPicker).toHaveAccessibleDescription(hint.textContent ?? '');
      const submit = screen.getByTestId('task-request-convert-submit');
      expect(submit).toBeDisabled();
      const form = submit.closest('form');
      if (!form) throw new Error('Expected the conversion form.');
      fireEvent.submit(form);
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.convertTaskRequest).not.toHaveBeenCalled();

      await chooseOption('Analytics Area', choice);
      expect(submit).toBeEnabled();
      fireEvent.click(submit);

      await waitFor(() =>
        expect(api.convertTaskRequest).toHaveBeenLastCalledWith(
          taskRequest.id,
          expect.objectContaining({ analytics_area_id: expectedAreaId }),
          expect.any(String),
        ),
      );
      expect(api.convertTaskRequest.mock.lastCall?.[1]).not.toMatchObject({
        analytics_area_id: archivedAreaId,
      });
    },
  );

  it('AC-681-3 requires a new Area choice when a previously selected Area disappears', async () => {
    const sourceAreaId = '30000000-0000-4000-8000-000000000021';
    const selectedAreaId = '30000000-0000-4000-8000-000000000022';
    api.useFindingDetail.mockReturnValue({
      data: { id: taskRequest.source_id, analytics_area_id: sourceAreaId },
      isSuccess: true,
      isError: false,
    });
    api.fetchAnalyticsAreas
      .mockResolvedValueOnce({
        items: [
          {
            id: sourceAreaId,
            managed_system_id: taskRequest.primary_managed_system_id,
            name: 'Source Area',
            archived_at: null,
          },
          {
            id: selectedAreaId,
            managed_system_id: taskRequest.primary_managed_system_id,
            name: 'Alternative Area',
            archived_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: sourceAreaId,
            managed_system_id: taskRequest.primary_managed_system_id,
            name: 'Source Area',
            archived_at: null,
          },
        ],
      });
    api.convertTaskRequest.mockReset().mockResolvedValue({ display_id: 'TASK-7' });

    const { queryClient } = await openConvertFormReturnsClient();
    await chooseOption('Analytics Area', 'Alternative Area');
    await queryClient.invalidateQueries({
      queryKey: ['analytics-areas', taskRequest.primary_managed_system_id],
    });

    const hint = await screen.findByText(
      '선택한 Analytics Area를 더 이상 사용할 수 없습니다. 다른 Analytics Area를 선택하거나 없음을 선택하세요.',
    );
    const areaPicker = screen.getByRole('combobox', { name: 'Analytics Area' });
    expect(areaPicker).toHaveTextContent('Analytics Area 선택 필요');
    expect(areaPicker).toHaveAccessibleDescription(hint.textContent ?? '');
    const submit = screen.getByTestId('task-request-convert-submit');
    expect(submit).toBeDisabled();
    const form = submit.closest('form');
    if (!form) throw new Error('Expected the conversion form.');
    fireEvent.submit(form);
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.convertTaskRequest).not.toHaveBeenCalled();

    await chooseOption('Analytics Area', '없음');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(api.convertTaskRequest).toHaveBeenLastCalledWith(
        taskRequest.id,
        expect.objectContaining({ analytics_area_id: null }),
        expect.any(String),
      ),
    );
  });
});

describe('TaskRequestsRoute conversion milestone picker', () => {
  beforeEach(() => {
    api.convertTaskRequest.mockResolvedValue({ display_id: 'TASK-7' });
  });

  it('B3a offers None plus the milestones of the request primary Managed System', async () => {
    await openConvertForm();
    const options = await readOptions('Milestone');
    const optionNames = options.map((option) => option.textContent?.trim());
    expect(optionNames).toEqual(['없음', milestoneForRequestSystem.title]);
    expect(optionNames).not.toContain(milestoneForOtherSystem.title);
    expect(vi.mocked(listMilestones)).toHaveBeenCalledWith(
      expect.objectContaining({ managed_system_id: taskRequest.primary_managed_system_id }),
    );
  });

  it('B3a submits the selected milestone id to convertTaskRequest', async () => {
    await openConvertForm();
    await chooseOption('Milestone', milestoneForRequestSystem.title);
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

  it('shows a Korean success toast after converting a Task Request', async () => {
    api.convertTaskRequest.mockReset().mockResolvedValue({ display_id: 'TASK-7' });
    await openConvertForm();
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Task TASK-7로 전환했습니다.'));
  });

  // R2 (Astra P2-3) — after a successful picker read, a denied refetch must
  // win over the data React Query retains: the cached titles leave the
  // options, the denial reason is surfaced (distinct from an empty list), and
  // a selection made from the retained cache cannot be submitted.
  it('hides retained options, shows the denial, and blocks the retained selection after a 403 refetch', async () => {
    vi.mocked(listMilestones)
      .mockResolvedValueOnce({
        items: MILESTONES.filter(
          (milestone) =>
            milestone.primary_managed_system_id === taskRequest.primary_managed_system_id,
        ),
      })
      .mockRejectedValue(
        new ApiError(403, { code: 'permission.denied', message: 'finding.manage required' }),
      );
    const { queryClient } = await openConvertFormReturnsClient();
    const select = screen.getByRole('combobox', { name: 'Milestone' });
    await chooseOption('Milestone', milestoneForRequestSystem.title);

    await queryClient.invalidateQueries({
      queryKey: ['milestones', taskRequest.primary_managed_system_id],
    });
    // The retained titles leave the UI, and the denial is distinguishable
    // from an empty list.
    expect(await screen.findByText('권한이 없습니다.')).toBeInTheDocument();
    fireEvent.click(select);
    expect(
      screen.queryByRole('option', { name: milestoneForRequestSystem.title }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    // The retained selection cannot ride: submitting it would convert with a
    // Milestone the actor can no longer even see. (Call history accumulates
    // across tests in this file, so assert on the delta.)
    const callsBeforeSubmit = api.convertTaskRequest.mock.calls.length;
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    await Promise.resolve();
    expect(api.convertTaskRequest.mock.calls.length).toBe(callsBeforeSubmit);
  });

  it('shows generic unavailability distinctly and still converts with an explicit None', async () => {
    vi.mocked(listMilestones)
      .mockResolvedValueOnce({
        items: MILESTONES.filter(
          (milestone) =>
            milestone.primary_managed_system_id === taskRequest.primary_managed_system_id,
        ),
      })
      .mockRejectedValue(new ApiError(500, { code: 'internal.unexpected', message: 'boom' }));
    const { queryClient } = await openConvertFormReturnsClient();
    await chooseOption('Milestone', milestoneForRequestSystem.title);

    await queryClient.invalidateQueries({
      queryKey: ['milestones', taskRequest.primary_managed_system_id],
    });

    // A generic outage is not a permission denial.
    expect(await screen.findByText('Milestone 목록을 불러올 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('finding.manage required')).not.toBeInTheDocument();

    // None is an explicit choice, not a retained selection: the form stays
    // usable and converts without a Milestone.
    await chooseOption('Milestone', '없음');
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    await waitFor(() => {
      expect(api.convertTaskRequest).toHaveBeenCalledWith(
        taskRequest.id,
        expect.objectContaining({ milestone_id: null }),
        expect.any(String),
      );
    });
  });

  // R2 followup (midreview P2) — with the options suppressed, the native
  // select silently falls back to its first option (None) while the
  // controlled value still names the removed Milestone: the visible choice
  // lies, the guard blocks submission, and a real user cannot pick None
  // again because it is already displayed. The unavailable selection keeps a
  // disabled slot (never its identity) so the select is honest and choosing
  // None is a real, reachable change.
  it('shows the unavailable selection honestly and lets the user deliberately fall back to None', async () => {
    vi.mocked(listMilestones)
      .mockResolvedValueOnce({
        items: MILESTONES.filter(
          (milestone) =>
            milestone.primary_managed_system_id === taskRequest.primary_managed_system_id,
        ),
      })
      .mockRejectedValue(
        new ApiError(403, { code: 'permission.denied', message: 'finding.manage required' }),
      );
    const { queryClient } = await openConvertFormReturnsClient();
    const select = screen.getByRole('combobox', { name: 'Milestone' });
    await chooseOption('Milestone', milestoneForRequestSystem.title);

    await queryClient.invalidateQueries({
      queryKey: ['milestones', taskRequest.primary_managed_system_id],
    });
    expect(await screen.findByText('권한이 없습니다.')).toBeInTheDocument();

    // The held selection keeps a disabled, identity-free slot: the select
    // shows what is actually held instead of pretending it is None.
    fireEvent.click(select);
    const unavailable = await screen.findByRole('option', { name: '확인할 수 없음' });
    expect(unavailable).toHaveAttribute('aria-disabled', 'true');
    expect(unavailable.textContent).not.toContain(milestoneForRequestSystem.title);
    expect(unavailable.textContent).not.toContain('MLS-3001');
    expect(select).toHaveValue(milestoneForRequestSystem.id);

    // A real user recovers by choosing None while the held selection is
    // displayed as unavailable.
    fireEvent.click(screen.getByRole('option', { name: '없음' }));
    expect(select).toHaveValue('');
    fireEvent.click(select);
    expect(screen.queryByRole('option', { name: '확인할 수 없음' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    // The deliberate None converts with an explicit null payload.
    const callsBeforeSubmit = api.convertTaskRequest.mock.calls.length;
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    await waitFor(() => {
      expect(api.convertTaskRequest.mock.calls.length).toBe(callsBeforeSubmit + 1);
    });
    expect(api.convertTaskRequest).toHaveBeenLastCalledWith(
      taskRequest.id,
      expect.objectContaining({ milestone_id: null }),
      expect.any(String),
    );
  });

  // R4 (Astra P2-2) — a successful refresh may legitimately omit the selected
  // Milestone (the list filters rows the actor can no longer see) without any
  // error: the option disappears but the held id used to survive invisibly
  // and submission still sent it. It is treated exactly like the error-path
  // unavailable selection: identity-free placeholder, blocked submit, and an
  // explicit None recovers.
  it('treats a selection omitted by a successful refetch as unavailable and blocks submit', async () => {
    vi.mocked(listMilestones)
      .mockResolvedValueOnce({
        items: MILESTONES.filter(
          (milestone) =>
            milestone.primary_managed_system_id === taskRequest.primary_managed_system_id,
        ),
      })
      .mockResolvedValue({ items: [] });
    const { queryClient } = await openConvertFormReturnsClient();
    const select = screen.getByRole('combobox', { name: 'Milestone' });
    await chooseOption('Milestone', milestoneForRequestSystem.title);

    await queryClient.invalidateQueries({
      queryKey: ['milestones', taskRequest.primary_managed_system_id],
    });

    // The row is gone from a 200 response: the held selection keeps its
    // identity-free slot and the select stays honest.
    await waitFor(() => {
      expect(
        screen.queryByRole('option', { name: milestoneForRequestSystem.title }),
      ).not.toBeInTheDocument();
    });
    fireEvent.click(select);
    const unavailable = await screen.findByRole('option', { name: '확인할 수 없음' });
    expect(unavailable).toHaveAttribute('aria-disabled', 'true');
    expect(unavailable.textContent).not.toContain(milestoneForRequestSystem.title);
    expect(select).toHaveValue(milestoneForRequestSystem.id);

    // Submitting the invisible held id is blocked; explicit None converts.
    const callsBeforeSubmit = api.convertTaskRequest.mock.calls.length;
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    await Promise.resolve();
    expect(api.convertTaskRequest.mock.calls.length).toBe(callsBeforeSubmit);

    fireEvent.click(screen.getByRole('option', { name: '없음' }));
    expect(select).toHaveValue('');
    fireEvent.click(screen.getByTestId('task-request-convert-submit'));
    await waitFor(() => {
      expect(api.convertTaskRequest.mock.calls.length).toBe(callsBeforeSubmit + 1);
    });
    expect(api.convertTaskRequest).toHaveBeenLastCalledWith(
      taskRequest.id,
      expect.objectContaining({ milestone_id: null }),
      expect.any(String),
    );
  });
});

async function openConvertFormReturnsClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  taskRequest.requested_outcome = requestedOutcome225;
  render(
    <QueryClientProvider client={queryClient}>
      <TaskRequestsRoute selectedParam={taskRequest.id} />
    </QueryClientProvider>,
  );
  await screen.findByText('REQ-42');
  fireEvent.click(screen.getByRole('button', { name: 'Task로 전환' }));
  await screen.findByTestId('task-request-convert-title-input');
  return { queryClient };
}
