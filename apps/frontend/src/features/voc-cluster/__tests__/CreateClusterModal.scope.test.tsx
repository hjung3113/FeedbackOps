import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const IN_SCOPE = '99999999-9999-9999-9999-999999999999';
const OUT_OF_SCOPE = '88888888-8888-8888-8888-888888888888';

const mocks = vi.hoisted(() => ({
  createCluster: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data:
      queryKey[0] === 'permission-scope'
        ? { scope: { kind: 'scoped', managed_system_ids: [IN_SCOPE] } }
        : {
            items: [
              { id: IN_SCOPE, name: 'Billing Ops', archived_at: null },
              { id: OUT_OF_SCOPE, name: 'Growth Lab', archived_at: null },
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
    <div>{toolbarActions}</div>
  ),
}));

vi.mock('@/features/voc-cluster/hooks/useCreateVocCluster', () => ({
  useCreateVocCluster: () => ({ mutate: mocks.createCluster, reset: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { role_level: 'developer' } } }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('CreateClusterModal Managed System scope', () => {
  beforeEach(() => {
    mocks.createCluster.mockReset();
  });

  it('lists only the Managed Systems inside the finding.manage scope', async () => {
    const { VocClusterListPage } = await import('@/routes/_authed/voc-clusters/index');
    render(<VocClusterListPage />);

    fireEvent.click(screen.getByTestId('cluster-create-button'));
    fireEvent.click(screen.getByRole('combobox', { name: 'Managed System' }));

    expect(await screen.findByRole('option', { name: 'Billing Ops' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Growth Lab' })).not.toBeInTheDocument();
  });

  it('shows the specific message when the server still denies the create', async () => {
    const { ApiError } = await import('@/lib/api');
    const { CLUSTER_CREATE_COPY } = await import('@/lib/copy/voc-cluster');
    mocks.createCluster.mockImplementation(
      (_body: unknown, opts: { onError: (e: unknown) => void }) =>
        opts.onError(new ApiError(403, { code: 'permission.denied', message: 'denied' })),
    );
    const { VocClusterListPage } = await import('@/routes/_authed/voc-clusters/index');
    render(<VocClusterListPage />);

    fireEvent.click(screen.getByTestId('cluster-create-button'));
    fireEvent.change(screen.getByTestId('cluster-title-input'), { target: { value: '제목' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Managed System' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Billing Ops' }));
    fireEvent.click(screen.getByTestId('create-cluster-submit'));

    expect(await screen.findByTestId('create-cluster-error')).toHaveTextContent(
      CLUSTER_CREATE_COPY.denied,
    );
  });
});
