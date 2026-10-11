import { fetchTaskRequests } from '@/lib/api';
import { taskRequestPage } from '@/test/task-request-pages';
import type { ListTaskRequestsResponse, TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { installListMotionEnvironment } from '../../voc/components/triage/__tests__/list-motion-environment';
import { TaskRequestsRoute } from './TaskRequestsRoute';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchTaskRequests: vi.fn(),
  resolveActors: async () => ({ actors: [], teams: [] }),
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: 'admin', role_level: 'admin' } } }),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: async () => ({ items: [] }),
}));
vi.mock('@fops/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fops/ui')>()),
  ListShell: ({ list, detailPanel }: { list: ReactNode; detailPanel?: ReactNode }) => (
    <main>
      {list}
      <aside>{detailPanel}</aside>
    </main>
  ),
}));
vi.mock('./task-requests/TaskRequestPanel', () => ({
  TaskRequestPanel: ({
    item,
    onDecisionComplete,
  }: {
    item: TaskRequestDto;
    onDecisionComplete: (item: TaskRequestDto) => void;
  }) => (
    <section>
      <button type="button" onClick={() => onDecisionComplete({ ...item, status: 'approved' })}>
        Approve selected
      </button>
      <button type="button" onClick={() => onDecisionComplete({ ...item, status: 'converted' })}>
        Convert selected
      </button>
    </section>
  ),
}));

const rows: TaskRequestDto[] = [1, 2, 3].map((n) => ({
  id: `10000000-0000-0000-0000-00000000000${n}`,
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: `REQ-${n}`,
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: 'scope-a',
  evidence_summary: 'Evidence',
  requested_outcome: `Request ${n}`,
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
}));
let client: QueryClient;
let environment: ReturnType<typeof installListMotionEnvironment>;
afterEach(() => {
  cleanup();
  client.clear();
  environment.restore();
  vi.resetAllMocks();
});
const key = (scope: string, tab: string) => ['task-requests', scope, 'pages', tab];
function seed(scope: string, tab: string, items: TaskRequestDto[]) {
  client.setQueryData(
    key(scope, tab),
    {
      pages: [taskRequestPage(items)],
      pageParams: [undefined],
    },
    { updatedAt: Date.now() - 60_000 },
  );
}
function mount() {
  environment = installListMotionEnvironment();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(fetchTaskRequests).mockImplementation(async (query) => taskRequestPage(rows, query));
  const tree = (scope: string) => (
    <QueryClientProvider client={client}>
      <TaskRequestsRoute managedSystem={scope} selectedParam={rows[0]?.id} />
    </QueryClientProvider>
  );
  const view = render(tree('scope-a'));
  return (scope: string) => view.rerender(tree(scope));
}
async function settled() {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(async () => {});
}

