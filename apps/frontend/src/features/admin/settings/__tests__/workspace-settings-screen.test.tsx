import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('../use-workspace-settings.js', () => ({
  useWorkspaceSettings: () => ({ data: undefined, isPending: true }),
  useUpdateWorkspaceSettings: () => ({ mutateAsync, isPending: false, isError: false }),
}));

import { WorkspaceSettingsForm } from '../WorkspaceSettingsScreen.js';

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({
    permission_self_approval: 'forbidden',
    survey_anonymity_threshold: 5,
  });
});

describe('WorkspaceSettingsForm', () => {
  test('AC-D1 renders the Permission Request-only label and the Task Request policy boundary', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceSettingsForm
          initialSettings={{ permission_self_approval: 'allowed', survey_anonymity_threshold: 5 }}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText('Self-approval of Permission Request', { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Task Request 자가승인은 ADR-0026 규칙을 따르며 이 설정과 무관합니다.', {
        exact: true,
      }),
    ).toBeInTheDocument();
  });

  test('persists the selected shared picker value with the same settings patch', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceSettingsForm
          initialSettings={{ permission_self_approval: 'allowed', survey_anonymity_threshold: 5 }}
        />
      </QueryClientProvider>,
    );

    const [editButton] = screen.getAllByRole('button', { name: 'Edit' });
    if (!editButton) throw new Error('Self-approval edit button missing');
    fireEvent.click(editButton);
    fireEvent.click(screen.getByRole('combobox', { name: 'Self-approval' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Forbidden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ permission_self_approval: 'forbidden' }),
    );
  });
});
