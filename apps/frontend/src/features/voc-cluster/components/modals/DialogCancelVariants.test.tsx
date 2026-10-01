import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    useIdempotencyKey: () => ({ key: 'idem-key', markConsumed: vi.fn() }),
  };
});
vi.mock('@/features/findings/hooks/useFindingsList', () => ({
  useFindingsList: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster', () => ({
  useLinkExistingFindingToVocCluster: () => ({
    mutate: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));
vi.mock('@/features/voc-cluster/hooks/useCreateFindingFromCluster', () => ({
  useCreateFindingFromCluster: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));
vi.mock('@/features/voc-cluster/hooks/useAddClusterMember', () => ({
  useAddClusterMember: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));
vi.mock('@/features/voc-cluster/hooks/useCandidatePeers', () => ({
  useCandidatePeers: () => ({ data: { candidates: [] }, isLoading: false, isError: false }),
}));

import { AddVocModal } from './AddVocModal';
import { CreateFindingFromClusterModal } from './CreateFindingFromClusterModal';
import { LinkExistingFindingModal } from './LinkExistingFindingModal';

const dialogs = [
  {
    name: 'AddVocModal',
    render: () => (
      <AddVocModal
        open
        clusterId="10000000-0000-0000-0000-000000000001"
        members={[]}
        onClose={vi.fn()}
      />
    ),
  },
  {
    name: 'CreateFindingFromClusterModal',
    render: () => (
      <CreateFindingFromClusterModal
        open
        clusterId="10000000-0000-0000-0000-000000000001"
        onClose={vi.fn()}
      />
    ),
  },
  {
    name: 'LinkExistingFindingModal',
    render: () => (
      <LinkExistingFindingModal
        open
        clusterId="10000000-0000-0000-0000-000000000001"
        onClose={vi.fn()}
      />
    ),
  },
] as const;

describe('VOC Cluster dialog cancel variants', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(dialogs)('$name cancel action uses secondary styling', ({ render: renderDialog }) => {
    render(renderDialog());

    expect(screen.getByRole('button', { name: '취소' })).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );
  });
});
