import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, expect, it, vi } from 'vitest';
import { TriageRoute } from '../TriageRoute';

const rows: VocListItem[] = [1, 2, 3, 4].map((n) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  display_id: `VOC-${n}`,
  title: `Queue item ${n}`,
  primary_managed_system_id: 'scope-a',
  analytics_area_id: null,
  reporter_id: 'reporter',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
}));
const second = rows[1] as VocListItem;
const third = rows[2] as VocListItem;
function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

function mount({
  tab = 'untriaged',
  items = rows,
  holdPin,
  holdTab,
  holdPermission,
  holdPatch,
  compensationAware = false,
}: {
  tab?: string;
  items?: VocListItem[];
  holdPin?: ReturnType<typeof deferred>;
  holdTab?: ReturnType<typeof deferred>;
  holdPermission?: ReturnType<typeof deferred>;
  holdPatch?: ReturnType<typeof deferred>;
  compensationAware?: boolean;
} = {}) {
  const serverRows = new Map(items.map((row) => [row.id, { ...row }]));
  const processed = new Set<string>();
  const confirmed = new Set<string>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/me/permissions/check') {
        if (holdPermission && url.searchParams.has('managed_system_id'))
          return holdPermission.promise;
        return json({ state: 'approved', decision: { allow: true } });
      }
      if (init?.method === 'PATCH') {
        const id = url.pathname.split('/')[2] as string;
        const body = JSON.parse(String(init.body));
        if (compensationAware) {
          const row = serverRows.get(id);
          if (row) {
            Object.assign(row, body);
            if (row.triage_state === 'untriaged' && !body.postpone_review) processed.delete(id);
            else processed.add(id);
            if (row.triage_state === 'untriaged') confirmed.delete(id);
            else confirmed.add(id);
          }
        } else {
          processed.add(id);
          if (!body.postpone_review) confirmed.add(id);
        }
        if (holdPatch) return holdPatch.promise;
        return json({ updated_at: '2026-01-02T00:00:00.000Z' });
      }
      if (init?.method === 'POST') return json({ id: 'finding-created' });
      if (url.pathname === '/vocs') {
        if (holdTab && url.searchParams.get('tab') === 'high') return holdTab.promise;
        const pin = url.searchParams.get('pin_voc_id');
        if (holdPin && pin === third.id) return holdPin.promise;
        // All rows belong to scope-a: a processed pin would be unioned back in.
        return json({
          items: (compensationAware ? [...serverRows.values()] : items).filter(
            (row) =>
              !(url.searchParams.get('tab') === 'untriaged' ? processed : confirmed).has(row.id) ||
              row.id === pin,
          ),
        });
      }
      if (url.pathname === '/nav/counts') return json({ counts: { 'voc.triage': items.length } });
      return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  client.setQueryData(ME_QUERY_KEY, {
    actor: { id: 'admin', role_level: 'admin' },
    workspace_id: 'ws',
  });
  const root = createRootRoute();
  const vocs = createRoute({
    getParentRoute: () => root,
    path: '/vocs',
    validateSearch: (search: Record<string, unknown>) => search,
    component: TriageRoute,
  });
  const findings = createRoute({
    getParentRoute: () => root,
    path: '/findings',
    component: () => <div>Findings destination</div>,
  });
  const history = createMemoryHistory({
    initialEntries: [
      `/vocs?view=triage&tab=${tab}&selected=${items.length === 1 ? items[0]?.id : second.id}`,
    ],
  });
  const router = createRouter({ routeTree: root.addChildren([vocs, findings]), history });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history };
}
async function confirm() {
  fireEvent.click(screen.getByRole('button', { name: '낮음' }));
  fireEvent.click(screen.getByRole('button', { name: /Triage 확정/ }));
}

