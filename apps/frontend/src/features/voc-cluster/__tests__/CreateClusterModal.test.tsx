import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCluster: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => mocks.navigate,
  useSearch: () => ({}),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      items: [
        {
          id: '99999999-9999-9999-9999-999999999999',
          name: 'Billing Ops',
          archived_at: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/features/voc-cluster/hooks/useVocClusterList', () => ({
  useVocClusterList: () => ({
    data: { items: [] },
    isPending: false,
    isError: false,
    isSuccess: true,
  }),
}));

vi.mock('@/features/voc-cluster/components/detail/VocClusterListShell', () => ({
  VocClusterListShell: ({ toolbarActions }: { toolbarActions?: ReactNode }) => (
    <div data-testid="cluster-list-shell">{toolbarActions}</div>
  ),
}));

vi.mock('@/features/voc-cluster/hooks/useCreateVocCluster', () => ({
  useCreateVocCluster: () => ({
    mutate: mocks.createCluster,
    reset: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { role_level: 'admin' } } }),
}));

describe('CreateClusterModal', () => {
  beforeEach(() => {
    mocks.createCluster.mockReset();
    mocks.navigate.mockReset();
  });

  it('submits the selected Managed System in the cluster create request', async () => {
    const { VocClusterListPage } = await import('@/routes/_authed/voc-clusters/index');
    render(<VocClusterListPage />);

    fireEvent.click(screen.getByTestId('cluster-create-button'));
    fireEvent.change(screen.getByTestId('cluster-title-input'), {
      target: { value: '결제 장애 클러스터' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Managed System' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Billing Ops' }));
    fireEvent.click(screen.getByTestId('create-cluster-submit'));

    expect(mocks.createCluster).toHaveBeenCalledWith(
      {
        title: '결제 장애 클러스터',
        primary_managed_system_id: '99999999-9999-9999-9999-999999999999',
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });
});
