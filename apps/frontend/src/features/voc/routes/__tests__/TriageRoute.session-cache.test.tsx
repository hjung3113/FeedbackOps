import { VOC_TRIAGE_TAB_EMPTY_LABEL } from '@/lib/copy/voc-views';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/lib/api/nav', () => ({
  fetchNavCounts: vi.fn(),
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [], isSuccess: true, isLoading: false, error: null }),
}));

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: vi.fn(),
  permissionCheckQueryKey: () => ['permission-check', 'voc.triage', null],
  permissionRequestsMineKey: ['permission-requests-mine'],
}));

import { fetchNavCounts } from '@/lib/api/nav';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { TriageRoute } from '../TriageRoute';

const ADMIN_ME = {
  data: {
    actor: {
      id: 'admin-uuid-1',
      external_id: 'admin-1',
      email: 'admin@test.local',
      display_name: '관리자',
      role_level: 'admin',
    },
    workspace_id: 'ws-1',
  },
  isLoading: false,
  isError: false,
  isPending: false,
  isSuccess: true,
  error: null,
  status: 'success' as const,
  fetchStatus: 'idle' as const,
};

const QUEUED_VOC = {
  id: '00000000-0000-0000-0000-0000000000aa',
  display_id: 'VOC-101',
  title: 'Queued VOC',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'u1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high' as const,
  reporter_facing_status: 'received' as const,
  triage_state: 'untriaged' as const,
  source_context: 'direct_use' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
};

const SECOND_VOC = {
  ...QUEUED_VOC,
  id: '00000000-0000-0000-0000-0000000000bb',
  display_id: 'VOC-102',
  title: 'Second VOC',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const triageKey = (tab: string, pin?: string) => [
  'vocs',
  'triage',
  undefined,
  tab,
  undefined,
  undefined,
  undefined,
  undefined,
  pin,
];

function mountRoute(qc: QueryClient) {
  const node = () => (
    <QueryClientProvider client={qc}>
      <TriageRoute />
      <Toaster />
    </QueryClientProvider>
  );
  const view = render(node());
  return (next: Record<string, unknown>) => {
    searchState = { view: 'triage', ...next };
    view.rerender(node());
  };
}

function serveQueue({ staleFirst = false } = {}) {
  let postponed = false;
  let version = QUEUED_VOC.updated_at;
  let successes = 0;
  let conflicts = 0;
  let waitingReads = 0;
  let failNext = staleFirst;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (init?.method === 'PATCH') {
        if (failNext || new Headers(init.headers).get('If-Match') !== version) {
          failNext = false;
          conflicts += 1;
          version = '2026-01-03T00:00:00.000Z';
          return json({ code: 'conflict.stale_write', message: 'stale', detail: {} }, 409);
        }
        successes += 1;
        postponed = JSON.parse(String(init.body)).postpone_review;
        version = `2026-01-${String(successes + 3).padStart(2, '0')}T00:00:00.000Z`;
        return json({ updated_at: version });
      }
      if (url.pathname.endsWith('/vocs')) {
        const voc = { ...QUEUED_VOC, updated_at: version };
        if (url.searchParams.get('tab') === 'waiting') {
          waitingReads += 1;
          return json({ items: postponed ? [voc] : [] });
        }
        return json({ items: postponed ? [SECOND_VOC] : [voc, SECOND_VOC] });
      }
      return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
    }),
  );
  return {
    successes: () => successes,
    conflicts: () => conflicts,
    waitingReads: () => waitingReads,
  };
}