it('cancels Finding focus superseded by Back before dismissal and Forward', async () => {
  const { router, history } = mount();
  await screen.findByRole('heading', { name: second.title });
  fireEvent.click(screen.getByRole('button', { name: /VOC-1/ }));
  await screen.findByRole('heading', { name: 'Queue item 1' });
  fireEvent.click(screen.getByRole('button', { name: /VOC-2/ }));
  await screen.findByRole('heading', { name: second.title });
  fireEvent.click(screen.getByRole('button', { name: 'Finding 만들기' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  await waitFor(() => expect(router.state.location.search.selected).toBe(third.id));
  await act(async () => history.back());
  await waitFor(() => expect(router.state.location.search.selected).toBe(rows[0]?.id));
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const tab = screen.getByRole('tab', { name: /미분류/ });
  tab.focus();
  await act(async () => history.forward());
  await screen.findByRole('heading', { name: third.title });
  expect(router.state.location.search.selected).toBe(third.id);
  expect(tab).toHaveFocus();
});

it('settled undo restores the server row without changing selection, history or screen focus', async () => {
  toast.dismiss();
  const toaster = render(<Toaster />);
  const { router, history } = mount({ compensationAware: true });
  await screen.findByRole('heading', { name: second.title });
  await confirm();
  const advanced = screen.getByRole('button', { name: /VOC-3/ });
  await waitFor(() => expect(advanced).toHaveFocus());
  await screen.findByText(/1건 처리됨/);
  const client = clients[clients.length - 1] as QueryClient;
  await waitFor(() => expect(client.isFetching({ queryKey: ['vocs', 'triage'] })).toBe(0));
  expect(screen.queryByRole('button', { name: /VOC-2/ })).toBeNull();
  const location = history.location.href;
  const length = history.length;
  const index = history.location.state.__TSR_index;
  const serverFetch = fetch;
  let compensated = false;
  let postCompensationRows: VocListItem[] | null = null;
  let postCompensationPin: string | null = null;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await serverFetch(input, init);
    const url = new URL(String(input), 'http://localhost');
    if (init?.method === 'PATCH' && JSON.parse(String(init.body)).triage_state === 'untriaged') {
      compensated = true;
    } else if (compensated && url.pathname === '/vocs') {
      postCompensationRows = (await response.clone().json()).items;
      postCompensationPin = url.searchParams.get('pin_voc_id');
    }
    return response;
  });
  const undo = await screen.findByRole('button', { name: '실행 취소' });
  await act(async () => undo.focus());
  expect(undo).toHaveFocus();
  fireEvent.click(undo);
  await waitFor(() =>
    expect(postCompensationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: second.id, triage_state: 'untriaged', severity: 'high' }),
      ]),
    ),
  );
  await waitFor(() => expect(client.isFetching({ queryKey: ['vocs', 'triage'] })).toBe(0));
  expect(postCompensationPin).toBe(third.id);
  expect(screen.getByRole('button', { name: /VOC-2/ })).toBeInTheDocument();
  expect(router.state.location.search.selected).toBe(third.id);
  expect(history.location.href).toBe(location);
  expect(history.length).toBe(length);
  expect(history.location.state.__TSR_index).toBe(index);
  expect(undo).toHaveFocus();
  await act(async () => toaster.unmount());
  expect(advanced).toHaveFocus();
  expect(screen.getByRole('heading', { name: third.title })).toBeInTheDocument();
  expect(screen.queryByText(/1건 처리됨/)).toBeNull();
});

it('undo leaves a different user-selected row and its focus alone', async () => {
  toast.dismiss();
  render(<Toaster />);
  const { router } = mount();
  await screen.findByRole('heading', { name: second.title });
  await confirm();
  await screen.findByText(/1건 처리됨/);
  const fourth = screen.getByRole('button', { name: /VOC-4/ });
  fireEvent.click(fourth);
  await screen.findByRole('heading', { name: 'Queue item 4' });
  fourth.focus();
  fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
  await waitFor(() => expect(screen.queryByText(/1건 처리됨/)).toBeNull());
  expect(router.state.location.search.selected).toBe(rows[3]?.id);
  expect(fourth).toHaveFocus();
});