it.each([
  ['decision', 'empty'],
  ['decision', 'rows'],
  ['tab', 'empty'],
  ['tab', 'rows'],
  ['scope', 'empty'],
  ['scope', 'rows'],
] as const)(
  'skips %s context motion for stale %s refreshes, including revisits',
  async (switchBy, cachePhase) => {
    const changeScope = mount();
    await screen.findByRole('button', { name: /REQ-1/ });
    await settled();
    for (let visit = 0; visit < 2; visit += 1) {
      const cachedRows = cachePhase === 'empty' ? [] : rows;
      const targetScope = switchBy === 'scope' ? 'scope-b' : 'scope-a';
      const targetTab = switchBy === 'scope' ? 'pending_review' : 'approved';
      const fresh: TaskRequestDto[] = rows.slice(2).map((row) => ({ ...row, status: targetTab }));
      seed(targetScope, targetTab, cachedRows);
      let resolve!: (page: ListTaskRequestsResponse) => void;
      const deferred = new Promise<ListTaskRequestsResponse>((done) => {
        resolve = done;
      });
      vi.mocked(fetchTaskRequests).mockImplementation(async (query) => {
        if (query?.limit === 1) return taskRequestPage(rows);
        expect(query?.limit).toBe(50);
        if (query?.managed_system_id === targetScope && query.status === targetTab) return deferred;
        return taskRequestPage(rows, query);
      });
      environment.animate.mockClear();
      if (switchBy === 'scope') changeScope(targetScope);
      else if (switchBy === 'decision')
        fireEvent.click(screen.getByRole('button', { name: 'Approve selected' }));
      else fireEvent.mouseDown(screen.getByRole('tab', { name: /^승인됨/ }));
      await waitFor(() =>
        expect(client.getQueryState(key(targetScope, targetTab))?.fetchStatus).toBe('fetching'),
      );
      if (cachePhase === 'rows')
        expect(screen.getByRole('button', { name: /REQ-2/ })).toBeInTheDocument();
      else
        expect(
          screen.getByText(
            switchBy === 'scope'
              ? '검토 대기 중인 Task Request가 없습니다'
              : '현재 조건에 맞는 Task Request가 없습니다',
          ),
        ).toBeInTheDocument();
      await act(async () => {});
      expect(environment.animate).not.toHaveBeenCalled();
      await act(async () => {
        resolve(taskRequestPage(fresh));
      });
      await settled();
      expect(screen.getByRole('button', { name: /REQ-3/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /REQ-2/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /REQ-1/ })).not.toBeInTheDocument();
      expect(environment.animate).not.toHaveBeenCalled();
      if (switchBy === 'scope') changeScope('scope-a');
      else fireEvent.mouseDown(screen.getByRole('tab', { name: /^검토 대기/ }));
      await settled();
      // Restore the decided row for a second independent decision into the visited context.
      await act(async () => {
        client.setQueryData(key('scope-a', 'pending_review'), {
          pages: [taskRequestPage(rows)],
          pageParams: [undefined],
        });
      });
      await screen.findByRole('button', { name: /REQ-1/ });
    }
  },
);

it('keeps settled decision removal and load-more motion with boundary and scroll, then shows empty immediately', async () => {
  mount();
  await screen.findByRole('button', { name: /REQ-1/ });
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
  await settled();
  const removedRow = screen.getByRole('button', { name: /REQ-1/ });
  const boundary = removedRow.parentElement as HTMLElement;
  boundary.scrollTop = 123;
  let resolve!: (page: ListTaskRequestsResponse) => void;
  vi.mocked(fetchTaskRequests).mockImplementation(async (query) => {
    if (query?.limit === 1) return taskRequestPage(rows);
    if (query?.cursor) {
      const template = rows[2];
      if (!template) throw new Error('Missing append fixture');
      return taskRequestPage([{ ...template, id: 'appended', display_id: 'REQ-4' }]);
    }
    return new Promise<ListTaskRequestsResponse>((done) => {
      resolve = done;
    });
  });
  environment.animate.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Convert selected' }));
  await waitFor(() => expect(environment.animate.mock.contexts).toContain(removedRow));
  expect(client.getQueryState(key('scope-a', 'all'))?.fetchStatus).toBe('fetching');
  expect(screen.getByRole('button', { name: /REQ-2/ }).parentElement).toBe(boundary);
  expect(boundary.scrollTop).toBe(123);
  await act(async () => {
    resolve({ items: rows.slice(1, 2), page: { has_more: true, cursor: 'next' } });
  });
  await settled();
  expect(screen.getByRole('button', { name: /REQ-2/ }).parentElement).toBe(boundary);
  expect(boundary.scrollTop).toBe(123);
  // Finish real auto-animate removals before testing a later user-driven append.
  // The scoped Web Animations stub does not deliver browser finish events itself.
  await act(async () => {
    for (const result of environment.animate.mock.results) {
      const calls = result.value.addEventListener.mock.calls as Array<[string, () => void]>;
      for (const [event, callback] of calls) if (event === 'finish') callback();
    }
  });
  environment.animate.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));
  await screen.findByRole('button', { name: /REQ-4/ });
  await settled();
  expect(environment.animate.mock.contexts).toContain(
    screen.getByRole('button', { name: /REQ-4/ }),
  );
  expect(screen.getByRole('button', { name: /REQ-4/ }).parentElement).toBe(boundary);
  expect(boundary.scrollTop).toBe(123);
  // Each conversion reconciles the real infinite cache, including invalidation.
  for (const n of [2, 4]) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`REQ-${n}`) }));
    fireEvent.click(screen.getByRole('button', { name: 'Convert selected' }));
  }
  expect(screen.getByText('Task Request가 없습니다.')).toBeInTheDocument();
  expect(boundary.isConnected).toBe(false);
});
