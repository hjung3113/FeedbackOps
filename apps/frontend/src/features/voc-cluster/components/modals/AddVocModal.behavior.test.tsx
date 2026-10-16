// Behaviour of the Cluster `VOC 추가` picker (#1176) through the real VocClusterDetailPanel, the
// real candidate/add hooks and a real QueryClient. Only the network edge is faked, and it parses
// every request and response with the shared schemas.

import { ApiError } from '@/lib/api';
import { listSameManagedSystemCandidatePeersQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLUSTER_ID = '11111111-1111-1111-1111-111111111111';

const net = vi.hoisted(() => ({
  gets: [] as string[],
  posts: [] as string[],
  postImpl: undefined as undefined | ((vocId: string) => Promise<void>),
  candidates: [] as Array<{
    voc_id: string;
    display_id: string;
    title: string;
    severity: string | null;
    reporter_facing_status: string;
  }>,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { role_level: 'admin' } } }),
}));
vi.mock('@/lib/cross-system/useManagedSystem', () => ({ useManagedSystem: () => null }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ data: { actors: [], teams: [] }, isLoading: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useVocClusterDetail', async () => {
  const data = {
    id: '11111111-1111-1111-1111-111111111111',
    workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    display_id: 'CLU-31',
    title: '반복 결제 문의',
    summary: null,
    status: 'draft',
    primary_managed_system_id: '99999999-9999-9999-9999-999999999999',
    created_by: '22222222-2222-2222-2222-222222222222',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    members: [],
    member_count: 0,
    linked_findings: [],
  };
  return {
    useVocClusterDetail: () => ({
      data,
      isLoading: false,
      isError: false,
      isSuccess: true,
      isFetching: false,
      error: null,
    }),
  };
});
vi.mock('@/features/voc-cluster/hooks/useConfirmCluster', () => ({
  useConfirmCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useRemoveClusterMember', () => ({
  useRemoveClusterMember: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));
vi.mock('@/features/voc-cluster/hooks/useRequestTaskFromCluster', () => ({
  useRequestTaskFromCluster: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useCreateFindingFromCluster', () => ({
  useCreateFindingFromCluster: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster', () => ({
  useLinkExistingFindingToVocCluster: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));
vi.mock('@/features/findings/hooks/useFindingsList', () => ({
  useFindingsList: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  const { listSameManagedSystemCandidatePeersQuerySchema: querySchema, ...shared } = await import(
    '@fops/shared'
  );
  return {
    ...actual,
    useIdempotencyKey: () => ({ key: 'idem-key', markConsumed: vi.fn() }),
    apiRequest: vi.fn(async (_method: string, path: string) => {
      net.gets.push(path);
      const url = new URL(path, 'http://x');
      const query = querySchema.parse(Object.fromEntries(url.searchParams));
      const matches = net.candidates.filter(
        (c) =>
          query.q === undefined ||
          c.display_id.toLowerCase().startsWith(query.q.toLowerCase()) ||
          c.title.toLowerCase().includes(query.q.toLowerCase()),
      );
      const start = query.cursor === undefined ? 0 : Number(atob(query.cursor));
      const end = start + query.limit;
      return {
        data: shared.listSameManagedSystemCandidatePeersResponseSchema.parse({
          candidate_basis: 'same_managed_system_active_voc',
          candidates: matches.slice(start, end),
          page: {
            has_more: end < matches.length,
            ...(end < matches.length ? { cursor: btoa(String(end)) } : {}),
          },
        }),
      };
    }),
    apiClient: vi.fn(async (_method: string, path: string, init: { body: unknown }) => {
      const body = shared.addVocClusterMemberRequestSchema.parse(init.body);
      expect(path).toBe(`/voc-clusters/${'11111111-1111-1111-1111-111111111111'}/vocs`);
      net.posts.push(body.voc_id);
      await net.postImpl?.(body.voc_id);
      return { data: undefined };
    }),
  };
});

import { VocClusterDetailPanel } from '@/features/voc-cluster/components/detail/VocClusterDetailPanel';

const vocId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function seed(count: number) {
  net.candidates = Array.from({ length: count }, (_, i) => ({
    voc_id: vocId(i + 1),
    display_id: `VOC-${i + 1}`,
    title: `문의 ${i + 1}`,
    severity: i === 0 ? 'high' : null,
    reporter_facing_status: i === 0 ? 'reviewing' : 'received',
  }));
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VocClusterDetailPanel clusterId={CLUSTER_ID} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

const openPicker = () => fireEvent.click(screen.getByTestId('cluster-add-voc-button'));
const addButton = (n: number) => screen.getByTestId(`add-voc-add-${vocId(n)}`);
const firstPageReads = () => net.gets.filter((path) => !path.includes('cursor=')).length;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Cluster VOC 추가 picker', () => {
  beforeEach(() => {
    net.gets = [];
    net.posts = [];
    net.postImpl = undefined;
    seed(45);
  });

  it('sends one debounced request carrying the typed q', async () => {
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');
    const before = net.gets.length;

    await userEvent.type(screen.getByPlaceholderText('제목 또는 ID'), 'VOC-4');

    await waitFor(() => expect(net.gets.length).toBe(before + 1), { timeout: 2000 });
    const sent = net.gets.slice(before).map((path) => new URL(path, 'http://x').searchParams);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.get('q')).toBe('VOC-4');
    // display-ID prefix matches VOC-4 and VOC-40..45
    expect(await screen.findAllByTestId(/^add-voc-candidate-/)).toHaveLength(7);
  });

  it('shows the empty search label when nothing matches', async () => {
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');
    await userEvent.type(screen.getByPlaceholderText('제목 또는 ID'), 'zzz');
    expect(await screen.findByText('검색 결과가 없습니다.', {}, { timeout: 2000 })).toBeVisible();
  });

  it('pages with 더 불러오기, sending the cursor, and labels rows from the shared maps', async () => {
    renderPanel();
    openPicker();
    const first = await screen.findByTestId(`add-voc-candidate-${vocId(1)}`);
    expect(first).toHaveTextContent('VOC-1 · 문의 1 · 높음 · 검토 중');
    expect(screen.getByTestId(`add-voc-candidate-${vocId(2)}`)).toHaveTextContent(
      'VOC-2 · 문의 2 · 미지정 · 접수됨',
    );
    expect(screen.getByTestId('add-voc-modal')).not.toHaveTextContent(/\b(high|reviewing)\b/);
    expect(screen.getAllByTestId(/^add-voc-candidate-/)).toHaveLength(20);

    fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));

    await waitFor(() => expect(screen.getAllByTestId(/^add-voc-candidate-/)).toHaveLength(40));
    const cursorRead = net.gets.find((path) => path.includes('cursor='));
    expect(
      listSameManagedSystemCandidatePeersQuerySchema.parse(
        Object.fromEntries(new URL(cursorRead as string, 'http://x').searchParams),
      ).cursor,
    ).toBe(btoa('20'));
  });

  it('adds three VOCs in sequence without reopening, each row turning 추가됨', async () => {
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');

    for (const n of [1, 2, 3]) {
      fireEvent.click(addButton(n));
      await waitFor(() => expect(addButton(n)).toHaveTextContent('추가됨'));
      expect(addButton(n)).toBeDisabled();
    }

    expect(net.posts).toEqual([vocId(1), vocId(2), vocId(3)]);
    expect(screen.getByTestId('add-voc-modal')).toBeInTheDocument();
    expect(firstPageReads()).toBeGreaterThanOrEqual(1);
  });

  it('keeps added rows in place when the refetch no longer returns them', async () => {
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');
    const reads = net.gets.length;
    net.candidates = net.candidates.filter((c) => c.voc_id !== vocId(1));

    fireEvent.click(addButton(1));
    await waitFor(() => expect(addButton(1)).toHaveTextContent('추가됨'));
    await waitFor(() => expect(net.gets.length).toBeGreaterThan(reads));

    const rows = screen.getAllByTestId(/^add-voc-candidate-/);
    expect(rows[0]).toHaveAttribute('data-testid', `add-voc-candidate-${vocId(1)}`);
    expect(rows[1]).toHaveAttribute('data-testid', `add-voc-candidate-${vocId(2)}`);
  });

  it('sends nothing for a second click on a pending row', async () => {
    const gate = deferred();
    net.postImpl = () => gate.promise;
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');

    await act(async () => {
      fireEvent.click(addButton(1));
      fireEvent.click(addButton(1));
    });

    expect(net.posts).toEqual([vocId(1)]);
    expect(addButton(1)).toBeDisabled();
    await act(async () => gate.resolve());
    await waitFor(() => expect(addButton(1)).toHaveTextContent('추가됨'));
    expect(net.posts).toHaveLength(1);
  });

  it('shows the mapped error inline on failure and a retry sends one more POST', async () => {
    net.postImpl = async () => {
      throw new ApiError(500, { code: 'internal.unexpected', message: 'boom' });
    };
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');

    fireEvent.click(addButton(1));
    const error = await screen.findByTestId(`add-voc-error-${vocId(1)}`);
    expect(error).toHaveTextContent(/\S/);
    expect(addButton(1)).toBeEnabled();
    expect(addButton(1)).toHaveTextContent('추가');
    expect(addButton(1)).not.toHaveTextContent('추가됨');

    net.postImpl = undefined;
    fireEvent.click(addButton(1));
    await waitFor(() => expect(addButton(1)).toHaveTextContent('추가됨'));
    expect(net.posts).toEqual([vocId(1), vocId(1)]);
    expect(screen.queryByTestId(`add-voc-error-${vocId(1)}`)).not.toBeInTheDocument();
  });

  it('settles overlapping adds independently, whichever resolves first', async () => {
    const a = deferred();
    const b = deferred();
    net.postImpl = (id) => (id === vocId(1) ? a.promise : b.promise);
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');

    fireEvent.click(addButton(1));
    fireEvent.click(addButton(2));
    await waitFor(() => expect(net.posts).toHaveLength(2));
    await act(async () => b.resolve());
    await waitFor(() => expect(addButton(2)).toHaveTextContent('추가됨'));
    expect(addButton(1)).toBeDisabled();
    expect(addButton(1)).not.toHaveTextContent('추가됨');

    await act(async () => a.resolve());
    await waitFor(() => expect(addButton(1)).toHaveTextContent('추가됨'));
    expect(addButton(2)).toHaveTextContent('추가됨');
  });

  it('reads a fresh first page when the picker is reopened', async () => {
    renderPanel();
    openPicker();
    await screen.findByTestId('add-voc-candidates');
    expect(firstPageReads()).toBe(1);

    fireEvent.click(screen.getByTestId('add-voc-cancel'));
    await waitFor(() => expect(screen.queryByTestId('add-voc-modal')).not.toBeInTheDocument());
    openPicker();
    await screen.findByTestId('add-voc-candidates');

    expect(firstPageReads()).toBe(2);
  });

  it.each([
    ['footer 닫기', () => fireEvent.click(screen.getByTestId('add-voc-cancel'))],
    ['Escape', () => fireEvent.keyDown(document.body, { key: 'Escape' })],
  ])('returns focus to VOC 추가 after %s', async (_label, exit) => {
    renderPanel();
    const trigger = screen.getByTestId('cluster-add-voc-button');
    await userEvent.click(trigger);
    await screen.findByTestId('add-voc-candidates');

    exit();

    await waitFor(() => expect(screen.queryByTestId('add-voc-modal')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it.each([
    ['footer 닫기', () => fireEvent.click(screen.getByTestId('add-voc-cancel'))],
    ['Escape', () => fireEvent.keyDown(document.body, { key: 'Escape' })],
  ])(
    'starts a clean session after %s while a POST is pending, ignoring its late settlement',
    async (_label, exit) => {
      const gate = deferred();
      net.postImpl = () => gate.promise;
      renderPanel();
      openPicker();
      await screen.findByTestId('add-voc-candidates');
      fireEvent.click(addButton(1));
      await waitFor(() => expect(net.posts).toEqual([vocId(1)]));

      exit();
      await waitFor(() => expect(screen.queryByTestId('add-voc-modal')).not.toBeInTheDocument());
      openPicker();
      await screen.findByTestId('add-voc-candidates');
      expect(firstPageReads()).toBe(2);
      expect(addButton(1)).toHaveTextContent('추가');
      expect(addButton(1)).not.toHaveTextContent('추가됨');
      expect(addButton(1)).toBeEnabled();

      await act(async () => gate.resolve());

      const modal = screen.getByTestId('add-voc-modal');
      expect(within(modal).queryByText('추가됨')).not.toBeInTheDocument();
      expect(screen.queryByTestId(`add-voc-error-${vocId(1)}`)).not.toBeInTheDocument();
      expect(addButton(1)).toBeEnabled();
    },
  );
});
