import {
  type ListEntityLinksResponse,
  type TaskRequestDto,
  listEntityLinksQuerySchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useDecision, useConversion, useLink } = vi.hoisted(() => ({
  useDecision: vi.fn(),
  useConversion: vi.fn(),
  useLink: vi.fn(),
}));

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: () => ({ data: null }),
}));
vi.mock('./useTaskRequestDecision', () => ({ useTaskRequestDecision: useDecision }));
vi.mock('./useTaskRequestConversion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useTaskRequestConversion')>()),
  useTaskRequestConversion: useConversion,
}));
vi.mock('./useTaskRequestLink', () => ({ useTaskRequestLink: useLink }));

import { TaskRequestPanel } from './TaskRequestPanel';

const request: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-42',
  source_type: 'voc',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: '로그인 흐름에서 오류가 발생합니다.',
  requested_outcome: '로그인 오류를 수정합니다.',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'converted',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};

const taskId = '10000000-0000-0000-0000-000000000099';

function mockEntityLinkRead(payload: ListEntityLinksResponse) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPanel(item: TaskRequestDto) {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/tasks',
    component: () => (
      <TaskRequestPanel
        item={item}
        names={{ actorsById: {}, managedSystemsById: {} }}
        currentActorId={request.requester_actor_id}
        currentRole="developer"
        onClose={vi.fn()}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/tasks'] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useDecision.mockReturnValue({
    dialog: null,
    isSubmitting: false,
    isPending: false,
    isSelfApproval: false,
    canApprove: false,
    canReject: false,
    canRequestEvidence: false,
    approve: vi.fn(),
    reject: vi.fn(),
    requestEvidence: vi.fn(),
    submitDecision: vi.fn(),
    changeValue: vi.fn(),
    close: vi.fn(),
  });
  useConversion.mockReturnValue({ open: false, canConvert: false, result: null, setOpen: vi.fn() });
  useLink.mockReturnValue({
    open: false,
    canLinkExisting: false,
    setOpen: vi.fn(),
    isTasksLoading: false,
    inScopeTasks: [],
    result: null,
    resultTaskRequestId: null,
    link: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TaskRequestPanel converted Task entity link', () => {
  it('renders the allowed Task summary after a fresh panel load', async () => {
    const fetchMock = mockEntityLinkRead({
      items: [
        {
          id: '50000000-0000-0000-0000-000000000001',
          source_type: 'task_request',
          source_id: request.id,
          target_type: 'task',
          target_id: taskId,
          relation_type: 'converted_to',
          visibility: 'internal_only',
          status: 'active',
          managed_system_id: request.primary_managed_system_id,
          created_by: request.requester_actor_id,
          created_at: request.created_at,
          updated_at: null,
          visibility_state: 'allowed',
          target_summary: {
            type: 'task',
            id: taskId,
            display_id: 'TASK-901',
            title: '로그인 오류 수정',
            status: 'backlog',
            priority: 'medium',
            primary_managed_system_id: request.primary_managed_system_id,
            assignee_actor_id: null,
            due_date: null,
          },
        },
      ],
    });

    renderPanel(request);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const taskLink = await screen.findByRole('link', { name: /TASK-901/ });
    expect(taskLink).toHaveTextContent('로그인 오류 수정');
    expect(taskLink).toHaveAttribute('href', expect.stringContaining(`param=${taskId}`));
    expect(screen.getByText('연결된 Task')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toBe('/entity-links');
    expect(url.searchParams.get('source_type')).toBe('task_request');
    expect(url.searchParams.get('source_id')).toBe(request.id);
    expect(url.searchParams.has('relation_type')).toBe(false);
    // The server validates this query with the shared schema; an invalid combination is a 422.
    expect(listEntityLinksQuerySchema.safeParse(Object.fromEntries(url.searchParams)).success).toBe(
      true,
    );
  });

  it('hides Task identity when the response has no allowed row', async () => {
    const fetchMock = mockEntityLinkRead({
      items: [
        {
          id: '50000000-0000-0000-0000-000000000001',
          source_type: 'task_request',
          target_type: 'task',
          relation_type: 'converted_to',
          status: 'active',
          managed_system_id: request.primary_managed_system_id,
          created_by: request.requester_actor_id,
          created_at: request.created_at,
          updated_at: null,
          visibility_state: 'hidden',
        },
      ],
    });

    renderPanel(request);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole('link', { name: /TASK-901/ })).not.toBeInTheDocument();
    expect(screen.queryByText('연결된 Task')).not.toBeInTheDocument();
  });

  it('does not request converted Task links for a non-converted request', async () => {
    const fetchMock = mockEntityLinkRead({ items: [] });

    renderPanel({ ...request, status: 'approved' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('검토 결정')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
