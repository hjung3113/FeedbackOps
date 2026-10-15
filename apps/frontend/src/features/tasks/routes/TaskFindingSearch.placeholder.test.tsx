// Previous rows stay only for a q-only change. A Managed System switch, the
// backlog → 내 Task view switch, and a q change after a 403 must show the
// loading state instead of the previous scope's rows.
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { FindingsListPage, validateFindingsSearch } from '@/routes/_authed/findings';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const SYSTEM_A = '30000000-0000-4000-8000-00000000000a';
const SYSTEM_B = '30000000-0000-4000-8000-00000000000b';
const ROW = 'Scope Row';

const router = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => router.navigate,
  useSearch: () => router.search,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: { actor: { id: 'me' } } }) }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: async () => ({ items: [] }) }));
vi.mock('../components/TaskDetailPanel', () => ({ TaskDetailPanel: () => null }));
vi.mock('@/features/findings/components/FindingDetail', () => ({ FindingDetailPanel: () => null }));

type Surface = 'list' | 'board' | 'findings';
const SURFACES = [
  ['task list', 'list'],
  ['board', 'board'],
  ['findings', 'findings'],
] as const;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function taskPage(title: string | null) {
  if (title === null) return { items: [], page: { has_more: false, total: 0 } };
  return {
    items: [
      {
        id: '10000000-0000-0000-0000-000000000001',
        workspace_id: '90000000-0000-0000-0000-000000000009',
        display_id: 'TASK-1',
        primary_managed_system_id: SYSTEM_A,
        title,
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
      },
    ],
    page: { has_more: false, total: 1 },
  };
}

function findingPage(title: string | null) {
  if (title === null) return { items: [], page: { has_more: false, total: 0 } };
  return {
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        display_id: 'FND-101',
        primary_managed_system_id: SYSTEM_A,
        title,
        summary: '이전 범위의 Finding',
        source_type: 'manual',
        source_id: null,
        owner_actor_id: null,
        owner_team_id: null,
        evidence_count: 1,
        severity: 'high',
        confidence: 'medium',
        status: 'active',
        analytics_area_id: null,
        linked_task_id: null,
        linked_milestone_id: null,
        created_by: '33333333-3333-4333-8333-333333333333',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        source: null,
      },
    ],
    page: { has_more: false, total: 1 },
  };
}

function page(surface: Surface, title: string | null) {
  return surface === 'findings' ? findingPage(title) : taskPage(title);
}

function expectLoading(surface: Surface) {
  if (surface === 'findings') {
    expect(screen.getByTestId('finding-list-skeleton')).toBeInTheDocument();
    return;
  }
  expect(
    screen.getByText(surface === 'list' ? 'Task를 불러오는 중…' : 'Task 불러오는 중...'),
  ).toBeInTheDocument();
}

function expectSettled(surface: Surface) {
  if (surface === 'findings') {
    expect(screen.queryByTestId('finding-list-skeleton')).not.toBeInTheDocument();
    return;
  }
  expect(
    screen.queryByText(surface === 'list' ? 'Task를 불러오는 중…' : 'Task 불러오는 중...'),
  ).not.toBeInTheDocument();
}

function mount(surface: Surface, initial: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const controls: {
    setSearch: (update: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  } = {
    setSearch: () => {
      throw new Error('Harness is not mounted');
    },
  };
  function Harness() {
    const [search, setSearch] = React.useState(initial);
    controls.setSearch = (update) => {
      setSearch((prev) => update(prev));
    };
    const validated =
      surface === 'findings' ? validateFindingsSearch(search) : validateTasksSearch(search);
    router.search = validated;
    router.navigate.mockImplementation(
      ({ search: update }: { search: (prev: unknown) => unknown }) => {
        setSearch((prev) => update(prev) as Record<string, unknown>);
        return Promise.resolve();
      },
    );
    const taskSearch = validateTasksSearch({
      ...search,
      view: surface === 'board' ? 'board' : search.view === 'my' ? 'my' : 'backlog',
    });
    return (
      <QueryClientProvider client={client}>
        {surface === 'findings' ? <FindingsListPage /> : <TasksRouteView search={taskSearch} />}
      </QueryClientProvider>
    );
  }
  render(<Harness />);
  return controls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.navigate.mockReset();
});

