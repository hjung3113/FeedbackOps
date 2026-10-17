import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskListRoute } from './TaskListRoute';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({
      to,
      search,
      children,
    }: { to: string; search: { view: string }; children: ReactNode }) => (
      <a href={`${to}?view=${search.view}`}>{children}</a>
    ),
  };
});
vi.mock('@fops/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fops/ui')>()),
  ListShell: ({
    toolbar,
    tabs,
    list,
    detailPanel,
  }: {
    toolbar?: { title?: ReactNode; actions?: ReactNode };
    tabs?: ReactNode;
    list: ReactNode;
    detailPanel?: ReactNode;
  }) => (
    <main>
      <header>
        {toolbar?.title}
        {toolbar?.actions}
      </header>
      <div data-testid="task-tabs">{tabs}</div>
      {list}
      <aside data-testid="task-detail">{detailPanel}</aside>
    </main>
  ),
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: 'developer', role_level: 'developer' } } }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: async () => ({ items: [] }) }));

afterEach(() => vi.unstubAllGlobals());

it('FIX1 shows the denied Task detail for an unreadable deep link without a Task title', async () => {
  const id = '10000000-0000-0000-0000-000000000099';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const denied = url.pathname === `/tasks/${id}`;
      return new Response(
        JSON.stringify(
          denied
            ? { code: 'permission.denied', message: 'permission denied' }
            : { items: [], page: { total: 0, has_more: false } },
        ),
        { status: denied ? 403 : 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="backlog" selectedParam={id} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.taskDetail)).toBeInTheDocument();
  expect(screen.getByTestId('task-detail')).toHaveTextContent('Task detail');
  expect(screen.queryByTestId('detail-panel-title')).not.toBeInTheDocument();
  expect(screen.queryByText('Restricted Task')).not.toBeInTheDocument();
});

it('hides Task list controls after a denied read and links to 내 VOC', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 'permission.denied', message: 'finding.manage required' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="my" filters={{ q: 'internal filter', status: 'doing' }} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.taskList)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('제목 또는 ID')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Task 상태' })).not.toBeInTheDocument();
  expect(screen.queryByText(/internal filter/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: GLOSSARY.myVocs })).toHaveAttribute(
    'href',
    '/vocs?view=my',
  );
});

it('renders no list total once a refetch is denied after a successful load', async () => {
  const task = {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'TASK-1000',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    title: 'Retained Task',
    status: 'backlog',
    priority: 'high',
    assignee_actor_id: null,
    assignee_team_id: null,
    due_date: null,
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: '20000000-0000-0000-0000-000000000002',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
  let denied = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost');
      if (pathname !== '/tasks' && pathname !== `/tasks/${task.id}`) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return denied
        ? new Response(JSON.stringify({ code: 'permission.denied', message: 'denied' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(
            JSON.stringify(
              pathname === '/tasks'
                ? { items: [task], page: { total: 41, has_more: false } }
                : task,
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="my" filters={{}} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('41건')).toBeInTheDocument();

  denied = true;
  await client.invalidateQueries();

  await waitFor(() =>
    expect(screen.getByText(PERMISSION_BLOCKED_REASONS.taskList)).toBeInTheDocument(),
  );
  expect(screen.queryByText('41건')).not.toBeInTheDocument();
});
