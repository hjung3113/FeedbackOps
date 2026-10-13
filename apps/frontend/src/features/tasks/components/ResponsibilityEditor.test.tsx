import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResponsibilityEditor } from './ResponsibilityEditor';

const actorId = '10000000-0000-4000-8000-000000000001';
const teamId = '20000000-0000-4000-8000-000000000002';

// Rendered public form: deliberate unassignment and team selection must not infer a member.
describe('ResponsibilityEditor', () => {
  it.each([
    ['미배정', null, null],
    ['사용자 지정', actorId, null],
    ['팀 지정', null, teamId],
  ] as const)(
    'saves %s as an exclusive source assignment and refreshes personal queues',
    async (mode, actor, team) => {
      const save = vi.fn(async () => {});
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(['home-pending-task-requests', actorId], { items: [] });
      client.setQueryData(['home-my-tasks', actorId], { items: [] });
      render(
        <QueryClientProvider client={client}>
          <ResponsibilityEditor
            actorId={actorId}
            teamId={null}
            canEdit
            onSave={save}
            label="배정된 검토자"
          />
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
      fireEvent.click(screen.getByRole('combobox', { name: '배정 방식' }));
      fireEvent.click(await screen.findByRole('option', { name: mode }));
      if (actor)
        fireEvent.change(screen.getByRole('textbox', { name: '사용자 ID' }), {
          target: { value: actor },
        });
      if (team)
        fireEvent.change(screen.getByRole('textbox', { name: '팀 ID' }), {
          target: { value: team },
        });
      fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
      await waitFor(() => expect(save).toHaveBeenCalledWith(actor, team, expect.any(String)));
      await screen.findByRole('button', { name: '배정 수정' });
      expect(client.getQueryState(['home-pending-task-requests', actorId])?.isInvalidated).toBe(
        true,
      );
      expect(client.getQueryState(['home-my-tasks', actorId])?.isInvalidated).toBe(true);
    },
  );

  it('retains the draft and explains a rejected save', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ResponsibilityEditor
          actorId={null}
          teamId={teamId}
          canEdit
          label="담당자"
          onSave={async () => {
            throw new Error('rejected');
          }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '배정 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: '팀 ID' })).toHaveValue(teamId);
  });
});
