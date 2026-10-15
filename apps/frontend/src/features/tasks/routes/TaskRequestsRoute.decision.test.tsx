import { getTaskRequest } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import { taskRequestPage } from '@/test/task-request-pages';
import type { ListTaskRequestsQuery } from '@fops/shared';
import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestsRoute } from './TaskRequestsRoute';
import {
  type DecisionDialogState,
  TaskRequestDecisionDialog,
} from './task-requests/TaskRequestDecisionDialog';

const api = vi.hoisted(() => ({
  approveTaskRequest: vi.fn(),
  fetchMe: vi.fn(),
  fetchPermissionCheck: vi.fn(),
  fetchTaskRequests: vi.fn(),
  rejectTaskRequest: vi.fn(),
  requestMoreEvidenceForTaskRequest: vi.fn(),
  resolveActors: vi.fn(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));

const requesterId = '20000000-0000-0000-0000-000000000002';
const reviewerId = '60000000-0000-0000-0000-000000000006';
const taskRequest: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-1071',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: 'Evidence summary',
  requested_outcome: 'Review the candidate task',
  requester_actor_id: requesterId,
  status: 'pending_review',
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: undefined,
};
const otherTaskRequest: TaskRequestDto = {
  ...taskRequest,
  id: '10000000-0000-0000-0000-000000000002',
  display_id: 'REQ-1072',
  requested_outcome: 'Review the other candidate task',
};

vi.mock('sonner', () => ({ toast }));
vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    ListShell: ({
      list,
      detailPanel,
    }: { list: React.ReactNode; detailPanel?: React.ReactNode }) => (
      <div>
        <main>{list}</main>
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});
vi.mock('@/features/findings/public', () => ({
  useFindingDetail: () => ({ data: null }),
}));
vi.mock('@/lib/api/entity-links', () => ({
  fetchTaskRequestEntityLinks: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: taskRequest.primary_managed_system_id, name: 'Billing Ops' }],
  })),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  approveTaskRequest: api.approveTaskRequest,
  convertTaskRequest: vi.fn(),
  fetchMe: api.fetchMe,
  fetchPermissionCheck: api.fetchPermissionCheck,
  fetchTaskRequests: async (options: ListTaskRequestsQuery) => {
    const result = await api.fetchTaskRequests(options);
    return result.page ? result : taskRequestPage(result.items, options);
  },
  getTaskRequest: vi.fn(async () => taskRequest),
  linkExistingTask: vi.fn(),
  listTasks: vi.fn(async () => ({ items: [] })),
  rejectTaskRequest: api.rejectTaskRequest,
  requestMoreEvidenceForTaskRequest: api.requestMoreEvidenceForTaskRequest,
  resolveActors: api.resolveActors,
}));

function setActor(id: string) {
  api.fetchMe.mockResolvedValue({
    actor: {
      id,
      external_id: 'mock-admin',
      email: 'admin@feedbackops.local',
      display_name: 'Mock Admin',
      role_level: 'admin',
    },
    workspace_id: taskRequest.workspace_id,
  });
}

function renderRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TaskRequestsRoute selectedParam={taskRequest.id} />
    </QueryClientProvider>,
  );
  return queryClient;
}

async function mountRoute() {
  renderRoute();
  await screen.findByRole('heading', { name: '검토 결정' });
}

async function openDialog(buttonName: string, dialogName: string) {
  await mountRoute();
  fireEvent.click(screen.getByRole('button', { name: buttonName }));
  return screen.findByRole('dialog', { name: dialogName });
}

function expectDecisionCall(mock: ReturnType<typeof vi.fn>, payload: object) {
  expect(mock).toHaveBeenCalledTimes(1);
  expect(mock).toHaveBeenCalledWith(taskRequest.id, payload, expect.any(String));
}

