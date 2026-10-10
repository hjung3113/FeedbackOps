import { ApiError } from '@/lib/api/types';
import { type TaskRequestDto, listTaskRequestsQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestsRoute } from './TaskRequestsRoute';

vi.mock('@fops/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fops/ui')>()),
  ListShell: ({ list, detailPanel }: { list: ReactNode; detailPanel?: ReactNode }) => (
    <main>
      {list}
      <aside>{detailPanel}</aside>
    </main>
  ),
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({
    data: { actor: { id: '60000000-0000-0000-0000-000000000006', role_level: 'admin' } },
  }),
}));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: async () => ({ items: [] }) }));
vi.mock('./task-requests/TaskRequestPanel', () => ({
  TaskRequestPanel: ({
    item,
    onDecisionComplete,
  }: { item: TaskRequestDto; onDecisionComplete: (item: TaskRequestDto) => void }) => (
    <section data-testid="selected-request">
      {item.display_id}
      <button type="button" onClick={() => onDecisionComplete({ ...item, status: 'approved' })}>
        Approve selected
      </button>
    </section>
  ),
}));

const ms = '30000000-0000-0000-0000-000000000003';
const first: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-1',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: ms,
  evidence_summary: 'Evidence',
  requested_outcome: 'First request',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};
const second = {
  ...first,
  id: '10000000-0000-0000-0000-000000000002',
  display_id: 'REQ-2',
  requested_outcome: 'Second request',
};
const counts = {
  pending_review: 51,
  approved: 18,
  rejected: 0,
  needs_more_evidence: 0,
  converted: 0,
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function mount(selectedParam?: string, managedSystem?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskRequestsRoute
        {...(selectedParam === undefined ? {} : { selectedParam })}
        {...(managedSystem === undefined ? {} : { managedSystem })}
      />
    </QueryClientProvider>,
  );
  return client;
}

describe('Task Request cursor screens', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('AC-981 sends a server status and 50-row limit, appends cursor rows, and reads exact summary badges', async () => {
    const queries: Array<ReturnType<typeof listTaskRequestsQuerySchema.parse>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === '/task-requests') {
          const query = listTaskRequestsQuerySchema.parse(Object.fromEntries(url.searchParams));
          queries.push(query);
          if (query.limit === 1) {
            expect(query.status).toBeUndefined();
            expect(query.cursor).toBeUndefined();
            return response({
              items: [first],
              page: { total: 69, status_counts: counts, has_more: true, cursor: 'summary-next' },
            });
          }
          expect(query.limit).toBe(50);
          if (query.status === 'approved')
            return response({
              items: [{ ...first, status: 'approved' }],
              page: { total: 18, has_more: false },
            });
          expect(query.status).toBe('pending_review');
          return response(
            query.cursor === undefined
              ? { items: [first], page: { total: 51, has_more: true, cursor: 'next' } }
              : { items: [second], page: { has_more: false } },
          );
        }
        if (url.pathname === `/task-requests/${second.id}`) return response(second);
        if (url.pathname.includes('/actors')) return response({ actors: [], teams: [] });
        return response({ code: 'not_found.record' }, 404);
      }),
    );
    mount(second.id);
    expect(await screen.findByRole('tab', { name: '검토 대기 , 51' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '승인됨 , 18' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '전체 , 69' })).toBeInTheDocument();
    expect(await screen.findByTestId('selected-request')).toHaveTextContent('REQ-2');
    fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));
    expect(await screen.findByRole('button', { name: /REQ-2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /REQ-1/ })).toBeInTheDocument();
    expect(queries.at(-1)?.cursor).toBe('next');
    expect(screen.getByRole('tab', { name: '전체 , 69' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve selected' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /^승인됨/ })).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByTestId('selected-request')).toHaveTextContent('REQ-2');
  });

  it('AC-981 zero pending with approved rows shows summary badges and the filtered-empty copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const query = listTaskRequestsQuerySchema.parse(Object.fromEntries(url.searchParams));
        if (query.limit === 1)
          return response({
            items: [{ ...first, status: 'approved' }],
            page: {
              total: 18,
              status_counts: { ...counts, pending_review: 0 },
              has_more: true,
              cursor: 'next',
            },
          });
        expect(query.status).toBe('pending_review');
        return response({ items: [], page: { total: 0, has_more: false } });
      }),
    );
    mount();
    expect(await screen.findByText('검토 대기 중인 Task Request가 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '검토 대기 , 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '승인됨 , 18' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '전체 , 18' })).toBeInTheDocument();
    expect(screen.queryByText('Task Request가 없습니다.')).not.toBeInTheDocument();
  });

  it.each(['missing', 'filtered'] as const)(
    'AC-981 reconciles an explicit %s selection through detail',
    async (state) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = new URL(String(input), 'http://localhost');
          if (url.pathname === `/task-requests/${second.id}`)
            return state === 'missing'
              ? response({ code: 'not_found.record', message: 'task request not found' }, 404)
              : response({
                  ...second,
                  primary_managed_system_id: '30000000-0000-0000-0000-000000000099',
                });
          if (url.pathname.includes('/actors')) return response({ actors: [], teams: [] });
          const query = listTaskRequestsQuerySchema.parse(Object.fromEntries(url.searchParams));
          return response({
            items: query.limit === 1 ? [first] : [],
            page: {
              total: 1,
              has_more: false,
              ...(query.limit === 1
                ? { status_counts: { ...counts, pending_review: 1, approved: 0 } }
                : {}),
            },
          });
        }),
      );
      const client = mount(second.id, ms);
      // A never-fetched (disabled) query is also idle; require the settled status so the
      // absence below follows the detail response under test.
      await waitFor(() => {
        const detail = client.getQueryState(['task-request', second.id]);
        expect(detail?.status).toBe(state === 'missing' ? 'error' : 'success');
        expect(detail?.fetchStatus).toBe('idle');
      });
      if (state === 'missing')
        expect(client.getQueryState(['task-request', second.id])?.error).toBeInstanceOf(ApiError);
      await waitFor(() => expect(screen.queryByTestId('selected-request')).not.toBeInTheDocument());
    },
  );
});
