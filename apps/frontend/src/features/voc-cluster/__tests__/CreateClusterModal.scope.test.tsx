import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const IN_SCOPE = '99999999-9999-9999-9999-999999999999';
const OUT_OF_SCOPE = '88888888-8888-8888-8888-888888888888';

const mocks = vi.hoisted(() => ({
  createCluster: vi.fn(),
  scopeState: {} as { pending?: boolean; error?: boolean; scope?: unknown },
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'permission-scope') {
      const { pending, error, scope } = mocks.scopeState;
      return {
        data:
          pending || error
            ? undefined
            : { scope: scope ?? { kind: 'scoped', managed_system_ids: [IN_SCOPE] } },
        isPending: pending === true,
        isLoading: pending === true,
        isError: error === true,
      };
    }
    return {
      data: {
        items: [
          { id: IN_SCOPE, name: 'Billing Ops', archived_at: null },
          { id: OUT_OF_SCOPE, name: 'Growth Lab', archived_at: null },
        ],
      },
      isPending: false,
      isLoading: false,
      isError: false,
    };
  },
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
    mocks.scopeState = {};
  });

  it('disables the picker while the scope is pending', async () => {
    mocks.scopeState = { pending: true };
    const { VocClusterListPage } = await import('@/routes/_authed/voc-clusters/index');
    render(<VocClusterListPage />);

    fireEvent.click(screen.getByTestId('cluster-create-button'));

    expect(screen.getByRole('combobox', { name: 'Managed System' })).toBeDisabled();
  });

  it('lists every active system when the scope query errors', async () => {
    mocks.scopeState = { error: true };
    const { VocClusterListPage } = await import('@/routes/_authed/voc-clusters/index');
    render(<VocClusterListPage />);

    fireEvent.click(screen.getByTestId('cluster-create-button'));
    fireEvent.click(screen.getByRole('combobox', { name: 'Managed System' }));

    expect(await screen.findByRole('option', { name: 'Billing Ops' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Growth Lab' })).toBeInTheDocument();
  });

  it('does not submit a selection that fell out of the resolved scope', async () => {
    mocks.scopeState = { scope: { kind: 'all' } };
    const { VocClusterListPage } = await import('@/routes/_authed/voc-clusters/index');
    const { rerender } = render(<VocClusterListPage />);

    fireEvent.click(screen.getByTestId('cluster-create-button'));
    fireEvent.change(screen.getByTestId('cluster-title-input'), { target: { value: '제목' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Managed System' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Growth Lab' }));

    mocks.scopeState = {};
    rerender(<VocClusterListPage />);
    fireEvent.click(screen.getByTestId('create-cluster-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Managed System을 선택하세요.');
    expect(mocks.createCluster).not.toHaveBeenCalled();
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
