import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClusterMutate = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => navigateMock,
  useSearch: () => ({}),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      items: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Billing Ops',
          archived_at: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/features/voc-cluster/hooks/useCreateVocCluster', () => ({
  useCreateVocCluster: () => ({ mutate: createClusterMutate, reset: vi.fn(), isPending: false }),
}));

vi.mock('@/features/voc-cluster/hooks/useVocClusterList', () => ({
  useVocClusterList: () => ({ data: { items: [] }, isPending: false, isSuccess: true }),
}));

vi.mock('@/features/voc-cluster/components/detail/VocClusterListShell', () => ({
  VocClusterListShell: ({ toolbarActions }: { toolbarActions?: React.ReactNode }) => (
    <div>{toolbarActions}</div>
  ),
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { role_level: 'admin' } } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

async function openCreateDialog() {
  const { VocClusterListPage } = await import('../index');
  render(<VocClusterListPage />);
  fireEvent.click(screen.getByTestId('cluster-create-button'));
  fireEvent.change(screen.getByTestId('cluster-title-input'), {
    target: { value: '결제 VOC 묶음' },
  });
}

describe('VOC cluster creation Managed System validation', () => {
  beforeEach(() => createClusterMutate.mockReset());

  it('uses secondary styling for the create-dialog cancel action', async () => {
    await openCreateDialog();

    expect(screen.getByTestId('create-cluster-cancel')).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );
  });

  it('blocks the real submit button, shows an associated error, and focuses Managed System', async () => {
    await openCreateDialog();
    const managedSystem = screen.getByTestId('cluster-managed-system-select');

    fireEvent.click(screen.getByTestId('create-cluster-submit'));

    expect(createClusterMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Managed System을 선택하세요.');
    expect(managedSystem).toHaveAttribute('aria-invalid', 'true');
    expect(managedSystem.getAttribute('aria-describedby')).toBe('cluster-managed-system-error');
    expect(managedSystem).toHaveFocus();
  });

  it('allows the explicit empty item to be reselected and still blocks submission', async () => {
    await openCreateDialog();
    const managedSystem = screen.getByTestId('cluster-managed-system-select');

    fireEvent.click(managedSystem);
    fireEvent.click(await screen.findByRole('option', { name: 'Billing Ops' }));
    fireEvent.click(managedSystem);
    fireEvent.click(await screen.findByRole('option', { name: '시스템 선택…' }));

    expect(managedSystem).toHaveTextContent('시스템 선택…');
    fireEvent.click(screen.getByTestId('create-cluster-submit'));

    expect(createClusterMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Managed System을 선택하세요.');
    expect(managedSystem).toHaveFocus();
  });
});