it.each(['input', 'dialog'])(
  'undo keeps the advanced selection without stealing focus from an external %s',
  async (surface) => {
    toast.dismiss();
    render(<Toaster />);
    render(
      surface === 'input' ? (
        <input aria-label="Other work" />
      ) : (
        <dialog open aria-label="Other work">
          <button type="button">Other action</button>
        </dialog>
      ),
    );
    const { router } = mount();
    await screen.findByRole('heading', { name: second.title });
    await confirm();
    await screen.findByText(/1건 처리됨/);
    const other =
      surface === 'input'
        ? screen.getByRole('textbox', { name: 'Other work' })
        : screen.getByRole('button', { name: 'Other action' });
    other.focus();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await waitFor(() => expect(router.state.location.search.selected).toBe(third.id));
    await screen.findByRole('heading', { name: third.title });
    expect(other).toHaveFocus();
  },
);

it('confirms the middle row, focuses the next row and replaces selected without repinning the processed row in scope', async () => {
  const { router, history } = mount();
  await screen.findByRole('heading', { name: second.title });
  const index = history.location.state.__TSR_index;
  await confirm();
  await waitFor(() => expect(screen.getByRole('button', { name: /VOC-3/ })).toHaveFocus());
  expect(router.state.location.search.selected).toBe(third.id);
  expect(history.location.state.__TSR_index).toBe(index);
  await act(async () => {
    await router.navigate({
      to: '/vocs',
      search: (prev) => ({ ...prev, managedSystem: 'scope-a' }),
    });
  });
  await screen.findByRole('button', { name: /VOC-3/ });
  expect(screen.queryByRole('button', { name: /VOC-2/ })).not.toBeInTheDocument();
});

it('marks on unassigned and focuses the next row while keeping the marked row', async () => {
  const { router } = mount({ tab: 'unassigned' });
  await screen.findByRole('heading', { name: second.title });
  fireEvent.click(screen.getByRole('button', { name: '보류' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /VOC-3/ })).toHaveFocus());
  expect(screen.getByRole('button', { name: /VOC-2/ })).toBeInTheDocument();
  expect(router.state.location.search.selected).toBe(third.id);
});

it.each(['confirm', 'postpone'])(
  'focuses the active tab and clears selected on singleton removal: %s',
  async (action) => {
    const { router } = mount({ items: [second] });
    await screen.findByRole('heading', { name: second.title });
    if (action === 'confirm') await confirm();
    else fireEvent.click(screen.getByRole('button', { name: '보류' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /미분류/ })).toHaveFocus());
    expect(router.state.location.search.selected).toBeUndefined();
  },
);

it('keeps fullscreen and focuses the next panel title after confirm', async () => {
  mount();
  await screen.findByRole('heading', { name: second.title });
  fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
  await confirm();
  await waitFor(() => expect(screen.getByRole('heading', { name: third.title })).toHaveFocus());
  expect(document.getElementById('triage-queue-panel')).toHaveAttribute('hidden');
});

