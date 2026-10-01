import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestsRoute } from './TaskRequestsRoute';

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
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: undefined,
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
vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: () => ({ data: null }),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: taskRequest.primary_managed_system_id, name: 'Billing Ops' }],
  })),
}));
vi.mock('@/lib/api', () => ({
  approveTaskRequest: api.approveTaskRequest,
  convertTaskRequest: vi.fn(),
  fetchMe: api.fetchMe,
  fetchPermissionCheck: api.fetchPermissionCheck,
  fetchTaskRequests: api.fetchTaskRequests,
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
}

async function mountRoute() {
  renderRoute();
  await screen.findByText('검토 결정');
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

  it('shows a Korean success toast after a decision', async () => {
    const dialog = await openDialog('승인', 'Task Request 승인');
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Task Request가 처리되었습니다.'),
    );
  });

  it.each([
    {
      action: 'approve',
      button: '승인',
      dialog: 'Task Request 승인',
      status: 'approved',
      tab: '승인됨',
    },
    {
      action: 'reject',
      button: '반려',
      dialog: 'Task Request 반려',
      status: 'rejected',
      tab: '반려됨',
    },
    {
      action: 'request-evidence',
      button: '근거 추가 요청',
      dialog: '근거 추가 요청',
      status: 'needs_more_evidence',
      tab: '근거 추가 필요',
    },
  ] as const)(
    'AC-681-5 follows the $action result and keeps the Task Request selected',
    async ({ action, button, dialog, status, tab }) => {
      const updatedItem: TaskRequestDto = { ...taskRequest, status };
      await mountRoute();
      api.fetchTaskRequests.mockResolvedValue({ items: [updatedItem] });
      const mutation =
        action === 'approve'
          ? api.approveTaskRequest
          : action === 'reject'
            ? api.rejectTaskRequest
            : api.requestMoreEvidenceForTaskRequest;
      mutation.mockResolvedValue(updatedItem);

      fireEvent.click(screen.getByRole('button', { name: button }));
      await screen.findByRole('dialog', { name: dialog });
      if (action === 'reject') {
        fireEvent.change(screen.getByRole('textbox', { name: '반려 사유' }), {
          target: { value: 'Out of scope.' },
        });
        fireEvent.click(screen.getByRole('button', { name: '반려' }));
      } else if (action === 'request-evidence') {
        fireEvent.change(screen.getByRole('textbox', { name: '근거 메모' }), {
          target: { value: 'Add source metrics.' },
        });
        fireEvent.click(screen.getByRole('button', { name: '요청' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: '승인' }));
      }

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: new RegExp(tab) })).toHaveAttribute(
          'aria-selected',
          'true',
        );
        expect(
          screen
            .getByRole('button', { name: /REQ-1071/ })
            .querySelector('[data-testid="object-row-selected-bar"]'),
        ).toBeInTheDocument();
      });
    },
  );

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
