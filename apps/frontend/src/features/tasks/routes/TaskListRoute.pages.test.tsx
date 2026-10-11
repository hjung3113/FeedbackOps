import { type TaskDto, listTasksQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardRoute } from './TaskBoardRoute';
import { TaskListRoute } from './TaskListRoute';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@fops/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fops/ui')>()),
  ListShell: ({
    list,
    detailPanel,
    toolbar,
  }: { list: ReactNode; detailPanel?: ReactNode; toolbar?: { title?: ReactNode } }) => (
    <main>
      {toolbar?.title}
      {list}
      <aside>{detailPanel}</aside>
    </main>
  ),
  WorkbenchShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({
    data: { actor: { id: '20000000-0000-0000-0000-000000000002', role_level: 'admin' } },
  }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: async () => ({ items: [] }) }));
vi.mock('../components/TaskDetailPanel', () => ({
  TaskDetailPanel: ({ taskId }: { taskId: string }) => (
    <section data-testid="selected-task">{taskId}</section>
  ),
}));
const ms = '30000000-0000-0000-0000-000000000003';
const task: TaskDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'TASK-1',
  primary_managed_system_id: ms,
  title: 'First Task',
  status: 'backlog',
  priority: 'high',
  assignee_actor_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '20000000-0000-0000-0000-000000000002',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};
const second = {
  ...task,
  id: '10000000-0000-0000-0000-000000000002',
  display_id: 'TASK-2',
  title: 'Second Task',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function mount(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
describe('Task list paging and independent selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    navigate.mockReset();
  });
  it('AC-981 restores a page-two param, appends rows and keeps the exact total', async () => {
    const cursors: Array<string | undefined> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === `/tasks/${second.id}`) return response(second);
        const query = listTasksQuerySchema.parse(Object.fromEntries(url.searchParams));
        expect(query.limit).toBe(50);
        cursors.push(query.cursor);
        return response(
          query.cursor === undefined
            ? { items: [task], page: { total: 80, has_more: true, cursor: 'next' } }
            : { items: [second], page: { has_more: false } },
        );
      }),
    );
    mount(<TaskListRoute selectedParam={second.id} managedSystem={ms} />);
    expect(await screen.findByTestId('selected-task')).toHaveTextContent(second.id);
    expect(screen.getByText('80건')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));
    expect(await screen.findByText('Second Task')).toBeInTheDocument();
    expect(screen.getByText('First Task')).toBeInTheDocument();
    expect(cursors).toEqual([undefined, 'next']);
    expect(screen.getByText('80건')).toBeInTheDocument();
  });
  it.each(['missing', 'filtered'] as const)(
    'AC-981 reconciles %s param only after detail resolves',
    async (state) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = new URL(String(input), 'http://localhost');
          if (url.pathname === `/tasks/${second.id}`)
            return state === 'missing'
              ? response({ code: 'not_found.record', message: 'missing' }, 404)
              : response({
                  ...second,
                  primary_managed_system_id: '30000000-0000-0000-0000-000000000099',
                });
          if (url.pathname === `/tasks/${task.id}`) return response(task);
          listTasksQuerySchema.parse(Object.fromEntries(url.searchParams));
          return response({ items: [task], page: { total: 1, has_more: false } });
        }),
      );
      mount(<TaskListRoute selectedParam={second.id} managedSystem={ms} />);
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({
          to: '/tasks',
          replace: true,
          search: { view: 'backlog', managedSystem: ms },
        }),
      );
      expect(screen.queryByText(second.id)).not.toBeInTheDocument();
    },
  );
  it('AC-981 keeps the Task board on a request without limit', async () => {
    const queries: Array<ReturnType<typeof listTasksQuerySchema.parse>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        queries.push(listTasksQuerySchema.parse(Object.fromEntries(url.searchParams)));
        return response({ items: [task] });
      }),
    );
    mount(<TaskBoardRoute />);
    await screen.findByText('TASK-1');
    expect(queries[0]?.limit).toBeUndefined();
    expect(queries[0]?.cursor).toBeUndefined();
  });
});
