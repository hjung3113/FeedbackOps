import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskListRoute } from './TaskListRoute';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}));
vi.mock('@fops/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fops/ui')>()),
  ListShell: ({ list, detailPanel }: { list: ReactNode; detailPanel?: ReactNode }) => (
    <main>
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
