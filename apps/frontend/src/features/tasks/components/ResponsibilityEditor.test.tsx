import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsibilityEditor } from './ResponsibilityEditor';

const actorId = '10000000-0000-4000-8000-000000000001';
const teamId = '20000000-0000-4000-8000-000000000002';
const developerId = '30000000-0000-4000-8000-000000000003';
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));
vi.mock('@/lib/api', () => ({
  resolveActors: vi.fn(async () => ({
    actors: [{ id: actorId, display_name: '레거시 운영자', email: 'legacy@example.test' }],
    teams: [{ id: teamId, name: '검토팀' }],
  })),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [
      {
        id: actorId,
        display_name: '레거시 운영자',
        email: 'legacy@example.test',
        role_level: 'admin',
        actor_type: 'system',
      },
      {
        id: developerId,
        display_name: '개발자',
        email: 'dev@example.test',
        role_level: 'developer',
        actor_type: 'internal_member',
      },
    ],
  }),
}));

function renderEditor(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['home-pending-task-requests', actorId], { items: [] });
  client.setQueryData(['home-my-tasks', actorId], { items: [] });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// Rendered public form: deliberate unassignment and team selection must not infer a member.
describe('ResponsibilityEditor', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
  });

  it.each([
    ['미배정', null, null],
    ['사용자 지정', developerId, null],
    ['팀 지정', null, teamId],
  ] as const)(
    'saves %s as an exclusive source assignment through pickers and refreshes personal queues',
    async (mode, actor, team) => {
      const save = vi.fn(async () => {});
      renderEditor(
        <ResponsibilityEditor
          actorId={null}
          teamId={null}
          canEdit
          label="배정된 검토자"
          teamCandidates={[teamId]}
          onSave={save}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
      fireEvent.click(screen.getByRole('combobox', { name: '배정 방식' }));
      fireEvent.click(await screen.findByRole('option', { name: mode }));
      if (actor) {
        fireEvent.click(screen.getByRole('combobox', { name: '담당 사용자' }));
        fireEvent.click(await screen.findByRole('option', { name: '개발자' }));
      }
      if (team) {
        fireEvent.click(screen.getByRole('combobox', { name: '팀 선택' }));
        fireEvent.click(await screen.findByRole('option', { name: '검토팀' }));
      }
      fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
      await waitFor(() => expect(save).toHaveBeenCalledWith(actor, team, expect.any(String)));
      expect(toastSuccess).toHaveBeenCalledWith('배정을 저장했습니다.');
      await screen.findByRole('button', { name: '배정 수정' });
      expect(screen.queryByRole('combobox', { name: '배정 방식' })).not.toBeInTheDocument();
    },
  );

  it('keeps the system identity out of the eligible Actor picker but keeps a current value selectable', async () => {
    renderEditor(
      <ResponsibilityEditor
        actorId={actorId}
        teamId={null}
        canEdit
        label="배정된 검토자"
        onSave={vi.fn(async () => {})}
      />,
    );
    expect(await screen.findByText('레거시 운영자')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '배정 방식' })).toHaveFocus());
    fireEvent.click(screen.getByRole('combobox', { name: '배정 방식' }));
    fireEvent.click(screen.getByRole('option', { name: '사용자 지정' }));
    fireEvent.click(await screen.findByRole('combobox', { name: '담당 사용자' }));
    expect(await screen.findByRole('option', { name: '개발자' })).toBeInTheDocument();
    // The system Actor is offered only as a disabled current value, never as a candidate.
    const fallback = screen.getByRole('option', { name: /레거시 운영자 · 지정할 수 없음/ });
    expect(fallback).toHaveAttribute('aria-disabled', 'true');
    // The raw ID input is gone.
    expect(screen.queryByRole('textbox', { name: '사용자 ID' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '팀 ID' })).not.toBeInTheDocument();
  });

  it('cancels on Escape and returns focus to 배정 수정', async () => {
    renderEditor(
      <ResponsibilityEditor
        actorId={null}
        teamId={null}
        canEdit
        label="담당자"
        onSave={vi.fn(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '배정 방식' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('combobox', { name: '배정 방식' }), { key: 'Escape' });
    await screen.findByRole('button', { name: '배정 수정' });
    expect(screen.getByRole('button', { name: '배정 수정' })).toHaveFocus();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('retains the picked team and explains a rejected save', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ResponsibilityEditor
          actorId={null}
          teamId={null}
          canEdit
          label="담당자"
          teamCandidates={[teamId]}
          onSave={async () => {
            throw new Error('rejected');
          }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
    fireEvent.click(screen.getByRole('combobox', { name: '배정 방식' }));
    fireEvent.click(await screen.findByRole('option', { name: '팀 지정' }));
    fireEvent.click(screen.getByRole('combobox', { name: '팀 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '검토팀' }));
    fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('combobox', { name: '팀 선택' })).toBeInTheDocument();
  });
});

it.each(['담당자', '배정된 검토자'])('marks a resolved team in %s detail', async (label) => {
  renderEditor(
    <ResponsibilityEditor
      actorId={null}
      teamId={teamId}
      canEdit={false}
      label={label}
      onSave={vi.fn(async () => {})}
    />,
  );
  expect(await screen.findByText('팀 · 검토팀')).toBeInTheDocument();
});

it('explains team mode with no candidates instead of offering an empty picker', async () => {
  renderEditor(
    <ResponsibilityEditor
      actorId={null}
      teamId={null}
      canEdit
      label="담당자"
      onSave={vi.fn(async () => {})}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
  fireEvent.click(screen.getByRole('combobox', { name: '배정 방식' }));
  fireEvent.click(await screen.findByRole('option', { name: '팀 지정' }));
  expect(screen.getByText('선택할 수 있는 팀이 없습니다')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: '팀 선택' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '배정 저장' })).toBeDisabled();
});

it('ignores null candidates defensively when opening team mode', async () => {
  renderEditor(
    <ResponsibilityEditor
      actorId={null}
      teamId={teamId}
      canEdit
      label="담당자"
      teamCandidates={[null, teamId] as unknown as readonly string[]}
      onSave={vi.fn(async () => {})}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
  fireEvent.click(screen.getByRole('combobox', { name: '팀 선택' }));
  expect(await screen.findByRole('option', { name: '검토팀' })).toBeInTheDocument();
});

it('returns focus on cancel without saving', async () => {
  const save = vi.fn(async () => {});
  renderEditor(
    <ResponsibilityEditor actorId={null} teamId={null} canEdit label="담당자" onSave={save} />,
  );
  fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByRole('button', { name: '배정 수정' })).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
});
