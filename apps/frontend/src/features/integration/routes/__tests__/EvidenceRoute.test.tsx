import { validateEvidenceSearch } from '@/routes/_authed/integration/evidence';
import {
  getEvidenceInventoryResponseSchema,
  listEvidenceInventoryResponseSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { EvidenceRoute } from '../EvidenceRoute';

vi.mock('@fops/ui', async (original) => ({
  ...(await original<typeof import('@fops/ui')>()),
  ListShell: ({ list, detailPanel }: { list: ReactNode; detailPanel?: ReactNode }) => (
    <div>
      {list}
      {detailPanel}
    </div>
  ),
}));
const ID = '11111111-1111-4111-8111-111111111111';
const PARENT = '22222222-2222-4222-8222-222222222222';
const MS = '33333333-3333-4333-8333-333333333333';
const item = getEvidenceInventoryResponseSchema.parse({
  id: ID,
  finding_id: PARENT,
  primary_managed_system_id: MS,
  analytics_area_id: null,
  sentiment: 'negative',
  importance: 'high',
  created_at: '2026-07-01T00:00:00.000Z',
  finding: { id: PARENT, display_id: 'FIN-42', title: '다운로드 실패' },
  source_type: 'note',
  content_state: 'available',
  quote_or_summary: '월간 다운로드가 느려졌습니다.',
});
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function installFetch(
  list: (url: URL) => Response | Promise<Response> = () =>
    response(
      listEvidenceInventoryResponseSchema.parse({ items: [item], page: { has_more: false } }),
    ),
  detail: () => Response | Promise<Response> = () => response(item),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname === '/me')
        return Promise.resolve(
          response({ actor: { id: 'actor', role_level: 'admin' }, workspace_id: 'workspace' }),
        );
      if (url.pathname === '/evidence-highlights') return Promise.resolve(list(url));
      if (url.pathname === `/evidence-highlights/${ID}`) return Promise.resolve(detail());
      throw new Error(`Unexpected request ${url}`);
    }),
  );
}
async function mount(url = '/integration/evidence') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: Outlet });
  const evidence = createRoute({
    getParentRoute: () => root,
    path: '/integration/evidence',
    validateSearch: validateEvidenceSearch,
    component: EvidenceRoute,
  });
  const findings = createRoute({
    getParentRoute: () => root,
    path: '/findings',
    validateSearch: (raw) => raw,
    component: () => <div>부모 Finding</div>,
  });
  const history = createMemoryHistory({ initialEntries: [url] });
  const router = createRouter({ routeTree: root.addChildren([evidence, findings]), history });
  await act(async () => {
    await router.load();
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history, client, ...view };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('finds a known fragment and restores parent jump, Back, Forward and saved selection', async () => {
  installFetch();
  const { router, history, unmount } = await mount(
    `/integration/evidence?managedSystem=${MS}&source=note&q=다운로드`,
  );
  const row = await screen.findByRole('button', { name: /월간 다운로드/ });
  fireEvent.click(row);
  const link = await screen.findByRole('link', { name: 'Finding 보기' });
  expect(link.getAttribute('href')).toContain(`selected=${PARENT}`);
  const saved = router.state.location.href;
  fireEvent.click(link);
  await screen.findByText('부모 Finding');
  await act(async () => history.back());
  await screen.findByRole('link', { name: 'Finding 보기' });
  expect(router.state.location.href).toBe(saved);
  await act(async () => history.forward());
  await screen.findByText('부모 Finding');
  unmount();
  await mount(saved);
  await screen.findByRole('link', { name: 'Finding 보기' });
  expect(screen.getByRole('searchbox').getAttribute('value')).toBe('다운로드');
});

it('resolves a later-page selection independently, saves cursor, and restores it after filter history', async () => {
  const first = {
    ...item,
    id: '44444444-4444-4444-8444-444444444444',
    quote_or_summary: '첫 페이지 메모',
  };
  installFetch((url) =>
    response(
      listEvidenceInventoryResponseSchema.parse(
        url.searchParams.has('cursor')
          ? { items: [item], page: { has_more: false } }
          : { items: [first], page: { has_more: true, cursor: 'opaque-page-two' } },
      ),
    ),
  );
  const { router, history, unmount } = await mount(
    `/integration/evidence?selected=${ID}&source=note`,
  );
  await screen.findByRole('link', { name: 'Finding 보기' });
  expect(screen.queryByRole('button', { name: /월간 다운로드/ })).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
  await screen.findByRole('button', { name: /월간 다운로드/ });
  const saved = router.state.location.href;
  await act(async () =>
    router.navigate({ to: '/integration/evidence', search: { source: 'voc', selected: ID } }),
  );
  await screen.findByText('선택한 Evidence가 현재 조건에 맞지 않습니다.');
  await act(async () => history.back());
  await screen.findByRole('link', { name: 'Finding 보기' });
  expect(router.state.location.href).toBe(saved);
  unmount();
  await mount(saved);
  await screen.findByRole('button', { name: /월간 다운로드/ });
  await screen.findByRole('link', { name: 'Finding 보기' });
});
it('keeps first-page rows on page-two failure and retries the failed cursor', async () => {
  let fail = true;
  const second = {
    ...item,
    id: '44444444-4444-4444-8444-444444444444',
    quote_or_summary: '다음 페이지 메모',
  };
  installFetch((url) =>
    url.searchParams.has('cursor')
      ? fail
        ? response({ code: 'internal.unexpected' }, 500)
        : response({ items: [second], page: { has_more: false } })
      : response({ items: [item], page: { has_more: true, cursor: 'next' } }),
  );
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
  await screen.findByText('다음 Evidence를 불러오지 못했습니다.');
  expect(screen.getByRole('button', { name: /월간 다운로드/ })).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await screen.findByRole('button', { name: /다음 페이지 메모/ });
  expect(screen.getByRole('button', { name: /월간 다운로드/ })).toBeVisible();
});
it.each([404, 403])('shows explicit selected %s without opening a substitute', async (status) => {
  installFetch(undefined, () =>
    response({ code: status === 404 ? 'not_found.record' : 'permission.denied' }, status),
  );
  await mount(`/integration/evidence?selected=${ID}`);
  await waitFor(() =>
    expect(
      screen
        .getByTestId('evidence-panel')
        .querySelector(status === 404 ? '[data-variant="error"]' : '[data-state="denied"]'),
    ).not.toBeNull(),
  );
  expect(screen.queryByRole('link', { name: 'Finding 보기' })).toBeNull();
});
it('closes with replace, preserves filters and cursor, and returns keyboard focus to the originating row', async () => {
  installFetch();
  const { router, history } = await mount(
    `/integration/evidence?managedSystem=${MS}&source=note&q=다운로드&cursor=saved`,
  );
  const user = userEvent.setup();
  const row = await screen.findByRole('button', { name: /월간 다운로드/ });
  row.focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('link', { name: 'Finding 보기' });
  await user.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(document.activeElement).toBe(row));
  expect(router.state.location.search).toMatchObject({
    managedSystem: MS,
    source: 'note',
    q: '다운로드',
    cursor: 'saved',
  });
  expect(router.state.location.search.selected).toBeUndefined();
  await act(async () => history.back());
  expect(router.state.location.search.selected).toBeUndefined();
});
it('closes a direct selection with no originating row and focuses search once', async () => {
  installFetch(() => response({ items: [], page: { has_more: false } }));
  await mount(`/integration/evidence?selected=${ID}`);
  await screen.findByRole('link', { name: 'Finding 보기' });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox')));
});
it('drops invalid URL keys independently and trims a valid query', async () => {
  installFetch();
  const { router } = await mount(
    '/integration/evidence?source=invalid&managedSystem=invalid&selected=invalid&q=%20다운로드%20&cursor=saved&unknown=value',
  );
  await screen.findByRole('button', { name: /월간 다운로드/ });
  expect(router.state.location.search).toMatchObject({ q: '다운로드', cursor: 'saved' });
  expect(router.state.location.search.selected).toBeUndefined();
  expect(router.state.location.search.source).toBeUndefined();
});

