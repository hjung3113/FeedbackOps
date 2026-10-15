import { FindingsListPage, validateFindingsSearch } from '@/routes/_authed/findings';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import { listFindingsQuerySchema, listTasksQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';

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

const reply = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
type Query = {
  q?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
  status?: string | undefined;
  status_group?: string | undefined;
  assignee?: string | undefined;
};
function mount(surface: 'my' | 'board' | 'findings', initial: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [search, setSearch] = React.useState(initial);
    router.search = search;
    router.navigate.mockImplementation(
      ({ search: update }: { search: (s: unknown) => unknown }) => {
        setSearch(
          (prev) =>
            (surface === 'findings'
              ? validateFindingsSearch(update(prev))
              : validateTasksSearch(update(prev))) as Record<string, unknown>,
        );
        return Promise.resolve();
      },
    );
    return (
      <QueryClientProvider client={client}>
        {surface === 'findings' ? (
          <FindingsListPage />
        ) : (
          <TasksRouteView search={{ ...search, view: surface }} />
        )}
      </QueryClientProvider>
    );
  }
  return render(<Harness />);
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.navigate.mockReset();
});

it.each(['my', 'board', 'findings'] as const)(
  '%s restores URL q and sends committed search with no cursor',
  async (surface) => {
    const queries: Query[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const schema = surface === 'findings' ? listFindingsQuerySchema : listTasksQuerySchema;
        queries.push(schema.parse(Object.fromEntries(url.searchParams)));
        return reply(
          surface === 'board' ? { items: [] } : { items: [], page: { has_more: false, total: 0 } },
        );
      }),
    );
    mount(surface, { q: 'restored' });
    const box = screen.getByPlaceholderText('제목 또는 ID');
    expect(box).toHaveValue('restored');
    await waitFor(() => expect(queries[0]?.q).toBe('restored'));
    fireEvent.change(box, { target: { value: 'new title' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(queries.some((query) => query.q === 'new title')).toBe(true));
    expect(router.search.q).toBe('new title');
    expect(queries.at(-1)?.cursor).toBeUndefined();
    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
    if (surface === 'board') expect(queries.at(-1)?.limit).toBeUndefined();
  },
);

it('keeps focus and a newer draft through an uncached Task search response and debounces it', async () => {
  const queries: Query[] = [];
  let resolveOlder!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const query = listTasksQuerySchema.parse(Object.fromEntries(url.searchParams));
      queries.push(query);
      if (query.q === 'older')
        return new Promise<Response>((resolve) => {
          resolveOlder = resolve;
        });
      return reply({ items: [], page: { has_more: false, total: 0 } });
    }),
  );
  mount('my');
  const box = screen.getByPlaceholderText('제목 또는 ID');
  box.focus();
  fireEvent.change(box, { target: { value: 'older' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(resolveOlder).toBeDefined());
  expect(box).toHaveFocus();
  fireEvent.change(box, { target: { value: 'newer' } });
  await act(async () => {
    resolveOlder(reply({ items: [], page: { has_more: false, total: 0 } }));
  });
  expect(box).toHaveFocus();
  expect(box).toHaveValue('newer');
  await waitFor(() => expect(queries.at(-1)?.q).toBe('newer'));
  expect(router.search.q).toBe('newer');
});

it('My Tasks status control sends status and status_group and clears them', async () => {
  const queries: Query[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      queries.push(listTasksQuerySchema.parse(Object.fromEntries(url.searchParams)));
      return reply({ items: [], page: { has_more: false, total: 0 } });
    }),
  );
  mount('my');
  fireEvent.click(screen.getByRole('combobox', { name: 'Task 상태' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Doing' }));
  await waitFor(() => expect(queries.at(-1)?.status).toBe('doing'));
  fireEvent.click(screen.getByRole('combobox', { name: 'Task 상태' }));
  fireEvent.click(await screen.findByRole('option', { name: '상태: Todo·Doing·Review' }));
  await waitFor(() => expect(queries.at(-1)?.status_group).toBe('in-flight'));
  expect(queries.at(-1)?.status).toBeUndefined();
  expect(queries.at(-1)?.assignee).toBe('me');
  fireEvent.click(screen.getByRole('combobox', { name: 'Task 상태' }));
  fireEvent.click(await screen.findByRole('option', { name: '전체 상태' }));
  await waitFor(() => expect(router.search.status_group).toBeUndefined());
  expect(router.search.status).toBeUndefined();
});

it('Findings toggles execution and status with removable chips and reset', async () => {
  const queries: Array<ReturnType<typeof listFindingsQuerySchema.parse>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      queries.push(listFindingsQuerySchema.parse(Object.fromEntries(url.searchParams)));
      return reply({ items: [], page: { has_more: false, total: 0 } });
    }),
  );
  mount('findings');
  fireEvent.click(screen.getByRole('checkbox', { name: '실행 연결 없음' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '활성 Finding' }));
  await waitFor(() =>
    expect(queries.some((q) => q.execution === 'none' && q.status === 'active')).toBe(true),
  );
  expect(screen.getByRole('button', { name: '실행 연결 없음 필터 제거' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /상태:.*필터 제거/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '실행 연결 없음 필터 제거' }));
  await waitFor(() => expect(router.search.execution).toBeUndefined());
  fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
  await waitFor(() => expect(router.search.execution).toBeUndefined());
  expect(router.search.status).toBeUndefined();
});

it.each(['my', 'findings'] as const)(
  '%s resets a loaded page cursor when q changes',
  async (surface) => {
    const queries: Query[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const schema = surface === 'findings' ? listFindingsQuerySchema : listTasksQuerySchema;
        const query = schema.parse(Object.fromEntries(url.searchParams));
        queries.push(query);
        return reply({
          items: [],
          page: {
            has_more: query.q === undefined && query.cursor === undefined,
            ...(query.q === undefined && query.cursor === undefined ? { cursor: 'page-two' } : {}),
            ...(query.cursor === undefined ? { total: 2 } : {}),
          },
        });
      }),
    );
    mount(surface);
    fireEvent.click(await screen.findByRole('button', { name: '더 불러오기' }));
    await waitFor(() => expect(queries.some((query) => query.cursor === 'page-two')).toBe(true));
    const box = screen.getByPlaceholderText('제목 또는 ID');
    fireEvent.change(box, { target: { value: 'filtered' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(queries.at(-1)?.q).toBe('filtered'));
    expect(queries.at(-1)?.cursor).toBeUndefined();
  },
);