it.each(['dismiss', 'create'])(
  'defers focus to the real Finding modal and handles %s',
  async (action) => {
    const { router } = mount();
    await screen.findByRole('heading', { name: second.title });
    fireEvent.click(screen.getByRole('button', { name: 'Finding 만들기' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await waitFor(() => expect(router.state.location.search.selected).toBe(third.id));
    if (action === 'dismiss') {
      const cancel = within(dialog).getByRole('button', { name: '취소' });
      fireEvent.pointerDown(cancel);
      fireEvent.click(cancel);
      await waitFor(() => expect(screen.getByRole('button', { name: /VOC-3/ })).toHaveFocus());
    } else {
      const focus = vi.spyOn(screen.getByRole('button', { name: /VOC-3/, hidden: true }), 'focus');
      fireEvent.change(within(dialog).getByLabelText(/요약/), {
        target: { value: 'Finding summary' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Finding 생성' }));
      await screen.findByText('Findings destination');
      expect(focus).not.toHaveBeenCalled();
    }
  },
);

it('keeps rows on an uncached pending pin read but clears them on a pending tab read', async () => {
  const holdPin = deferred();
  const holdTab = deferred();
  mount({ holdPin, holdTab });
  await screen.findByRole('button', { name: /VOC-3/ });
  fireEvent.click(screen.getByRole('button', { name: /VOC-3/ }));
  await screen.findByRole('heading', { name: third.title });
  expect(screen.getByRole('button', { name: /VOC-1/ })).toBeInTheDocument();
  expect(within(screen.getByRole('tabpanel')).queryByText('불러오는 중…')).toBeNull();
  expect(screen.queryByText('불러오기 실패')).toBeNull();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /높음/ }));
  await within(screen.getByRole('tabpanel')).findByText('불러오는 중…');
  expect(screen.queryByRole('button', { name: /VOC-1/ })).toBeNull();
});

it('keeps an exclusion during the pin placeholder read', async () => {
  const holdPin = deferred();
  const holdPatch = deferred();
  mount({ holdPin, holdPatch });
  await screen.findByRole('heading', { name: second.title });
  await confirm();
  await screen.findByRole('heading', { name: third.title });
  expect(screen.getByRole('button', { name: /VOC-1/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /VOC-2/ })).toBeNull();
});

it('keeps successful progress across a real permission gate unmount', async () => {
  const holdPermission = deferred();
  const { router } = mount({ holdPermission });
  await screen.findByRole('heading', { name: second.title });
  await confirm();
  await screen.findByText(/1건 처리됨/);
  await act(async () => {
    await router.navigate({
      to: '/vocs',
      search: (prev) => ({ ...prev, managedSystem: 'scope-a' }),
    });
  });
  await screen.findByText('불러오는 중…');
  expect(screen.queryByRole('tab')).toBeNull();
  await act(async () => {
    holdPermission.resolve(json({ state: 'approved', decision: { allow: true } }));
  });
  await screen.findByText(/1건 처리됨/);
});

it('settled undo preserves the new scope selection after a permission gate unmount', async () => {
  toast.dismiss();
  render(<Toaster />);
  const holdPermission = deferred();
  const holdCompensation = deferred();
  const { router } = mount({ holdPermission });
  await screen.findByRole('heading', { name: second.title });
  await confirm();
  await waitFor(() => expect(router.state.location.search.selected).toBe(third.id));
  await screen.findByText(/1건 처리됨/);
  const forwardFetch = fetch;
  const compensate = vi.fn(() => holdCompensation.promise);
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === 'PATCH' ? compensate() : forwardFetch(input, init),
  );
  fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
  await waitFor(() => expect(compensate).toHaveBeenCalled());
  await act(async () => {
    await router.navigate({
      to: '/vocs',
      search: (prev) => ({ ...prev, managedSystem: 'scope-a' }),
    });
  });
  await screen.findByText('불러오는 중…');
  expect(screen.queryByRole('tab')).toBeNull();
  await act(async () => {
    holdPermission.resolve(json({ state: 'approved', decision: { allow: true } }));
  });
  await screen.findByText(/1건 처리됨/);
  const fourth = await screen.findByRole('button', { name: /VOC-4/ });
  fireEvent.click(fourth);
  await screen.findByRole('heading', { name: 'Queue item 4' });
  fourth.focus();
  expect(router.state.location.search.selected).toBe(rows[3]?.id);
  await act(async () => {
    holdCompensation.resolve(json({ updated_at: '2026-01-03T00:00:00.000Z' }));
  });
  await waitFor(() => expect(screen.queryByText(/1건 처리됨/)).toBeNull());
  expect(router.state.location.search.selected).toBe(rows[3]?.id);
  expect(router.state.location.search.managedSystem).toBe('scope-a');
  expect(fourth).toHaveFocus();
});

it('wraps a last-row removal to the first other row', async () => {
  const { router } = mount();
  await screen.findByRole('heading', { name: second.title });
  fireEvent.click(screen.getByRole('button', { name: /VOC-4/ }));
  await screen.findByRole('heading', { name: 'Queue item 4' });
  await confirm();
  await waitFor(() => expect(screen.getByRole('button', { name: /VOC-1/ })).toHaveFocus());
  expect(router.state.location.search.selected).toBe(rows[0]?.id);
});

it('keeps the singleton marked row selected without moving focus', async () => {
  const { router } = mount({ tab: 'unassigned', items: [second] });
  await screen.findByRole('heading', { name: second.title });
  const tab = screen.getByRole('tab', { name: /미배정/ });
  tab.focus();
  fireEvent.click(screen.getByRole('button', { name: '보류' }));
  await screen.findByText(/1건 처리됨/);
  expect(tab).toHaveFocus();
  expect(screen.getByRole('button', { name: /VOC-2/ })).toHaveAttribute('aria-selected', 'true');
  expect(router.state.location.search.selected).toBe(second.id);
});

it('keeps focus on ordinary selection and a forward-failure reselection', async () => {
  const holdPatch = deferred();
  const { router } = mount({ holdPatch });
  await screen.findByRole('heading', { name: second.title });
  const tab = screen.getByRole('tab', { name: /미분류/ });
  tab.focus();
  fireEvent.click(screen.getByRole('button', { name: /VOC-1/ }));
  await screen.findByRole('heading', { name: 'Queue item 1' });
  expect(tab).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /VOC-2/ }));
  await screen.findByRole('heading', { name: second.title });
  await confirm();
  await waitFor(() => expect(screen.getByRole('button', { name: /VOC-3/ })).toHaveFocus());
  tab.focus();
  await act(async () => {
    holdPatch.resolve(
      new Response(JSON.stringify({ code: 'permission.denied', message: 'denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  await screen.findByRole('heading', { name: second.title });
  expect(router.state.location.search.selected).toBe(second.id);
  expect(tab).toHaveFocus();
});

it('counts a successful response arriving while the screen is unmounted by the permission gate', async () => {
  const holdPermission = deferred();
  const holdPatch = deferred();
  const { router } = mount({ holdPermission, holdPatch });
  await screen.findByRole('heading', { name: second.title });
  await confirm();
  await waitFor(() => expect(router.state.location.search.selected).toBe(third.id));
  await act(async () => {
    await router.navigate({
      to: '/vocs',
      search: (prev) => ({ ...prev, managedSystem: 'scope-a' }),
    });
  });
  await screen.findByText('불러오는 중…');
  expect(screen.queryByRole('tab')).toBeNull();
  await act(async () => {
    holdPatch.resolve(json({ updated_at: '2026-01-02T00:00:00.000Z' }));
  });
  await act(async () => {
    holdPermission.resolve(json({ state: 'approved', decision: { allow: true } }));
  });
  await screen.findByText(/1건 처리됨/);
});

it.each(['row click', 'action advance'])(
  'keeps rows and the selected panel after the final failed uncached pin read: %s',
  async (action) => {
    const { router } = mount();
    await screen.findByRole('heading', { name: second.title });
    const client = clients[clients.length - 1] as QueryClient;
    const initialKey = [
      'vocs',
      'triage',
      undefined,
      'untriaged',
      undefined,
      undefined,
      undefined,
      undefined,
      second.id,
    ];
    await waitFor(() => expect(client.getQueryState(initialKey)?.fetchStatus).toBe('idle'));
    const destinationKey = [...initialKey.slice(0, -1), third.id];
    expect(client.getQueryState(destinationKey)).toBeUndefined();
    const successfulFetch = fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/vocs' && url.searchParams.get('view') === 'triage') {
        return Promise.reject(new Error('Queue read failed'));
      }
      return successfulFetch(input, init);
    });
    if (action === 'row click') fireEvent.click(screen.getByRole('button', { name: /VOC-3/ }));
    else await confirm();
    await waitFor(() => expect(router.state.location.search.selected).toBe(third.id));
    await waitFor(
      () => {
        expect(client.getQueryState(destinationKey)?.status).toBe('error');
        expect(client.getQueryState(destinationKey)?.fetchStatus).toBe('idle');
      },
      { timeout: 5000 },
    );
    expect(screen.getByRole('button', { name: /VOC-1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VOC-3/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: third.title })).toBeInTheDocument();
    expect(screen.queryByText('불러오기 실패')).toBeNull();
    if (action === 'action advance')
      expect(screen.queryByRole('button', { name: /VOC-2/ })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /높음/ }));
    const tabKey = [...initialKey.slice(0, 3), 'high', ...initialKey.slice(4, -1), undefined];
    await waitFor(
      () => {
        expect(client.getQueryState(tabKey)?.status).toBe('error');
        expect(client.getQueryState(tabKey)?.fetchStatus).toBe('idle');
      },
      { timeout: 5000 },
    );
    await screen.findByText('불러오기 실패');
    expect(screen.queryByRole('button', { name: /VOC-1/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: third.title })).toBeNull();
    await act(async () => {
      await router.navigate({
        to: '/vocs',
        search: (prev) => ({
          ...prev,
          tab: 'untriaged',
          managedSystem: 'scope-b',
          selected: third.id,
        }),
      });
    });
    const scopeKey = [...initialKey.slice(0, 2), 'scope-b', ...destinationKey.slice(3)];
    await waitFor(
      () => {
        expect(client.getQueryState(scopeKey)?.status).toBe('error');
        expect(client.getQueryState(scopeKey)?.fetchStatus).toBe('idle');
      },
      { timeout: 5000 },
    );
    await screen.findByText('불러오기 실패');
    expect(screen.queryByRole('button', { name: /VOC-1/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: third.title })).toBeNull();
  },
);

