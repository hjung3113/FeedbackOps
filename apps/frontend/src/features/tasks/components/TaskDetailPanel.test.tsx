import { getTask, resolveActors } from '@/lib/api';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { assignTaskResponsibility } from '@/lib/api/tasks';
import type { TaskDetailDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailPanel } from './TaskDetailPanel';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getTask: vi.fn(),
  resolveActors: vi.fn(),
  fetchMe: vi.fn(async () => ({ actor: { id: 'admin', role_level: 'admin' } })),
  fetchPermissionCheck: vi.fn(async () => ({ state: 'denied' })),
}));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: vi.fn() }));
vi.mock('@/lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tasks')>()),
  assignTaskResponsibility: vi.fn(),
}));

const teamId = '20000000-0000-4000-8000-000000000002';
const task: TaskDetailDto = {
  id: '10000000-0000-4000-8000-000000000001',
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: 'TASK-1000',
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  title: '배정 테스트',
  status: 'backlog',
  priority: 'medium',
  assignee_actor_id: null,
  assignee_team_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '40000000-0000-4000-8000-000000000004',
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
  source: null,
};

function renderPanel(current: TaskDetailDto) {
  vi.mocked(getTask).mockResolvedValue(current);
  vi.mocked(fetchManagedSystems).mockResolvedValue({
    total: 1,
    items: [
      {
        id: task.primary_managed_system_id,
        name: 'Tableau',
        default_owner_team_id: teamId,
        default_reviewer_team_id: null,
      } as Awaited<ReturnType<typeof fetchManagedSystems>>['items'][number],
    ],
  });
  vi.mocked(resolveActors).mockImplementation(async ({ teamIds }) => {
    if (teamIds?.some((id) => id == null)) throw new Error('Invalid uuid');
    return { actors: [], teams: [{ id: teamId, name: '운영팀' }] };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskDetailPanel
        taskId={task.id}
        onClose={() => {}}
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
      />
    </QueryClientProvider>,
  );
  return client;
}

describe('Task detail responsibility', () => {
  it.each([null, teamId])(
    'opens team selection with null defaults and current team %s',
    async (currentTeam) => {
      renderPanel({ ...task, assignee_team_id: currentTeam });
      fireEvent.click(await screen.findByRole('button', { name: '배정 수정' }));
      if (!currentTeam) {
        fireEvent.click(screen.getByRole('combobox', { name: '배정 방식' }));
        fireEvent.click(await screen.findByRole('option', { name: '팀 지정' }));
      }
      fireEvent.click(screen.getByRole('combobox', { name: '팀 선택' }));
      expect(await screen.findByRole('option', { name: '운영팀' })).toBeInTheDocument();
    },
  );

  it('returns focus after save and the updated Task refetch', async () => {
    const client = renderPanel(task);
    const updated = { ...task, updated_at: '2026-10-13T01:00:00.000Z' };
    vi.mocked(assignTaskResponsibility).mockImplementation(async () => {
      client.setQueryData(['task', task.id], updated);
      vi.mocked(getTask).mockResolvedValue(updated);
      return updated;
    });
    fireEvent.click(await screen.findByRole('button', { name: '배정 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '배정 수정' })).toHaveFocus());
  });
});
