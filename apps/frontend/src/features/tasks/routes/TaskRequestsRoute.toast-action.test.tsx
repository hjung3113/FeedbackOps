import { taskRequestPage } from '@/test/task-request-pages';
import type { ListTaskRequestsQuery, TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestsRoute } from './TaskRequestsRoute';

const api = vi.hoisted(() => ({
  approveTaskRequest: vi.fn(),
  fetchMe: vi.fn(),
  fetchPermissionCheck: vi.fn(),
  fetchTaskRequests: vi.fn(),
  resolveActors: vi.fn(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
const router = vi.hoisted(() => ({ navigate: vi.fn() }));

const base: TaskRequestDto = {
  id: '',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: '',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: 'Evidence summary',
  requested_outcome: '',
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
const make = (n: number, status: TaskRequestDto['status']): TaskRequestDto => ({
  ...base,
  id: `10000000-0000-0000-0000-00000000000${n}`,
  display_id: `REQ-100${n}`,
  requested_outcome: `outcome ${n}`,
  status,
});
const approvedA = make(4, 'approved');
const approvedB = make(5, 'approved');
const pending = make(1, 'pending_review');
const nextPending = make(7, 'pending_review');

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => router.navigate,
}));
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
vi.mock('@/features/findings/public', () => ({ useFindingDetail: () => ({ data: null }) }));
vi.mock('@/lib/api/entity-links', () => ({
  fetchTaskRequestEntityLinks: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  approveTaskRequest: api.approveTaskRequest,
  fetchMe: api.fetchMe,
  fetchPermissionCheck: api.fetchPermissionCheck,
  fetchTaskRequests: async (options: ListTaskRequestsQuery) =>
    taskRequestPage(await api.fetchTaskRequests(options), options),
  getTaskRequest: vi.fn(async () => pending),
  listTasks: vi.fn(async () => ({ items: [] })),
  resolveActors: api.resolveActors,
}));

// Mirrors the router: the URL `param` is the single source of the selection.
function Harness({ client }: { client: QueryClient }) {
  const [param, setParam] = React.useState<string | undefined>(pending.id);
  router.navigate.mockImplementation((options: { search: { param?: string } }) =>
    setParam(options.search.param),
  );
  return (
    <QueryClientProvider client={client}>
      <TaskRequestsRoute
        selectedParam={param}
        onSelectionChange={(id) => setParam(id ?? undefined)}
      />
    </QueryClientProvider>
  );
}

describe('TaskRequestsRoute approve toast action (#1293)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let pendingRows = [pending, nextPending];
    let approvedRows = [approvedA, approvedB];
    api.fetchTaskRequests.mockImplementation(async (options: ListTaskRequestsQuery) =>
      options.status === 'approved'
        ? approvedRows
        : options.status === 'pending_review'
          ? pendingRows
          : [...pendingRows, ...approvedRows],
    );
    api.approveTaskRequest.mockImplementation(async () => {
      pendingRows = [nextPending];
      approvedRows = [{ ...pending, status: 'approved' }, approvedA, approvedB];
      return { ...pending, status: 'approved' };
    });
    api.fetchMe.mockResolvedValue({
      actor: {
        id: '60000000-0000-0000-0000-000000000006',
        external_id: 'mock-admin',
        email: 'admin@feedbackops.local',
        display_name: 'Mock Admin',
        role_level: 'admin',
      },
      workspace_id: base.workspace_id,
    });
    api.fetchPermissionCheck.mockResolvedValue({ state: 'approved' });
    api.resolveActors.mockResolvedValue({ actors: [], teams: [] });
  });

  it('opens the approved request, not the first approved row, after the queue auto-advanced', async () => {
    render(<Harness client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />);
    await screen.findByRole('heading', { name: '검토 결정' });
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    // The queue advanced to the next pending request.
    await waitFor(() => expect(document.title).toContain('REQ-1007'));

    act(() => toast.success.mock.calls[0]?.[1].action.onClick());

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /^승인됨/ })).toHaveAttribute('aria-selected', 'true'),
    );
    await waitFor(() => expect(document.title).toContain('REQ-1001'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(document.title).toContain('REQ-1001');
    expect(document.title).not.toContain('REQ-1004');
    expect(screen.getByRole('button', { name: 'Task로 전환' })).toBeInTheDocument();
  });
});
