import { TasksRouteView } from '@/routes/_authed/tasks';
import { type TaskDto, listTasksQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({ apiClient: apiClientMock }));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({ items: [] })),
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    ListShell: ({
      toolbar,
      list,
      detailPanel,
    }: {
      toolbar?: { title?: React.ReactNode };
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        {toolbar && (
          <header>
            <h2>{toolbar.title}</h2>
          </header>
        )}
        <main>{list}</main>
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});

vi.mock('../components/TaskDetailPanel', () => ({
  TaskDetailPanel: () => null,
}));

const task: TaskDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'TASK-1000',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  title: '매출 리포트 쿼리 플랜 개선',
  status: 'backlog',
  priority: 'high',
  assignee_actor_id: '20000000-0000-0000-0000-000000000002',
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '20000000-0000-0000-0000-000000000002',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}

function taskListQuery() {
  const path = apiClientMock.mock.calls.find(
    ([method, requestPath]) => method === 'GET' && String(requestPath).startsWith('/tasks'),
  )?.[1];
  if (typeof path !== 'string') throw new Error('Task list request was not sent');

  const search = new URL(path, 'http://localhost').searchParams;
  return listTasksQuerySchema.parse(Object.fromEntries(search.entries()));
}

describe('TaskListRoute My Tasks view', () => {
  beforeEach(() => {
    apiClientMock.mockReset();
    apiClientMock.mockImplementation(async (_method: string, path: string) => {
      if (path === '/tasks' || path.startsWith('/tasks?')) {
        return {
          status: 200,
          data: { items: [task] },
          etag: undefined,
          requestId: undefined,
        };
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    navigateMock.mockReset();
  });

  it.each([
    {
      routeView: 'my' as const,
      taskView: 'my' as const,
      expectedQuery: { assignee: 'me' },
    },
    {
      routeView: 'backlog' as const,
      taskView: 'backlog' as const,
      expectedQuery: {},
    },
    { routeView: 'inbox' as const, taskView: 'backlog' as const, expectedQuery: {} },
    { routeView: undefined, taskView: 'backlog' as const, expectedQuery: {} },
  ])(
    'sends the correct filter for route view $routeView and uses its cache key',
    async ({ routeView, taskView, expectedQuery }) => {
      const search = routeView !== undefined ? { view: routeView } : {};
      const client = renderWithClient(<TasksRouteView search={search} />);

      expect(await screen.findByText(task.title)).toBeInTheDocument();
      expect(taskListQuery()).toEqual(expectedQuery);
      expect(client.getQueryCache().findAll({ queryKey: ['tasks', taskView] })).toHaveLength(1);
    },
  );

  it('keeps view=my when a Task row is selected', async () => {
    renderWithClient(<TasksRouteView search={{ view: 'my' }} />);

    fireEvent.click(await screen.findByText(task.title));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/tasks',
      search: { view: 'my', param: task.id },
    });
  });

  it.each([
    { view: 'my' as const, title: '내 Task' },
    { view: 'backlog' as const, title: 'Tasks' },
  ])('shows the $title toolbar with a count', async ({ view, title }) => {
    renderWithClient(<TasksRouteView search={{ view }} />);

    expect(
      await screen.findByRole('heading', { name: new RegExp(`^${title}\\s*1건$`) }),
    ).toBeInTheDocument();
    expect(screen.getByText('1건')).toBeInTheDocument();
  });

  it('shows the My Tasks empty state when no Task is assigned to the actor', async () => {
    apiClientMock.mockImplementationOnce(async () => ({
      status: 200,
      data: { items: [] },
      etag: undefined,
      requestId: undefined,
    }));
    renderWithClient(<TasksRouteView search={{ view: 'my' }} />);

    expect(await screen.findByText('나에게 배정된 Task가 없습니다.')).toBeInTheDocument();
  });
});
