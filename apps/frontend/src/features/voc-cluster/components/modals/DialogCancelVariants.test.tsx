import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, emptyCandidates } = vi.hoisted(() => ({
  navigate: vi.fn(),
  emptyCandidates: { pages: [{ candidates: [], page: { has_more: false } }] },
}));

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
  useAddClusterMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useCandidatePeers', () => ({
  useCandidatePeers: () => ({
    data: emptyCandidates,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
  }),
}));

import { AddVocModal } from './AddVocModal';
import { CreateFindingFromClusterModal } from './CreateFindingFromClusterModal';
import { LinkExistingFindingModal } from './LinkExistingFindingModal';

const dialogs = [
  {
    name: 'AddVocModal',
    render: () => (
      <AddVocModal open clusterId="10000000-0000-0000-0000-000000000001" onClose={vi.fn()} />
    ),
    // The picker's footer action is a single 닫기; DialogContent already owns an icon button of
    // that name, so it is located by its test id.
    cancel: () => screen.getByTestId('add-voc-cancel'),
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
    cancel: () => screen.getByRole('button', { name: '취소' }),
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
    cancel: () => screen.getByRole('button', { name: '취소' }),
  },
] as const;

describe('VOC Cluster dialog cancel variants', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(dialogs)('$name renders a named cancel action', ({ render: renderDialog, cancel }) => {
    render(renderDialog());

    expect(cancel()).toBeInTheDocument();
  });
});