describe('TaskRequestsRoute decision dialogs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.approveTaskRequest.mockReset();
    api.fetchMe.mockReset();
    api.fetchPermissionCheck.mockReset();
    api.fetchTaskRequests.mockReset();
    api.rejectTaskRequest.mockReset();
    api.requestMoreEvidenceForTaskRequest.mockReset();
    api.resolveActors.mockReset();
    api.fetchTaskRequests.mockResolvedValue({ items: [taskRequest] });
    api.fetchPermissionCheck.mockResolvedValue({ state: 'approved' });
    api.resolveActors.mockResolvedValue({ actors: [], teams: [] });
    api.approveTaskRequest.mockResolvedValue(taskRequest);
    api.rejectTaskRequest.mockResolvedValue(taskRequest);
    api.requestMoreEvidenceForTaskRequest.mockResolvedValue(taskRequest);
    setActor(reviewerId);
    toast.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps a rate-limit alert without marking the reason invalid', async () => {
    api.approveTaskRequest.mockRejectedValue(
      new ApiError(429, {
        code: 'rate_limited.actor',
        message: 'rate limit exceeded',
        detail: { retry_after_seconds: 30 },
      }),
    );
    const dialog = await openDialog('승인', 'Task Request 승인');
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await within(dialog).findByRole('alert');
    expect(within(dialog).getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
  });

  it('discards retained content and focuses the blocked heading after post-decision denial', async () => {
    api.resolveActors.mockResolvedValue({
      actors: [
        { id: requesterId, display_name: 'Retained requester', email: 'requester@example.test' },
      ],
      teams: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskRequestsRoute />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: '검토 결정' });
    await screen.findAllByText('Retained requester');
    api.approveTaskRequest.mockResolvedValue({ ...taskRequest, status: 'approved' });
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog');
    api.fetchTaskRequests.mockRejectedValue(
      new ApiError(403, {
        code: 'permission.denied',
        message: 'Denied',
      }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    const heading = await screen.findByRole('heading', { name: 'Task Request queue' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(dialog).not.toBeInTheDocument();
    expect(screen.queryByText(taskRequest.requested_outcome)).not.toBeInTheDocument();
    expect(screen.queryByText(taskRequest.evidence_summary)).not.toBeInTheDocument();
    expect(screen.queryByText('Retained requester')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '출처 Finding' })).not.toBeInTheDocument();
  });

  it('keeps the clicked status tab focused through a cold fetch and cached arrow navigation', async () => {
    const user = userEvent.setup();
    let resolvePage!: (value: { items: TaskRequestDto[] }) => void;
    api.fetchTaskRequests.mockImplementation((options: ListTaskRequestsQuery) =>
      options.status === 'approved'
        ? new Promise((resolve) => {
            resolvePage = resolve;
          })
        : Promise.resolve({ items: [taskRequest] }),
    );
    await mountRoute();
    const tab = screen.getByRole('tab', { name: /^승인됨/ });
    await user.click(tab);
    expect(document.activeElement).toBe(tab);
    expect(tab.isConnected).toBe(true);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    await act(async () => resolvePage({ items: [] }));
    expect(document.activeElement).toBe(tab);
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      const previousTab = screen.getByRole('tab', { name: /^근거 추가 필요/ });
      expect(document.activeElement).toBe(previousTab);
      expect(previousTab).toHaveAttribute('aria-selected', 'true');
    });
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(document.activeElement).toBe(tab);
      expect(tab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it.each([
    ...(['approved', 'rejected', 'needs_more_evidence'] as const).flatMap((status) =>
      [false, true].flatMap((last) => [false, true].map((delayed) => ({ status, last, delayed }))),
    ),
  ])(
    'keeps current tab and hands focus to next row: $status last=$last delayed=$delayed',
    async ({ status, last, delayed }) => {
      const third = {
        ...taskRequest,
        id: taskRequest.id.replace(/1$/, '3'),
        display_id: 'REQ-1073',
      };
      const rows = [otherTaskRequest, taskRequest, third];
      if (last) rows.splice(0, 3, third, otherTaskRequest, taskRequest);
      api.fetchTaskRequests.mockResolvedValue({ items: rows });
      const mutation =
        status === 'approved'
          ? api.approveTaskRequest
          : status === 'rejected'
            ? api.rejectTaskRequest
            : api.requestMoreEvidenceForTaskRequest;
      mutation.mockResolvedValue({ ...taskRequest, status });
      renderRoute();
      await screen.findByRole('heading', { name: '검토 결정' });
      let resolvePage!: (value: { items: TaskRequestDto[] }) => void;
      api.fetchTaskRequests.mockImplementation(() =>
        delayed
          ? new Promise((resolve) => {
              resolvePage = resolve;
            })
          : Promise.resolve({ items: rows.filter((row) => row.id !== taskRequest.id) }),
      );
      const action =
        status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '근거 추가 요청';
      fireEvent.click(screen.getByRole('button', { name: action }));
      const dialog = await screen.findByRole('dialog');
      if (status !== 'approved')
        fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '검토 완료' } });
      const focused: EventTarget[] = [];
      const handoffConnected: boolean[] = [];
      const removedFocus: Element[] = [];
      const record = (event: FocusEvent) => {
        if (event.target) focused.push(event.target);
        if (
          event.target instanceof HTMLElement &&
          event.target.textContent?.includes(last ? 'REQ-1072' : 'REQ-1073')
        )
          handoffConnected.push(dialog.isConnected);
      };
      const observer = new MutationObserver(() => {
        if (!dialog.isConnected && document.activeElement)
          removedFocus.push(document.activeElement);
      });
      document.addEventListener('focusin', record);
      observer.observe(document.body, { childList: true, subtree: true });
      try {
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: status === 'needs_more_evidence' ? '요청' : action,
          }),
        );
        await waitFor(() => expect(dialog).not.toBeInTheDocument());
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        const row = screen.getByRole('button', { name: last ? /REQ-1072/ : /REQ-1073/ });
        expect(row).toHaveFocus();
        expect(row.querySelector('[data-testid="object-row-selected-bar"]')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /^검토 대기/ })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        expect(handoffConnected[0]).toBe(true);
        expect(removedFocus.length).toBeGreaterThan(0);
        expect(removedFocus).not.toContain(document.body);
        expect(focused).not.toContain(document.body);
        if (delayed)
          await act(async () =>
            resolvePage({ items: rows.filter((item) => item.id !== taskRequest.id) }),
          );
        expect(row).toHaveFocus();
      } finally {
        observer.disconnect();
        document.removeEventListener('focusin', record);
      }
    },
  );

  it.each(['needs_more_evidence', 'all'] as const)(
    'keeps %s membership and selection after approval',
    async (tab) => {
      const request = { ...taskRequest, status: 'needs_more_evidence' as const };
      vi.mocked(getTaskRequest).mockResolvedValueOnce(request);
      api.fetchTaskRequests.mockResolvedValue({
        items: [request, { ...otherTaskRequest, status: 'needs_more_evidence' }],
      });
      renderRoute();
      await screen.findByRole('heading', { name: '검토 결정' });
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /^근거 추가 필요/ })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      if (tab === 'all') {
        fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
        fireEvent.click(await screen.findByRole('button', { name: /REQ-1071/ }));
      }
      api.approveTaskRequest.mockResolvedValue({ ...request, status: 'approved' });
      api.fetchTaskRequests.mockResolvedValue({
        items: [
          { ...request, status: 'approved' },
          { ...otherTaskRequest, status: 'needs_more_evidence' },
        ],
      });
      fireEvent.click(screen.getByRole('button', { name: '승인' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(
        screen.getByRole('tab', { name: tab === 'all' ? /^전체/ : /^근거 추가 필요/ }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        screen.getByRole('button', { name: tab === 'all' ? /REQ-1071/ : /REQ-1072/ }),
      ).toHaveFocus();
    },
  );

  it('retains an animated successful dialog until next-row focus is connected', async () => {
    api.fetchTaskRequests.mockResolvedValue({ items: [taskRequest, otherTaskRequest] });
    api.approveTaskRequest.mockResolvedValue({ ...taskRequest, status: 'approved' });
    await mountRoute();
    const getStyles = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const styles = getStyles(element, pseudo);
      if (element.getAttribute('role') === 'dialog')
        Object.defineProperty(styles, 'animationName', {
          get: () =>
            element.getAttribute('data-state') === 'open' ? 'decision-enter' : 'decision-exit',
        });
      return styles;
    });
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog');
    api.fetchTaskRequests.mockResolvedValue({
      items: [{ ...taskRequest, status: 'approved' }, otherTaskRequest],
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /REQ-1072/, hidden: true })).toHaveFocus(),
    );
    expect(dialog.isConnected).toBe(true);
    expect(dialog).toHaveAttribute('data-state', 'closed');
    const end = new Event('animationend', { bubbles: true });
    Object.defineProperty(end, 'animationName', { value: 'decision-exit' });
    fireEvent(dialog, end);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('button', { name: /REQ-1072/ })).toHaveFocus();
  });

  it('opens approval without invoking window.prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    await openDialog('승인', 'Task Request 승인');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('shows a Korean required marker in the decision dialog', async () => {
    await openDialog('반려', 'Task Request 반려');

    expect(screen.getByText('필수 입력 항목입니다.')).toBeInTheDocument();
    expect(screen.queryByText('Required.')).not.toBeInTheDocument();
  });

  it('approves another actor request without an optional reason', async () => {
    await openDialog('승인', 'Task Request 승인');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() => expectDecisionCall(api.approveTaskRequest, {}));
  });

  it.each([
    ['승인', 'Task Request 승인', '승인', '승인했습니다. Task로 전환할 수 있습니다.'],
    ['반려', 'Task Request 반려', '반려', '반려했습니다.'],
    ['근거 추가 요청', '근거 추가 요청', '요청', '추가 근거를 요청했습니다.'],
  ])('shows the exact %s success toast', async (action, title, submit, message) => {
    const dialog = await openDialog(action, title);
    if (action !== '승인')
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '검토 메모' } });
    fireEvent.click(within(dialog).getByRole('button', { name: submit }));
    await waitFor(() => expect(toast.success.mock.calls[0]?.[0]).toEqual(message));
  });

  it.each(['approved', 'rejected', 'needs_more_evidence'] as const)(
    'shows truthful empty heading after sole %s',
    async (status) => {
      const mutation =
        status === 'approved'
          ? api.approveTaskRequest
          : status === 'rejected'
            ? api.rejectTaskRequest
            : api.requestMoreEvidenceForTaskRequest;
      mutation.mockResolvedValue({ ...taskRequest, status });
      await mountRoute();
      const action =
        status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '근거 추가 요청';
      fireEvent.click(screen.getByRole('button', { name: action }));
      const dialog = await screen.findByRole('dialog');
      if (status !== 'approved')
        fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '검토 완료' } });
      api.fetchTaskRequests.mockResolvedValue({ items: [{ ...taskRequest, status }] });
      fireEvent.click(
        within(dialog).getByRole('button', {
          name: status === 'needs_more_evidence' ? '요청' : action,
        }),
      );
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.getByRole('tab', { name: /^검토 대기/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(
        screen.getByRole('heading', { name: '검토 대기 중인 Task Request가 없습니다' }),
      ).toHaveFocus();
    },
  );

  it.each([
    ['승인', 'Task Request 승인', '승인', 'approved'],
    ['반려', 'Task Request 반려', '반려', 'rejected'],
    ['근거 추가 요청', '근거 추가 요청', '요청', 'needs_more_evidence'],
  ] as const)(
    'keeps %s submit focused while pending and ignores a second Enter',
    async (action, title, label, status) => {
      const user = userEvent.setup();
      const mutation =
        status === 'approved'
          ? api.approveTaskRequest
          : status === 'rejected'
            ? api.rejectTaskRequest
            : api.requestMoreEvidenceForTaskRequest;
      let resolveDecision!: (value: TaskRequestDto) => void;
      mutation.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDecision = resolve;
          }),
      );
      const dialog = await openDialog(action, title);
      if (status !== 'approved') await user.type(within(dialog).getByRole('textbox'), '검토 메모');
      const submit = within(dialog).getByRole('button', { name: label });
      submit.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'));
      // jsdom does not blur a newly disabled button as Chromium does; pin focusability too.
      expect(submit).not.toBeDisabled();
      expect(submit).toHaveFocus();
      await user.keyboard('{Enter}');
      await act(async () => {
        await Promise.resolve();
      });
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(submit).toHaveFocus();
      await act(async () => resolveDecision({ ...taskRequest, status }));
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
    },
  );

  it('retains loading and retry instead of declaring an empty queue before the remaining page arrives', async () => {
    let decided = false;
    let failNext = true;
    let resolvePage!: (value: object) => void;
    api.fetchTaskRequests.mockImplementation(async (options: ListTaskRequestsQuery) => {
      if (options.limit === 1) return taskRequestPage([taskRequest, otherTaskRequest]);
      if (options.cursor) {
        if (failNext) throw new Error('later page unavailable');
        return new Promise((resolve) => {
          resolvePage = resolve;
        });
      }
      return { items: decided ? [] : [taskRequest], page: { has_more: true, cursor: 'remaining' } };
    });
    api.approveTaskRequest.mockImplementation(async () => {
      decided = true;
      return { ...taskRequest, status: 'approved' };
    });
    await mountRoute();
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await within(dialog).findByRole('alert', {}, { timeout: 5000 });
    expect(within(dialog).getByTestId('task-request-decision-cancel')).toBeDisabled();
    expect(screen.queryByText('검토 대기 중인 Task Request가 없습니다')).not.toBeInTheDocument();
    failNext = false;
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(resolvePage).toBeTypeOf('function'));
    expect(dialog.isConnected).toBe(true);
    expect(screen.queryByText('검토 대기 중인 Task Request가 없습니다')).not.toBeInTheDocument();
    await act(async () => resolvePage({ items: [otherTaskRequest], page: { has_more: false } }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('button', { name: /REQ-1072/ })).toHaveFocus();
  });

  it('fetches remaining pages before claiming an emptied loaded queue is empty', async () => {
    let decided = false;
    api.fetchTaskRequests.mockImplementation(async (options: ListTaskRequestsQuery) => {
      if (options.limit === 1) return taskRequestPage([taskRequest, otherTaskRequest]);
      if (options.cursor)
        return { items: [otherTaskRequest], page: { has_more: false, cursor: null } };
      return {
        items: decided ? [] : [taskRequest],
        page: { has_more: true, cursor: 'pending-next' },
      };
    });
    api.approveTaskRequest.mockImplementation(async () => {
      decided = true;
      return { ...taskRequest, status: 'approved' };
    });
    await mountRoute();
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /REQ-1072/ })).toHaveFocus());
    expect(api.fetchTaskRequests).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'pending-next', status: 'pending_review' }),
    );
    expect(screen.queryByText('검토 대기 중인 Task Request가 없습니다')).not.toBeInTheDocument();
  });

  it('AC-681-1 does not replay an old decision after a converted request is revisited', async () => {
    const approvedItem: TaskRequestDto = {
      ...taskRequest,
      status: 'approved',
      assigned_reviewer_actor_id: null,
      assigned_reviewer_team_id: null,
      reviewer_actor_id: reviewerId,
      decided_at: '2026-07-10T01:00:00.000Z',
    };
    const convertedItem: TaskRequestDto = { ...approvedItem, status: 'converted' };
    api.fetchTaskRequests.mockResolvedValue({ items: [taskRequest, otherTaskRequest] });
    api.approveTaskRequest.mockResolvedValue(approvedItem);
    const queryClient = renderRoute();
    await screen.findByRole('heading', { name: '검토 결정' });

    api.fetchTaskRequests.mockResolvedValue({ items: [approvedItem, otherTaskRequest] });
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog', { name: 'Task Request 승인' });
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^검토 대기/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
    await waitFor(() => {
      expect(
        queryClient.getQueryState(['task-requests', undefined, 'pages', 'pending_review'])
          ?.fetchStatus,
      ).toBe('idle');
    });

    api.fetchTaskRequests.mockResolvedValue({ items: [convertedItem, otherTaskRequest] });
    queryClient.setQueryData(['task-request', taskRequest.id], convertedItem);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
    fireEvent.click(await screen.findByRole('button', { name: /REQ-1072/ }));
    fireEvent.click(screen.getByRole('button', { name: /REQ-1071/ }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^전체/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: /REQ-1071/ })).toHaveTextContent('전환됨');
    });
  });

  it('trims an approval reason for another actor request', async () => {
    await openDialog('승인', 'Task Request 승인');
    fireEvent.change(screen.getByRole('textbox', { name: '승인 사유' }), {
      target: { value: '  Ready for execution.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() =>
      expectDecisionCall(api.approveTaskRequest, { reason: 'Ready for execution.' }),
    );
  });

  it.each([
    {
      action: 'approve-self',
      buttonName: '승인',
      dialogName: 'Task Request 승인',
      textboxName: '본인 승인 사유',
      message: '본인 승인 사유를 입력해 주세요.',
      actorId: requesterId,
      submitName: '승인',
      value: '검토를 마쳤습니다.',
      mock: 'approve',
      payload: { reason: '검토를 마쳤습니다.' },
    },
    {
      action: 'request-more-evidence',
      buttonName: '근거 추가 요청',
      dialogName: '근거 추가 요청',
      textboxName: '근거 메모',
      message: '근거 메모를 입력해 주세요.',
      actorId: null,
      submitName: '요청',
      value: '추가 지표를 확인해 주세요.',
      mock: 'evidence',
      payload: { note: '추가 지표를 확인해 주세요.' },
    },
    {
      action: 'reject',
      buttonName: '반려',
      dialogName: 'Task Request 반려',
      textboxName: '반려 사유',
      message: '반려 사유를 입력해 주세요.',
      actorId: null,
      submitName: '반려',
      value: '범위에 포함되지 않습니다.',
      mock: 'reject',
      payload: { reason: '범위에 포함되지 않습니다.' },
    },
  ])('validates empty $action input in Korean and submits a trimmed value', async (scenario) => {
    if (scenario.actorId) setActor(scenario.actorId);
    const dialog = await openDialog(scenario.buttonName, scenario.dialogName);
    fireEvent.click(within(dialog).getByRole('button', { name: scenario.submitName }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(scenario.message);
    expect(dialog).toBeInTheDocument();
    expect(api.approveTaskRequest).not.toHaveBeenCalled();
    expect(api.requestMoreEvidenceForTaskRequest).not.toHaveBeenCalled();
    expect(api.rejectTaskRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: scenario.textboxName }), {
      target: { value: `  ${scenario.value}  ` },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: scenario.submitName }));
    const mutation =
      scenario.mock === 'approve'
        ? api.approveTaskRequest
        : scenario.mock === 'evidence'
          ? api.requestMoreEvidenceForTaskRequest
          : api.rejectTaskRequest;
    await waitFor(() => expectDecisionCall(mutation, scenario.payload));
  });

  it('cancels without dispatching a mutation', async () => {
    await openDialog('승인', 'Task Request 승인');
    fireEvent.click(screen.getByTestId('task-request-decision-cancel'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Task Request 승인' })).not.toBeInTheDocument(),
    );
    expect(api.approveTaskRequest).not.toHaveBeenCalled();
  });

  it('locks duplicate submissions while a decision is pending', async () => {
    let resolveApproval: (value: TaskRequestDto) => void = () => undefined;
    api.approveTaskRequest.mockImplementationOnce(
      () =>
        new Promise<TaskRequestDto>((resolve) => {
          resolveApproval = resolve;
        }),
    );
    await openDialog('승인', 'Task Request 승인');
    const submit = screen.getByRole('button', { name: '승인' });
    // Both clicks land in one batch, so the pending state has not re-rendered the
    // button as disabled yet. The synchronous in-flight guard is the only defense
    // under test here — clicking with a flush in between would be caught by
    // `disabled` and would not exercise it.
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    expectDecisionCall(api.approveTaskRequest, {});
    resolveApproval(taskRequest);
  });

  it('closes on a request change and gives a new action fresh content and focus ownership', async () => {
    api.fetchTaskRequests.mockResolvedValue({ items: [taskRequest, otherTaskRequest] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (id: string) => (
      <QueryClientProvider client={queryClient}>
        <TaskRequestsRoute selectedParam={id} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(taskRequest.id));
    const oldOpener = await screen.findByRole('button', { name: '반려' });
    oldOpener.focus();
    fireEvent.click(oldOpener);
    const oldDialog = await screen.findByRole('dialog', { name: 'Task Request 반려' });
    fireEvent.change(within(oldDialog).getByRole('textbox'), { target: { value: 'old reason' } });
    rerender(view(otherTaskRequest.id));
    await waitFor(() => expect(oldDialog).not.toBeInTheDocument());
    const opener = screen.getByRole('button', { name: '근거 추가 요청' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: '근거 추가 요청' });
    expect(within(dialog).getByRole('textbox')).toHaveValue('');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('task-request-decision-cancel'));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('returns to the approve opener when rejection cleanup settles after approval opens', async () => {
    await mountRoute();
    const rejectOpener = screen.getByRole('button', { name: '반려' });
    const approveOpener = screen.getByRole('button', { name: '승인' });
    rejectOpener.focus();
    fireEvent.click(rejectOpener);
    const rejection = await screen.findByRole('dialog', { name: 'Task Request 반려' });
    fireEvent.click(within(rejection).getByTestId('task-request-decision-cancel'));
    // Open synchronously, before Radix's deferred unmount autofocus can run.
    approveOpener.focus();
    fireEvent.click(approveOpener);
    const approval = screen.getByRole('dialog', { name: 'Task Request 승인' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(within(approval).getByTestId('task-request-decision-cancel'));
    await waitFor(() => expect(approveOpener).toHaveFocus());
  });

  it('keeps pending-close guards and does not restore the opener after a successful decision', async () => {
    let resolveDecision: (value: TaskRequestDto) => void = () => undefined;
    api.rejectTaskRequest.mockImplementationOnce(
      () =>
        new Promise<TaskRequestDto>((resolve) => {
          resolveDecision = resolve;
        }),
    );
    await mountRoute();
    const opener = screen.getByRole('button', { name: '반려' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Task Request 반려' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'reason' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '반려' }));
    await waitFor(() =>
      expect(within(dialog).getByTestId('task-request-decision-cancel')).toBeDisabled(),
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(dialog).toHaveAttribute('data-state', 'open');
    await act(async () => resolveDecision(taskRequest));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(opener).not.toHaveFocus();
  });

  it.each(['Escape', 'Cancel', 'close icon', 'outside'])(
    'returns focus to the decision opener after %s',
    async (dismissal) => {
      await mountRoute();
      const opener = screen.getByRole('button', { name: '반려' });
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole('dialog', { name: 'Task Request 반려' });
      if (dismissal === 'Escape') fireEvent.keyDown(dialog, { key: 'Escape' });
      else if (dismissal === 'Cancel') {
        fireEvent.click(within(dialog).getByTestId('task-request-decision-cancel'));
      } else if (dismissal === 'close icon') {
        fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
      } else {
        fireEvent.pointerDown(document.body, { button: 0 });
      }
      await waitFor(() => expect(opener).toHaveFocus());
    },
  );

  it.each(['Escape', 'Cancel'])(
    'retains the same decision content through the %s exit animation',
    async (dismissal) => {
      const getStyles = window.getComputedStyle.bind(window);
      // Presence stores styles at mount: a live name models compiled CSS for real Content.
      const fixture = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
        const styles = getStyles(element, pseudo);
        if (
          element.getAttribute('role') === 'dialog' &&
          element.querySelector('textarea[id^="task-request-"]')
        ) {
          Object.defineProperty(styles, 'animationName', {
            get: () =>
              element.getAttribute('data-state') === 'open' ? 'decision-enter' : 'decision-exit',
          });
        }
        return styles;
      });
      try {
        api.rejectTaskRequest.mockRejectedValueOnce(new Error('server failure'));
        await mountRoute();
        const opener = screen.getByRole('button', { name: '반려' });
        opener.focus();
        fireEvent.click(opener);
        const dialog = await screen.findByRole('dialog', { name: 'Task Request 반려' });
        fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '반려 메모' } });
        fireEvent.click(within(dialog).getByRole('button', { name: '반려' }));
        expect(await within(dialog).findByRole('alert')).toHaveTextContent(
          '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        );
        if (dismissal === 'Escape') fireEvent.keyDown(dialog, { key: 'Escape' });
        else fireEvent.click(within(dialog).getByTestId('task-request-decision-cancel'));
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveAttribute('data-state', 'closed');
        expect(
          within(dialog).getByRole('heading', { name: 'Task Request 반려' }),
        ).toBeInTheDocument();
        expect(within(dialog).getByRole('textbox')).toHaveValue('반려 메모');
        expect(within(dialog).getByRole('alert')).toHaveTextContent(
          '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        );
        const end = new Event('animationend', { bubbles: true });
        Object.defineProperty(end, 'animationName', { value: 'decision-exit' });
        fireEvent(dialog, end);
        await waitFor(() => expect(dialog).not.toBeInTheDocument());
        await waitFor(() => expect(opener).toHaveFocus());
      } finally {
        fixture.mockRestore();
      }
    },
  );

  it('keeps a dialog open and reports a server mutation failure', async () => {
    api.approveTaskRequest.mockRejectedValueOnce({
      envelope: { message: 'Approval was rejected by the server.' },
    });
    await openDialog('승인', 'Task Request 승인');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(screen.getByRole('dialog', { name: 'Task Request 승인' })).toBeInTheDocument();
  });
});

it('preserves the committed decision value and focus when a request transition is aborted', async () => {
  const neverResolves = new Promise<void>(() => {});
  let signalSuspended: () => void = () => {};
  const suspended = new Promise<void>((resolve) => {
    signalSuspended = resolve;
  });

  function SuspendingSibling({ request }: { request: TaskRequestDto }) {
    if (request === otherTaskRequest) {
      signalSuspended();
      throw neverResolves;
    }
    return <span data-testid="committed-request">{request.display_id}</span>;
  }

  function Driver() {
    const [selection, setSelection] = React.useState({ request: taskRequest, revision: 0 });
    const [dialog, setDialog] = React.useState<DecisionDialogState | null>(null);
    return (
      <>
        <button
          type="button"
          data-testid="open-decision"
          onClick={() =>
            setDialog({ requestId: taskRequest.id, action: 'reject', value: '', error: null })
          }
        >
          반려
        </button>
        <button
          type="button"
          data-testid="transition-request"
          onClick={() =>
            React.startTransition(() => setSelection({ request: otherTaskRequest, revision: 1 }))
          }
        >
          다른 요청
        </button>
        <button
          type="button"
          data-testid="urgent-request"
          onClick={() => setSelection({ request: taskRequest, revision: 2 })}
        >
          현재 요청 유지
        </button>
        <React.Suspense fallback={<span>request fallback</span>}>
          <TaskRequestDecisionDialog
            dialog={dialog}
            request={selection.request}
            isSelfApproval={false}
            isSubmitting={false}
            onChange={(value) => setDialog((current) => (current ? { ...current, value } : null))}
            onClose={() => setDialog(null)}
            onSubmit={(event) => event.preventDefault()}
          />
          <SuspendingSibling request={selection.request} />
        </React.Suspense>
      </>
    );
  }

  render(
    <React.StrictMode>
      <Driver />
    </React.StrictMode>,
  );
  const opener = screen.getByTestId('open-decision');
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog', { name: 'Task Request 반려' });
  const textbox = within(dialog).getByRole('textbox');
  fireEvent.change(textbox, { target: { value: 'committed reason' } });
  expect(textbox).toHaveFocus();

  await act(async () => {
    fireEvent.click(screen.getByTestId('transition-request'));
  });
  await suspended;
  expect(screen.queryByText('request fallback')).not.toBeInTheDocument();
  expect(screen.getByTestId('committed-request')).toHaveTextContent('REQ-1071');
  expect(dialog).toHaveAttribute('data-state', 'open');

  fireEvent.click(screen.getByTestId('urgent-request'));
  expect(dialog).toBeInTheDocument();
  expect(dialog).toHaveAttribute('data-state', 'open');
  expect(textbox).toHaveValue('committed reason');
  expect(textbox).toHaveFocus();
});

it.each(['new opening', 'new request'] as const)(
  'does not let a successful close timer steal focus from a %s',
  async (next) => {
    const user = userEvent.setup();
    const result: TaskRequestDto = { ...taskRequest, status: 'approved' };
    function Driver() {
      const [request, setRequest] = React.useState(taskRequest);
      const [completed, setCompleted] = React.useState<TaskRequestDto | null>(null);
      const [dialog, setDialog] = React.useState<DecisionDialogState | null>(null);
      const heading = React.useRef<HTMLHeadingElement>(null);
      return (
        <>
          <h3 ref={heading} tabIndex={-1}>
            검토 결정
          </h3>
          <button
            type="button"
            onClick={() =>
              setDialog({ requestId: request.id, action: 'approve', value: '', error: null })
            }
          >
            열기
          </button>
          <button type="button" onClick={() => setRequest(otherTaskRequest)}>
            다른 요청
          </button>
          <TaskRequestDecisionDialog
            key={request.id}
            request={request}
            completedResult={completed}
            getCompletedFocusTarget={() => heading.current}
            dialog={dialog}
            isSelfApproval={false}
            isSubmitting={false}
            onChange={() => {}}
            onClose={() => setDialog(null)}
            onSubmit={(event) => {
              event.preventDefault();
              setCompleted(result);
              setDialog(null);
            }}
          />
        </>
      );
    }
    render(<Driver />);
    await user.click(screen.getByRole('button', { name: '열기' }));
    const dialog = await screen.findByRole('dialog');
    vi.useFakeTimers();
    try {
      fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: '검토 결정' }));
      expect(dialog.isConnected).toBe(false);
      if (next === 'new request')
        fireEvent.click(screen.getByRole('button', { name: '다른 요청' }));
      const opener = screen.getByRole('button', { name: '열기' });
      opener.focus();
      fireEvent.click(opener);
      const newDialog = screen.getByRole('dialog');
      const focused = within(newDialog).getByRole('textbox');
      expect(document.activeElement).toBe(focused);
      await act(async () => vi.runOnlyPendingTimers());
      expect(document.activeElement).toBe(focused);
      fireEvent.keyDown(newDialog, { key: 'Escape' });
      await act(async () => vi.runOnlyPendingTimers());
      expect(document.activeElement).toBe(opener);
    } finally {
      vi.useRealTimers();
    }
  },
);
