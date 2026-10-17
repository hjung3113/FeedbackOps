import { resolveActors } from '@/lib/api';
import { assignTaskRequestReviewer } from '@/lib/api/task-requests';
import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskRequestPropertiesSection } from './TaskRequestPropertiesSection';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  resolveActors: vi.fn(),
}));
vi.mock('@/lib/api/task-requests', () => ({ assignTaskRequestReviewer: vi.fn() }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));

const item: TaskRequestDto = {
  id: '10000000-0000-4000-8000-000000000001',
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: 'REQ-42',
  source_type: 'finding',
  source_id: '40000000-0000-4000-8000-000000000004',
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  evidence_summary: '근거',
  requested_outcome: '검토',
  requester_actor_id: '20000000-0000-4000-8000-000000000002',
  status: 'pending_review',
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
};

function renderProperties(current: TaskRequestDto, canAssign?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = (request: TaskRequestDto) => (
    <QueryClientProvider client={client}>
      <TaskRequestPropertiesSection
        item={request}
        reviewer={undefined}
        names={{ actorsById: {}, managedSystemsById: {} }}
        {...(canAssign === undefined ? {} : { canAssign })}
      />
    </QueryClientProvider>
  );
  const view = render(props(current));
  return { ...view, refetch: (request: TaskRequestDto) => view.rerender(props(request)) };
}

describe('Task Request responsibility detail', () => {
  it('retains save focus across an updated_at refetch', async () => {
    const view = renderProperties(item, true);
    vi.mocked(assignTaskRequestReviewer).mockImplementation(async () => {
      const updated = { ...item, updated_at: '2026-10-13T01:00:00.000Z' };
      view.refetch(updated);
      return updated;
    });
    fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '배정 수정' })).toHaveFocus());
    view.refetch({ ...item, updated_at: '2026-10-13T02:00:00.000Z' });
    expect(screen.getByRole('button', { name: '배정 수정' })).toHaveFocus();
  });

  it('shows the team marker for a read-only reviewer', async () => {
    const teamId = '50000000-0000-4000-8000-000000000005';
    vi.mocked(resolveActors).mockResolvedValue({
      actors: [],
      teams: [{ id: teamId, name: '검토팀' }],
    });
    renderProperties({ ...item, assigned_reviewer_team_id: teamId }, false);
    expect(await screen.findByText('팀 · 검토팀')).toBeInTheDocument();
  });
});

it.each([
  ['approved', true, '본인이 승인함'],
  ['converted', true, '본인이 승인함'],
  ['approved', false, '다른 검토자가 승인함'],
  ['pending_review', true, '아직 승인되지 않음'],
] as const)('shows truthful self approval for %s (self=%s)', (status, self, expected) => {
  renderProperties({
    ...item,
    status,
    reviewer_actor_id: self ? item.requester_actor_id : item.id,
  });
  expect(screen.getByText(expected)).toBeInTheDocument();
  expect(screen.queryByText('범위 내 권한 필요')).not.toBeInTheDocument();
});

it('renders undecided body values as muted text without badges', () => {
  renderProperties({ ...item, assigned_reviewer_actor_id: item.requester_actor_id });

  const undecided = screen.getByText('미결정');
  const notApproved = screen.getByText('아직 승인되지 않음');
  expect(undecided).toHaveClass('text-text-muted');
  expect(notApproved).toHaveClass('text-text-muted');
  expect(undecided).not.toHaveClass('rounded', 'border');
  expect(notApproved).not.toHaveClass('rounded', 'border');
});