it.each(SURFACES)(
  '%s shows no rows from the previous Managed System while the next one loads',
  async (_label, surface) => {
    let resolveNext: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname !== '/tasks' && url.pathname !== '/findings') return reply({ items: [] });
        if (url.searchParams.get('managed_system_id') === SYSTEM_B) {
          return new Promise<Response>((resolve) => {
            resolveNext = resolve;
          });
        }
        return reply(page(surface, ROW));
      }),
    );
    const { setSearch } = mount(surface, { managedSystem: SYSTEM_A });
    await screen.findByText(ROW);
    act(() => {
      setSearch((prev) => ({ ...prev, managedSystem: SYSTEM_B }));
    });
    await waitFor(() => expect(resolveNext).toBeDefined());
    expect(screen.queryByText(ROW)).not.toBeInTheDocument();
    expectLoading(surface);
    await act(async () => {
      resolveNext?.(reply(page(surface, null)));
    });
    expect(screen.queryByText(ROW)).not.toBeInTheDocument();
  },
);

it('task list shows no backlog rows while 내 Task loads', async () => {
  let resolveNext: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/tasks') return reply({ items: [] });
      if (url.searchParams.get('assignee') === 'me') {
        return new Promise<Response>((resolve) => {
          resolveNext = resolve;
        });
      }
      return reply(taskPage(ROW));
    }),
  );
  const { setSearch } = mount('list');
  await screen.findByText(ROW);
  act(() => {
    setSearch((prev) => ({ ...prev, view: 'my' }));
  });
  await waitFor(() => expect(resolveNext).toBeDefined());
  expect(screen.queryByText(ROW)).not.toBeInTheDocument();
  expectLoading('list');
  expect(screen.getByText('내 Task')).toBeInTheDocument();
  await act(async () => {
    resolveNext?.(reply(taskPage(null)));
  });
});

it.each(SURFACES)(
  '%s shows no previous rows when q changes after a 403',
  async (_label, surface) => {
    let resolveNext: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname !== '/tasks' && url.pathname !== '/findings') return reply({ items: [] });
        const system = url.searchParams.get('managed_system_id');
        if (system === SYSTEM_B && url.searchParams.get('q') === 'next') {
          return new Promise<Response>((resolve) => {
            resolveNext = resolve;
          });
        }
        if (system === SYSTEM_B) {
          return reply({ code: 'permission.denied', message: 'permission denied' }, 403);
        }
        return reply(page(surface, ROW));
      }),
    );
    const { setSearch } = mount(surface, { managedSystem: SYSTEM_A });
    await screen.findByText(ROW);
    act(() => {
      setSearch((prev) => ({ ...prev, managedSystem: SYSTEM_B }));
    });
    await screen.findByText(
      surface === 'findings'
        ? PERMISSION_BLOCKED_REASONS.findingsList
        : PERMISSION_BLOCKED_REASONS.taskList,
    );
    expect(screen.queryByText(ROW)).not.toBeInTheDocument();
    expectSettled(surface);
    // The board replaces its shell, including the search box, while denied.
    // The resurrection is the next q key, which the URL can change directly.
    act(() => {
      setSearch((prev) => ({ ...prev, q: 'next' }));
    });
    await waitFor(() => expect(resolveNext).toBeDefined());
    expect(screen.queryByText(ROW)).not.toBeInTheDocument();
    expectLoading(surface);
    await act(async () => {
      resolveNext?.(reply(page(surface, null)));
    });
  },
);

it.each(SURFACES)('%s keeps the previous rows while only q is loading', async (_label, surface) => {
  let resolveNext: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/tasks' && url.pathname !== '/findings') return reply({ items: [] });
      if (url.searchParams.has('q')) {
        return new Promise<Response>((resolve) => {
          resolveNext = resolve;
        });
      }
      return reply(page(surface, ROW));
    }),
  );
  mount(surface, { managedSystem: SYSTEM_A });
  await screen.findByText(ROW);
  const box = screen.getByPlaceholderText('제목 또는 ID');
  fireEvent.change(box, { target: { value: 'next' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(resolveNext).toBeDefined());
  expect(screen.getByText(ROW)).toBeInTheDocument();
  expectSettled(surface);
  await act(async () => {
    resolveNext?.(reply(page(surface, null)));
  });
  await waitFor(() => expect(screen.queryByText(ROW)).not.toBeInTheDocument());
});