it('clears populated retained rows on a failed Managed System change in the same tab', async () => {
  const { router } = mount();
  await screen.findByRole('heading', { name: second.title });
  const client = clients[clients.length - 1] as QueryClient;
  await waitFor(() => expect(client.isFetching({ queryKey: ['vocs', 'triage'] })).toBe(0));
  const successfulFetch = fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/vocs' && url.searchParams.get('view') === 'triage') {
      return Promise.reject(new Error('Queue read failed'));
    }
    return successfulFetch(input, init);
  });
  // First prove this mount has a retained page over a failed pin-only read.
  fireEvent.click(screen.getByRole('button', { name: /VOC-3/ }));
  const pinKey = [
    'vocs',
    'triage',
    undefined,
    'untriaged',
    undefined,
    undefined,
    undefined,
    undefined,
    third.id,
  ];
  await waitFor(
    () => {
      expect(client.getQueryState(pinKey)?.status).toBe('error');
      expect(client.getQueryState(pinKey)?.fetchStatus).toBe('idle');
    },
    { timeout: 5000 },
  );
  expect(screen.getByRole('button', { name: /VOC-1/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: third.title })).toBeInTheDocument();
  await act(async () => {
    await router.navigate({
      to: '/vocs',
      search: (prev) => ({ ...prev, managedSystem: 'scope-b' }),
    });
  });
  const scopeKey = [...pinKey.slice(0, 2), 'scope-b', ...pinKey.slice(3)];
  await waitFor(
    () => {
      expect(client.getQueryState(scopeKey)?.status).toBe('error');
      expect(client.getQueryState(scopeKey)?.fetchStatus).toBe('idle');
    },
    { timeout: 5000 },
  );
  expect(router.state.location.search.tab).toBe('untriaged');
  expect(screen.getByText('불러오기 실패')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /VOC-1/ })).toBeNull();
  expect(screen.queryByRole('heading', { name: third.title })).toBeNull();
});