describe('TriageRoute — FIX1 session and cache regressions', () => {
  beforeEach(() => {
    searchState = { view: 'triage', tab: 'untriaged' };
    navigateMock.mockReset();
    vi.mocked(fetchNavCounts).mockResolvedValue({ counts: { 'voc.triage': 2 } });
    vi.mocked(useMe).mockReturnValue(ADMIN_ME as unknown as ReturnType<typeof useMe>);
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: { state: 'approved', decision: { allow: true, via: 'role' } },
    } as unknown as ReturnType<typeof usePermissionCheck>);
  });
  afterEach(() => {
    toast.dismiss();
    vi.unstubAllGlobals();
  });

  it('keeps postponed B excluded and session progress when selecting A', async () => {
    let postponed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        if (init?.method === 'PATCH') {
          postponed = true;
          return json({ updated_at: '2026-01-02T00:00:00.000Z' });
        }
        if (url.pathname.endsWith('/vocs')) return json({ items: [QUEUED_VOC, SECOND_VOC] });
        return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const navigate = mountRoute(qc);
    await screen.findByRole('button', { name: /VOC-101/ });
    fireEvent.click(screen.getByRole('button', { name: /VOC-101/ }));
    navigate({ tab: 'untriaged', selected: QUEUED_VOC.id });
    await screen.findByRole('button', { name: /VOC-102/ });
    fireEvent.click(screen.getByRole('button', { name: /VOC-102/ }));
    navigate({ tab: 'untriaged', selected: SECOND_VOC.id });
    await screen.findByRole('heading', { name: 'Second VOC' });
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await waitFor(() => expect(postponed).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: /VOC-102/ })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /VOC-101/ }));
    navigate({ tab: 'untriaged', selected: QUEUED_VOC.id });
    await screen.findByRole('heading', { name: 'Queued VOC' });
    expect(screen.queryByRole('button', { name: /VOC-102/ })).toBeNull();
    expect(screen.getByTestId('triage-processed-count')).toHaveTextContent('· 1건 처리됨');
    qc.clear();
  });

  it('keeps successful progress across tab and scope reads, then clears it on undo', async () => {
    let postponed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        if (init?.method === 'PATCH') {
          postponed = JSON.parse(String(init.body)).postpone_review;
          return json({ updated_at: '2026-01-02T00:00:00.000Z' });
        }
        if (url.pathname.endsWith('/vocs')) return json({ items: [QUEUED_VOC, SECOND_VOC] });
        return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const navigate = mountRoute(qc);
    await screen.findByRole('button', { name: /VOC-101/ });
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await waitFor(() => expect(postponed).toBe(true));
    navigate({ tab: 'waiting' });
    await screen.findByRole('button', { name: /VOC-101/ });
    expect(screen.getByTestId('triage-processed-count')).toHaveTextContent('1건 처리됨');
    navigate({ tab: 'untriaged', managedSystem: 'ms-1' });
    await screen.findByRole('button', { name: /VOC-101/ });
    expect(screen.getByTestId('triage-processed-count')).toHaveTextContent('1건 처리됨');
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await waitFor(() => expect(postponed).toBe(false));
    await waitFor(() => expect(screen.queryByTestId('triage-processed-count')).toBeNull());
    qc.clear();
  });

  it('refetches a cached waiting tab after a successful postpone', async () => {
    const server = serveQueue();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(triageKey('waiting'), { items: [] });
    const navigate = mountRoute(qc);
    await screen.findByRole('button', { name: /VOC-101/ });
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await waitFor(() => expect(server.successes()).toBe(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: /VOC-101/ })).toBeNull());
    expect(screen.getByTestId('triage-processed-count')).toHaveTextContent('1건 처리됨');
    navigate({ tab: 'waiting' });
    await screen.findByRole('button', { name: /VOC-101/ });
    expect(server.waitingReads()).toBe(1);
    qc.clear();
  });

  it('refreshes If-Match after undo so postponing the same VOC succeeds again', async () => {
    const server = serveQueue();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mountRoute(qc);
    await screen.findByRole('button', { name: /VOC-101/ });
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await waitFor(() => expect(server.successes()).toBe(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: /VOC-101/ })).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await screen.findByRole('button', { name: /VOC-101/ });
    await waitFor(() => expect(screen.queryByTestId('triage-processed-count')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /VOC-101/ }));
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await waitFor(() => expect(server.successes()).toBe(3));
    expect(server.conflicts()).toBe(0);
    expect(screen.getByTestId('triage-processed-count')).toHaveTextContent('1건 처리됨');
    qc.clear();
  });

  it('refreshes stale-write data and dismisses only the failed command success toast', async () => {
    const server = serveQueue({ staleFirst: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mountRoute(qc);
    await screen.findByRole('button', { name: /VOC-101/ });
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await screen.findByText('다른 사용자가 먼저 수정했습니다. 새로 불러왔습니다.');
    await waitFor(() => expect(screen.queryByText('VOC-101 보류 처리됨')).toBeNull());
    expect(screen.queryByTestId('triage-processed-count')).toBeNull();
    await screen.findByRole('button', { name: /VOC-101/ });
    fireEvent.click(screen.getByRole('button', { name: /VOC-101/ }));
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await waitFor(() => expect(server.successes()).toBe(1));
    expect(server.conflicts()).toBe(1);
    qc.clear();
  });

  it('does not count a pending action undone before its success or compensation', async () => {
    let resolveForward!: (response: Response) => void;
    let resolveCompensation!: (response: Response) => void;
    const forward = new Promise<Response>((resolve) => {
      resolveForward = resolve;
    });
    const compensation = new Promise<Response>((resolve) => {
      resolveCompensation = resolve;
    });
    let compensating = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        if (init?.method === 'PATCH') {
          if (JSON.parse(String(init.body)).postpone_review) return forward;
          compensating = true;
          return compensation;
        }
        if (url.pathname.endsWith('/vocs')) return json({ items: [QUEUED_VOC, SECOND_VOC] });
        return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mountRoute(qc);
    await screen.findByRole('button', { name: /VOC-101/ });
    fireEvent.click(screen.getByRole('button', { name: '보류' }));
    expect(screen.queryByTestId('triage-processed-count')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await act(async () => {
      resolveForward(json({ updated_at: '2026-01-02T00:00:00.000Z' }));
    });
    await waitFor(() => expect(compensating).toBe(true));
    expect(screen.queryByTestId('triage-processed-count')).toBeNull();
    await act(async () => {
      resolveCompensation(json({ updated_at: '2026-01-03T00:00:00.000Z' }));
    });
    expect(screen.queryByTestId('triage-processed-count')).toBeNull();
    qc.clear();
  });
});

// #935: a failed queue read must show the load-error state with a retry
// button — not the whole-queue or tab-empty copy. These run the real
// useVocList against a stubbed global fetch, the seam the mocked-hook tests
// cannot exercise. The hook sets `retry: 1` itself (overriding the QueryClient
// default), so a settled failure takes ~1 s: waits pass an explicit timeout
// instead of relying on the findBy default.
describe('TriageRoute — failed queue read (#935)', () => {
  const SETTLE = { timeout: 5_000 } as const;

  beforeEach(() => {
    searchState = { view: 'triage', tab: 'untriaged' };
    navigateMock.mockReset();
    vi.mocked(fetchNavCounts).mockResolvedValue({ counts: { 'voc.triage': 2 } });
    vi.mocked(useMe).mockReturnValue(ADMIN_ME as unknown as ReturnType<typeof useMe>);
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: { state: 'approved', decision: { allow: true, via: 'role' } },
    } as unknown as ReturnType<typeof usePermissionCheck>);
  });

  afterEach(() => {
    toast.dismiss();
    vi.unstubAllGlobals();
  });

  it.each([
    { case: 'a', description: 'uncached key whose queue request fails every call' },
    { case: 'b', description: 'cached empty page whose background refetch fails every call' },
  ])(
    'shows the queue error state in the queue column and recovers on retry ($case: $description)',
    async ({ case: kind }) => {
      let failReads = kind === 'a';
      let serveRows = false;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = new URL(String(input), 'http://localhost');
          if (url.pathname.endsWith('/vocs')) {
            if (failReads) return json({ code: 'internal.unexpected', message: 'boom' }, 500);
            return json({ items: serveRows ? [QUEUED_VOC, SECOND_VOC] : [] });
          }
          return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
        }),
      );
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      mountRoute(qc);
      if (kind === 'b') {
        // The first read of this key succeeds with an empty page; every later
        // read fails, so a background refetch fails over a cached empty page
        // (TanStack keeps the last success: data stays, items stay zero).
        await screen.findByText(VOC_TRIAGE_TAB_EMPTY_LABEL);
        failReads = true;
        await act(async () => {
          await qc.invalidateQueries({ queryKey: triageKey('untriaged') });
        });
      }
      const panel = screen.getByRole('tabpanel');
      expect(await within(panel).findByText('불러오기 실패', {}, SETTLE)).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
      // Toolbar and tablist stay mounted, as for queuePending.
      expect(screen.getByRole('tab', { name: /미분류/ })).toBeInTheDocument();
      expect(screen.queryByText('큐가 비었습니다')).not.toBeInTheDocument();
      expect(screen.queryByText(VOC_TRIAGE_TAB_EMPTY_LABEL)).not.toBeInTheDocument();

      // Reads succeed again → retry refetches the queue and renders rows.
      failReads = false;
      serveRows = true;
      fireEvent.click(within(panel).getByRole('button', { name: '다시 시도' }));
      expect(
        await within(panel).findByRole('button', { name: /VOC-101/ }, SETTLE),
      ).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: /VOC-102/ })).toBeInTheDocument();
      qc.clear();
    },
  );

  it('keeps cached rows and shows no queue error when a background refetch of a non-empty page fails', async () => {
    let failReads = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.endsWith('/vocs')) {
          if (failReads) return json({ code: 'internal.unexpected', message: 'boom' }, 500);
          return json({ items: [QUEUED_VOC, SECOND_VOC] });
        }
        return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mountRoute(qc);
    await screen.findByRole('button', { name: /VOC-101/ });
    failReads = true;
    await act(async () => {
      await qc.invalidateQueries({ queryKey: triageKey('untriaged') });
    });
    expect(screen.getByRole('button', { name: /VOC-101/ })).toBeInTheDocument();
    expect(screen.queryByText('불러오기 실패')).not.toBeInTheDocument();
    qc.clear();
  });

  it('suppresses the deep-link-missing notice while the queue read failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.endsWith('/vocs')) {
          return json({ code: 'internal.unexpected', message: 'boom' }, 500);
        }
        return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    searchState = {
      view: 'triage',
      tab: 'untriaged',
      selected: '00000000-0000-0000-0000-0000000000cc',
    };
    mountRoute(qc);
    expect(
      await within(screen.getByRole('tabpanel')).findByText('불러오기 실패', {}, SETTLE),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('triage-deeplink-missing')).not.toBeInTheDocument();
    qc.clear();
  });
});
