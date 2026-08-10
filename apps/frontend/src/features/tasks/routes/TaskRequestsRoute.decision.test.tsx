import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

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
vi.mock('@/features/integration/hooks/useFindingDetail', () => ({
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
  await screen.findByText('Review decision');
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
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens approval without invoking window.prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    await openDialog('Approve', 'Approve Task Request');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('approves another actor request without an optional reason', async () => {
    await openDialog('Approve', 'Approve Task Request');
    fireEvent.click(screen.getByRole('button', { name: 'Approve Task Request' }));
    await waitFor(() => expectDecisionCall(api.approveTaskRequest, {}));
  });

  it('trims an approval reason for another actor request', async () => {
    await openDialog('Approve', 'Approve Task Request');
    fireEvent.change(screen.getByRole('textbox', { name: 'Approval reason' }), {
      target: { value: '  Ready for execution.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve Task Request' }));
    await waitFor(() =>
      expectDecisionCall(api.approveTaskRequest, { reason: 'Ready for execution.' }),
    );
  });

  it('keeps a self-approval dialog open when its reason is blank', async () => {
    setActor(requesterId);
    await openDialog('Approve', 'Approve Task Request');
    fireEvent.change(screen.getByRole('textbox', { name: 'Self-approval reason' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve Task Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Self-approval requires a reason.');
    expect(screen.getByRole('dialog', { name: 'Approve Task Request' })).toBeInTheDocument();
    expect(api.approveTaskRequest).not.toHaveBeenCalled();
  });

  it('cancels without dispatching a mutation', async () => {
    await openDialog('Approve', 'Approve Task Request');
    fireEvent.click(screen.getByTestId('task-request-decision-cancel'));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Approve Task Request' }),
      ).not.toBeInTheDocument(),
    );
    expect(api.approveTaskRequest).not.toHaveBeenCalled();
  });

  it('validates and trims rejection reasons', async () => {
    await openDialog('Reject', 'Reject Task Request');
    fireEvent.click(screen.getByRole('button', { name: 'Reject Task Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reason is required.');
    expect(api.rejectTaskRequest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reject reason' }), {
      target: { value: '  Out of scope.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject Task Request' }));
    await waitFor(() => expectDecisionCall(api.rejectTaskRequest, { reason: 'Out of scope.' }));
  });

  it('validates and trims evidence notes', async () => {
    await openDialog('Need evidence', 'Request more evidence');
    fireEvent.click(screen.getByRole('button', { name: 'Request evidence' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Note is required.');
    expect(api.requestMoreEvidenceForTaskRequest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Evidence note' }), {
      target: { value: '  Add source metrics.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request evidence' }));
    await waitFor(() =>
      expectDecisionCall(api.requestMoreEvidenceForTaskRequest, { note: 'Add source metrics.' }),
    );
  });

  it('locks duplicate submissions while a decision is pending', async () => {
    let resolveApproval: (value: TaskRequestDto) => void = () => undefined;
    api.approveTaskRequest.mockImplementationOnce(
      () =>
        new Promise<TaskRequestDto>((resolve) => {
          resolveApproval = resolve;
        }),
    );
    await openDialog('Approve', 'Approve Task Request');
    const submit = screen.getByRole('button', { name: 'Approve Task Request' });
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
    await openDialog('Approve', 'Approve Task Request');
    fireEvent.click(screen.getByRole('button', { name: 'Approve Task Request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Approval was rejected by the server.',
    );
    expect(screen.getByRole('dialog', { name: 'Approve Task Request' })).toBeInTheDocument();
  });
});
