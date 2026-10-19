import { TASK_REQUEST_COPY } from '@/lib/copy/task-requests';
import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskRequestDecision } from './useTaskRequestDecision';
import type { UseTaskRequestDecisionResult } from './useTaskRequestDecision';

const api = vi.hoisted(() => ({
  approveTaskRequest: vi.fn(),
  rejectTaskRequest: vi.fn(),
  requestMoreEvidenceForTaskRequest: vi.fn(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  approveTaskRequest: api.approveTaskRequest,
  rejectTaskRequest: api.rejectTaskRequest,
  requestMoreEvidenceForTaskRequest: api.requestMoreEvidenceForTaskRequest,
}));

const taskRequest: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-1071',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: 'Evidence summary',
  requested_outcome: 'Review the candidate task',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
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

function renderDecision() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    () =>
      useTaskRequestDecision({
        item: taskRequest,
        currentActorId: '60000000-0000-0000-0000-000000000006',
        currentRole: 'admin',
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
}

function submitDecision(decision: UseTaskRequestDecisionResult) {
  act(() => {
    decision.submitDecision({
      preventDefault: () => undefined,
    } as unknown as FormEvent<HTMLFormElement>);
  });
}

describe('useTaskRequestDecision success toast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.approveTaskRequest.mockReset().mockResolvedValue({ ...taskRequest, status: 'approved' });
    api.rejectTaskRequest.mockReset().mockResolvedValue({ ...taskRequest, status: 'rejected' });
    api.requestMoreEvidenceForTaskRequest
      .mockReset()
      .mockResolvedValue({ ...taskRequest, status: 'needs_more_evidence' });
    toast.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
    navigate.mockReset();
  });

  it('offers Task로 전환 on the approve toast and navigates to the approved request', async () => {
    const { result } = renderDecision();
    act(() => result.current.approve());
    submitDecision(result.current);
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(toast.success).toHaveBeenCalledTimes(1);
    const [message, options] = toast.success.mock.calls[0] ?? [];
    expect(message).toBe(TASK_REQUEST_COPY.decisions.approve);
    expect(options?.action).toMatchObject({ label: TASK_REQUEST_COPY.convertToTask });

    act(() => options.action.onClick());
    expect(navigate).toHaveBeenCalledWith({
      to: '/tasks',
      search: { view: 'requests', param: taskRequest.id },
    });
  });

  it.each(['reject', 'requestEvidence'] as const)(
    'shows the %s toast without a conversion action',
    async (action) => {
      const { result } = renderDecision();
      act(() => result.current[action]());
      act(() => result.current.changeValue('검토 메모'));
      submitDecision(result.current);
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

      expect(toast.success.mock.calls[0]?.[1]?.action).toBeUndefined();
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