it.each(['source', 'q', 'scope'] as const)(
  'clears cursor and reconciles safe detail on %s changes',
  async (filter) => {
    installFetch();
    const { router } = await mount(
      `/integration/evidence?selected=${ID}&source=note&cursor=saved&managedSystem=${MS}`,
    );
    await screen.findByRole('link', { name: 'Finding 보기' });
    if (filter === 'source')
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'VOC' }), { button: 0 });
    else if (filter === 'q') {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: '없는 검색어' } });
      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    } else
      await act(async () =>
        router.navigate({
          to: '/integration/evidence',
          search: { selected: ID, managedSystem: PARENT },
        }),
      );
    await screen.findByText('선택한 Evidence가 현재 조건에 맞지 않습니다.');
    expect(router.state.location.search.cursor).toBeUndefined();
    expect(screen.queryByRole('link', { name: 'Finding 보기' })).toBeNull();
  },
);
it('never redisplays a deferred old-scope quote/source after new scope denial', async () => {
  let settleList!: (value: Response) => void;
  let settleDetail!: (value: Response) => void;
  const pendingList = new Promise<Response>((resolve) => {
    settleList = resolve;
  });
  const pendingDetail = new Promise<Response>((resolve) => {
    settleDetail = resolve;
  });
  const old = getEvidenceInventoryResponseSchema.parse({
    ...item,
    source_type: 'voc',
    source: {
      id: PARENT,
      display_id: 'VOC-77',
      title: '이전 범위 원본',
      route: `/vocs?selected=${PARENT}`,
    },
  });
  installFetch(
    (url) =>
      url.searchParams.get('managed_system_id') === MS
        ? pendingList
        : response({ code: 'permission.denied' }, 403),
    () => pendingDetail,
  );
  const { router } = await mount(`/integration/evidence?managedSystem=${MS}&selected=${ID}`);
  await waitFor(() =>
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes(`/evidence-highlights/${ID}`)),
    ).toBe(true),
  );
  const oldSignals = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).startsWith('/evidence-highlights'))
    .map(([, init]) => init?.signal);
  await act(async () =>
    router.navigate({ to: '/integration/evidence', search: { managedSystem: PARENT } }),
  );
  await waitFor(() => expect(document.querySelector('[data-state="denied"]')).not.toBeNull());
  expect(oldSignals.every((signal) => signal?.aborted)).toBe(true);
  await act(async () => {
    settleList(
      response(
        listEvidenceInventoryResponseSchema.parse({ items: [old], page: { has_more: false } }),
      ),
    );
    settleDetail(response(old));
    await Promise.all([pendingList, pendingDetail]);
  });
  expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
  expect(screen.queryByText(/이전 범위 원본/)).toBeNull();
});
it.each(['withheld', 'missing', 'denied'] as const)(
  'clears previously displayed quote/source after source becomes %s',
  async (state) => {
    let revoked = false;
    const voc = getEvidenceInventoryResponseSchema.parse({
      ...item,
      source_type: 'voc',
      source: {
        id: PARENT,
        display_id: 'VOC-77',
        title: '비공개 원본 제목',
        route: `/vocs?selected=${PARENT}`,
      },
    });
    if (voc.source_type !== 'voc') throw new Error('Expected VOC fixture');
    const { quote_or_summary: _quote, source: _source, ...metadata } = voc;
    const safe = getEvidenceInventoryResponseSchema.parse({
      ...metadata,
      content_state: 'withheld',
    });
    const other = { ...item, id: PARENT, quote_or_summary: '다른 Evidence 메모' };
    installFetch(
      () => response({ items: [revoked ? safe : voc, other], page: { has_more: false } }),
      () =>
        revoked && state !== 'withheld'
          ? response(
              { code: state === 'missing' ? 'not_found.record' : 'permission.denied' },
              state === 'missing' ? 404 : 403,
            )
          : response(revoked ? safe : voc),
    );
    const originalFetch = fetch;
    vi.stubGlobal('fetch', (input: string) =>
      input === `/evidence-highlights/${PARENT}`
        ? Promise.resolve(response(other))
        : originalFetch(input),
    );
    const { client } = await mount(`/integration/evidence?selected=${ID}`);
    await screen.findByRole('link', { name: 'Finding 보기' });
    expect(screen.getAllByText(/비공개 원본 제목/).length).toBeGreaterThan(0);
    revoked = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['evidence-inventory'] });
    });
    if (state === 'denied') {
      await waitFor(() => expect(document.querySelector('[data-state="denied"]')).not.toBeNull());
    } else
      await screen.findAllByText(
        state === 'missing'
          ? '선택한 Evidence를 찾을 수 없습니다.'
          : '원본 접근 권한 또는 승인 상태가 변경되어 내용을 표시할 수 없습니다.',
      );
    expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
    expect(screen.queryByText(/비공개 원본 제목/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    await waitFor(() => expect(screen.queryByTestId('evidence-panel')).toBeNull());
    expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
    expect(screen.queryByText(/비공개 원본 제목/)).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /다른 Evidence 메모/ }));
    await screen.findByRole('link', { name: 'Finding 보기' });
    expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
    expect(screen.queryByText(/비공개 원본 제목/)).toBeNull();
  },
);
it('resets draft, selection focus lifetime and old caches when the session changes', async () => {
  let block = false;
  installFetch(() =>
    block
      ? response({ code: 'permission.denied' }, 403)
      : response({ items: [item], page: { has_more: false } }),
  );
  const { client } = await mount();
  const row = await screen.findByRole('button', { name: /월간 다운로드/ });
  fireEvent.click(row);
  await screen.findByRole('link', { name: 'Finding 보기' });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '미완성 비공개 검색' } });
  block = true;
  await act(async () => {
    client.setQueryData(['me'], {
      actor: { id: 'other', role_level: 'user' },
      workspace_id: 'other',
    });
  });
  await waitFor(() => expect(document.querySelector('[data-state="denied"]')).not.toBeNull());
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
  await waitFor(() =>
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: ['evidence-inventory'] })
        .some((query) =>
          query.queryKey.some(
            (value) => typeof value === 'string' && value.startsWith('workspace:actor:admin:'),
          ),
        ),
    ).toBe(false),
  );
});
it.each([false, true])('shows true-empty versus filtered-empty (filtered=%s)', async (filtered) => {
  installFetch(() => response({ items: [], page: { has_more: false } }));
  await mount(filtered ? '/integration/evidence?q=없음' : '/integration/evidence');
  await screen.findByText(
    filtered ? '조건에 맞는 Evidence가 없습니다.' : '표시할 Evidence가 없습니다.',
  );
  expect(screen.queryByText('0')).toBeNull();
});
it('retries first-page failure into a real successful inventory', async () => {
  let fail = true;
  installFetch(() =>
    fail
      ? response({ code: 'internal.unexpected' }, 500)
      : response({ items: [item], page: { has_more: false } }),
  );
  await mount();
  await screen.findByText('Evidence를 불러오지 못했습니다.');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await screen.findByRole('button', { name: /월간 다운로드/ });
});
it('clears old quotes and local draft on permission invalidation, including a failed reauthorization', async () => {
  let fail = false;
  installFetch(() =>
    fail
      ? response({ code: 'permission.denied' }, 403)
      : response({ items: [item], page: { has_more: false } }),
  );
  const { client } = await mount();
  await screen.findByRole('button', { name: /월간 다운로드/ });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '미완성 검색' } });
  fail = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['evidence-inventory'] });
  });
  await waitFor(() => expect(document.querySelector('[data-state="denied"]')).not.toBeNull());
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
});
it('keeps only pages through the restored cursor when going Back from page two', async () => {
  const second = { ...item, id: PARENT, quote_or_summary: '뒤 페이지 전용 메모' };
  installFetch((url) =>
    response(
      url.searchParams.has('cursor')
        ? { items: [second], page: { has_more: false } }
        : { items: [item], page: { has_more: true, cursor: 'next' } },
    ),
  );
  const { history } = await mount();
  fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
  await screen.findByRole('button', { name: /뒤 페이지 전용 메모/ });
  await act(async () => history.back());
  await screen.findByRole('button', { name: '더 보기' });
  expect(screen.queryByRole('button', { name: /뒤 페이지 전용 메모/ })).toBeNull();
});
it.each(
  (['withheld', 'missing', 'denied'] as const).flatMap((state) =>
    (['close', 'select'] as const).map((transition) => ({ state, transition })),
  ),
)(
  'keeps direct $state withdrawal after $transition before the list catches up',
  async ({ state, transition }) => {
    let revoke = false;
    const voc = getEvidenceInventoryResponseSchema.parse({
      ...item,
      source_type: 'voc',
      source: {
        id: PARENT,
        display_id: 'VOC-77',
        title: '철회된 원본 제목',
        route: `/vocs?selected=${PARENT}`,
      },
    });
    if (voc.source_type !== 'voc') throw new Error('Expected VOC fixture');
    const { quote_or_summary: _quote, source: _source, ...metadata } = voc;
    const safe = getEvidenceInventoryResponseSchema.parse({
      ...metadata,
      content_state: 'withheld',
    });
    const other = { ...item, id: PARENT, quote_or_summary: '다른 Evidence 메모' };
    installFetch(
      () => response({ items: [voc, other], page: { has_more: false } }),
      () =>
        revoke && state !== 'withheld'
          ? response(
              { code: state === 'missing' ? 'not_found.record' : 'permission.denied' },
              state === 'missing' ? 404 : 403,
            )
          : response(revoke ? safe : voc),
    );
    const originalFetch = fetch;
    vi.stubGlobal('fetch', (input: string) =>
      input === `/evidence-highlights/${PARENT}`
        ? Promise.resolve(response(other))
        : originalFetch(input),
    );
    const { client, router } = await mount(`/integration/evidence?selected=${ID}`);
    await screen.findByRole('link', { name: 'Finding 보기' });
    revoke = true;
    await act(async () => {
      await client.invalidateQueries({ predicate: (query) => query.queryKey.includes('detail') });
    });
    if (state === 'denied') {
      await waitFor(() => expect(document.querySelector('[data-state="denied"]')).not.toBeNull());
    } else {
      await screen.findAllByText(
        state === 'missing'
          ? '선택한 Evidence를 찾을 수 없습니다.'
          : '원본 접근 권한 또는 승인 상태가 변경되어 내용을 표시할 수 없습니다.',
      );
    }
    expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
    expect(screen.queryByText(/철회된 원본 제목/)).toBeNull();
    if (transition === 'close') {
      fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
      await waitFor(() => expect(screen.queryByTestId('evidence-panel')).toBeNull());
      expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
      expect(screen.queryByText(/철회된 원본 제목/)).toBeNull();
      fireEvent.click(await screen.findByRole('button', { name: /다른 Evidence 메모/ }));
    } else {
      await act(async () =>
        router.navigate({ to: '/integration/evidence', search: { selected: PARENT } }),
      );
    }
    await screen.findByRole('link', { name: 'Finding 보기' });
    expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
    expect(screen.queryByText(/철회된 원본 제목/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    await waitFor(() => expect(screen.queryByTestId('evidence-panel')).toBeNull());
    expect(screen.queryByText(item.quote_or_summary as string)).toBeNull();
    expect(screen.queryByText(/철회된 원본 제목/)).toBeNull();
  },
);
it('keeps initial pending reads distinct from empty and error', async () => {
  let settle!: (value: Response) => void;
  installFetch(
    () =>
      new Promise<Response>((resolve) => {
        settle = resolve;
      }),
  );
  await mount();
  await waitFor(() => expect(settle).toBeTypeOf('function'));
  await screen.findByRole('status', { name: 'Evidence 확인 중…' });
  expect(screen.queryByText('표시할 Evidence가 없습니다.')).toBeNull();
  await act(async () => {
    settle(response({ items: [], page: { has_more: false } }));
  });
  await screen.findByText('표시할 Evidence가 없습니다.');
});
it('rejects a malformed inventory payload instead of rendering unparsed content', async () => {
  installFetch(() =>
    response({
      items: [{ ...item, response_id: 'private', quote_or_summary: '숨겨진 서버 오류 텍스트' }],
      page: { has_more: false },
    }),
  );
  await mount();
  await screen.findByText('Evidence를 불러오지 못했습니다.');
  expect(screen.queryByText('숨겨진 서버 오류 텍스트')).toBeNull();
});
