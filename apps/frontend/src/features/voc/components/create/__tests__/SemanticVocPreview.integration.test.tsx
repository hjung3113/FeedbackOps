import { similarityPreviewRequestSchema, similarityPreviewResponseSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { display_name: '작성자', email: 'reporter@example.local' } } }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@fops/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fops/ui')>()),
  RichEditor: ({
    value,
    onChange,
  }: { value: { type: 'doc'; content?: unknown[] }; onChange: (doc: unknown) => void }) => (
    <>
      <textarea
        aria-label="상세 설명"
        onChange={(event) =>
          onChange({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: event.target.value }] }],
          })
        }
      />
      <button
        type="button"
        onClick={() =>
          onChange({ content: JSON.parse(JSON.stringify(value.content)), type: 'doc' })
        }
      >
        동일 설명 알림
      </button>
    </>
  ),
}));

import { CreateRoute } from '../../../routes/CreateRoute';

const MS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MS2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CANDIDATE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CREATED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const items = [0, 1, 2].map((index) => ({
  id: index === 0 ? CANDIDATE : `00000000-0000-4000-8000-00000000000${index}`,
  display_id: `VOC-${index + 1}`,
  title: `이전 중복 ${index + 1}`,
  created_at: '2026-07-20T08:00:00Z',
}));
const result = similarityPreviewResponseSchema.parse({ available: true, items });
const peer = {
  id: MS2,
  display_id: 'VOC-RECENT',
  title: '최근 heuristic VOC',
  created_at: '2026-07-20T08:00:00Z',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let preview: () => Promise<Response>;
let availability: () => Promise<Response>;
let requests: Array<{ method: string; path: string; init: RequestInit }>;
const previewRequests = () =>
  requests.filter(({ method, path }) => method === 'POST' && path === '/vocs/similarity-preview');
function previewRequest(index = 0) {
  const request = previewRequests()[index];
  if (!request) throw new Error(`Missing preview request ${index}`);
  return request;
}
const createRequests = () =>
  requests.filter(({ method, path }) => method === 'POST' && path === '/vocs');
beforeEach(() => {
  requests = [];
  preview = async () => json(result);
  availability = async () => json({ available: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      const method = init.method ?? 'GET';
      requests.push({ method, path, init });
      if (method === 'POST' && path === '/vocs/similarity-preview') return preview();
      if (method === 'GET' && path === '/vocs/similarity-preview/availability')
        return availability();
      if (method === 'POST' && path === '/vocs')
        return json({ id: CREATED, display_id: 'VOC-NEW' }, 201);
      if (path === '/managed-systems')
        return json({
          items: [MS, MS2].map((id, index) => ({
            id,
            name: `MS ${index + 1}`,
            slug: `ms-${index}`,
            archived_at: null,
          })),
          total: 2,
        });
      if (path === '/analytics-areas') return json({ items: [], total: 0 });
      if (path === '/vocs/pre-submit-peers') return json({ items: [peer] });
      return json({}, 500);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  function Vocs() {
    const search = useSearch({ strict: false }) as { action?: string };
    return search.action === 'create' ? <CreateRoute /> : <div>VOC 목록</div>;
  }
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/vocs',
    validateSearch: (search: Record<string, unknown>) => search,
    component: Vocs,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/vocs?action=create&managedSystem=${MS}`] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client, ...view };
}
async function fill() {
  const title = await screen.findByRole('textbox', { name: /제목/ });
  fireEvent.change(title, { target: { value: '중복 여부 확인' } });
  fireEvent.blur(title);
  fireEvent.change(screen.getByRole('textbox', { name: '상세 설명' }), {
    target: { value: '재현 절차' },
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeEnabled());
}
const checkButton = () => screen.getByRole('button', { name: '유사 VOC 확인' });
const semanticPanel = () => within(screen.getByTestId('semantic-voc-panel'));
function assertHeuristic() {
  const heuristic = within(screen.getByTestId('similar-voc-panel'));
  expect(heuristic.getByText('같은 Managed System의 최근 VOC')).toBeInTheDocument();
  expect(heuristic.getByText(peer.title)).toBeInTheDocument();
}

test('render, all field edits, focus, blur and submit never send preview; only explicit clicks send fresh keys', async () => {
  const { router } = mount();
  await fill();
  fireEvent.click(screen.getByRole('radio', { name: 'MS 2' }));
  fireEvent.focus(screen.getByRole('textbox', { name: /제목/ }));
  fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(previewRequests()).toHaveLength(0);
  fireEvent.click(checkButton());
  await screen.findByText('이전 중복 1');
  expect(previewRequests()).toHaveLength(1);
  const first = previewRequest().init;
  expect(similarityPreviewRequestSchema.parse(JSON.parse(String(first.body)))).toEqual({
    primary_managed_system_id: MS2,
    title: '중복 여부 확인',
    description_rich_content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '재현 절차' }] }],
    },
  });
  expect(new Headers(first.headers).get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
  expect(first.signal).toBeInstanceOf(AbortSignal);
  fireEvent.click(checkButton());
  await waitFor(() => expect(previewRequests()).toHaveLength(2));
  await screen.findByText('이전 중복 1');
  expect(new Headers(previewRequest(1).init.headers).get('Idempotency-Key')).not.toBe(
    new Headers(first.headers).get('Idempotency-Key'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ view: 'my', selected: CREATED }),
  );
  expect(createRequests()).toHaveLength(1);
  expect(previewRequests()).toHaveLength(2);
});

test.each(['loading', 'unavailable', 'error'])(
  'availability %s leaves the create right column without a semantic card or preview POST',
  async (state) => {
    const pending = deferred();
    availability =
      state === 'loading'
        ? () => pending.promise
        : async () =>
            state === 'error'
              ? json({}, 500)
              : json({ available: false, reason: 'provider_disabled' });
    mount();
    await fill();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('semantic-voc-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '유사 VOC 확인' })).not.toBeInTheDocument();
    assertHeuristic();
    const rightColumn = screen.getByTestId('similar-voc-panel').parentElement;
    expect(rightColumn?.children).toHaveLength(3);
    expect(within(rightColumn as HTMLElement).getByText('제출자')).toBeInTheDocument();
    expect(within(rightColumn as HTMLElement).getByText('심각도 안내')).toBeInTheDocument();
    expect(previewRequests()).toHaveLength(0);
    expect(
      requests.filter(
        ({ method, path }) => method === 'GET' && path === '/vocs/similarity-preview/availability',
      ),
    ).toHaveLength(1);
    if (state === 'loading') {
      await act(async () => {
        pending.resolve(json({ available: true }));
      });
      await screen.findByTestId('semantic-voc-panel');
      expect(previewRequests()).toHaveLength(0);
    }
  },
);

test('available preview renders its card; a provider-disabled click hides it through later edits', async () => {
  preview = async () => json(unavailable('provider_disabled'));
  mount();
  await fill();
  await screen.findByTestId('semantic-voc-panel');
  expect(previewRequests()).toHaveLength(0);
  fireEvent.click(checkButton());
  await waitFor(() => expect(screen.queryByTestId('semantic-voc-panel')).not.toBeInTheDocument());
  edit('title');
  expect(screen.queryByTestId('semantic-voc-panel')).not.toBeInTheDocument();
  assertHeuristic();
  expect(previewRequests()).toHaveLength(1);
});

test('double-click sends one preview POST and disables checking only until it settles', async () => {
  const pending = deferred();
  preview = () => pending.promise;
  mount();
  await fill();
  await act(async () => {
    fireEvent.click(checkButton());
    fireEvent.click(checkButton());
  });
  expect(previewRequests()).toHaveLength(1);
  expect(checkButton()).toHaveAttribute('aria-disabled', 'true');
  expect(checkButton()).toBeEnabled();
  await act(async () => {
    fireEvent.click(checkButton());
    await Promise.resolve();
  });
  expect(previewRequests()).toHaveLength(1);
  expect(semanticPanel().getByText('확인 중…')).toHaveClass('text-text-secondary');
  expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeEnabled();
  await act(async () => {
    pending.resolve(json(result));
  });
  expect(semanticPanel().getAllByRole('link')).toHaveLength(3);
  expect(checkButton()).toBeEnabled();
  expect(checkButton()).not.toHaveAttribute('aria-disabled', 'true');
});

test('preview enablement is local and requires a valid MS, trimmed title and non-blank description', async () => {
  mount();
  const title = await screen.findByRole('textbox', { name: /제목/ });
  await screen.findByTestId('semantic-voc-panel');
  expect(checkButton()).toBeDisabled();
  expect(
    semanticPanel().getByText('Managed System을 선택하고 제목과 상세 설명을 입력해 주세요.'),
  ).toBeInTheDocument();
  expect(
    semanticPanel().getByText(
      '버튼을 누르면 제목과 설명이 AI 임베딩 서비스로 전송됩니다. 첨부파일은 전송되지 않습니다.',
    ),
  ).toBeInTheDocument();
  fireEvent.change(title, { target: { value: '제목' } });
  expect(checkButton()).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: '상세 설명' }), { target: { value: '  ' } });
  expect(checkButton()).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: '상세 설명' }), {
    target: { value: '설명' },
  });
  expect(checkButton()).toBeEnabled();
  fireEvent.change(title, { target: { value: '  ' } });
  expect(checkButton()).toBeDisabled();
  fireEvent.change(title, { target: { value: '가'.repeat(201) } });
  expect(checkButton()).toBeDisabled();
  fireEvent.change(title, { target: { value: '  제목  ' } });
  expect(checkButton()).toBeEnabled();
  fireEvent.click(screen.getByRole('radio', { name: 'MS 1' }));
  expect(checkButton()).toBeDisabled();
  expect(previewRequests()).toHaveLength(0);
});

const unavailable = (reason: string) => ({ available: false, reason, items: [] });
const quota = (scope: string, period: string) => ({
  code: `rate_limited.${scope}`,
  message: '',
  detail: { budget_period: period, retry_after_seconds: 30 },
});
test.each([
  ['empty', { available: true, items: [] }, 200, '비슷한 VOC를 찾지 못했습니다'],
  ...['provider_failed', 'provider_timeout', 'provider_outcome_unknown'].map(
    (reason) =>
      [
        reason,
        unavailable(reason),
        200,
        '유사 VOC를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요',
      ] as const,
  ),
  ['expired', unavailable('preview_expired'), 200, '결과가 만료되었습니다. 다시 확인해 주세요'],
  ['actor day', quota('actor', 'day'), 429, '오늘 유사 VOC 조회 한도를 사용했습니다'],
  [
    'workspace day',
    quota('workspace', 'day'),
    429,
    '이 워크스페이스의 유사 VOC 조회 한도를 사용했습니다',
  ],
  [
    'actor minute',
    quota('actor', 'minute'),
    429,
    '요청이 너무 많습니다. 30초 후 다시 시도해 주세요.',
  ],
  [
    'workspace minute',
    quota('workspace', 'minute'),
    429,
    '이 워크스페이스의 유사 VOC 조회 요청이 너무 많습니다. 30초 후 다시 시도해 주세요.',
  ],
  ['other error', { code: 'permission.denied', message: '' }, 403, '권한이 없습니다.'],
] as const)(
  '%s state keeps semantic copy, heuristic and submit separate and allows another explicit check',
  async (_name, body, status, message) => {
    preview = async () => json(body, status);
    mount();
    await fill();
    fireEvent.click(checkButton());
    const outcome = await semanticPanel().findByText(message);
    expect(outcome).toHaveClass(
      status >= 400 ||
        ['provider_failed', 'provider_timeout', 'provider_outcome_unknown'].includes(_name)
        ? 'text-text-danger'
        : 'text-text-secondary',
    );
    expect(semanticPanel().queryAllByRole('link')).toHaveLength(0);
    expect(semanticPanel().getByText('유사 VOC 추천')).toBeInTheDocument();
    assertHeuristic();
    expect(checkButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeEnabled();
    expect(previewRequests()).toHaveLength(1);
    fireEvent.click(checkButton());
    await waitFor(() => expect(previewRequests()).toHaveLength(2));
    await semanticPanel().findByText(message);
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '다른 제목' },
    });
    expect(semanticPanel().queryByText(message)).not.toBeInTheDocument();
    expect(previewRequests()).toHaveLength(2);
  },
);

test('three semantic rows keep the recent-peer heading and contents unchanged', async () => {
  mount();
  await fill();
  fireEvent.click(checkButton());
  await screen.findByText('이전 중복 1');
  expect(semanticPanel().getAllByRole('link')).toHaveLength(3);
  for (const item of items) {
    expect(semanticPanel().getByRole('link', { name: new RegExp(item.title) })).toHaveAttribute(
      'href',
      `/vocs?view=inbox&selected=${item.id}`,
    );
    expect(semanticPanel().getByText(new RegExp(`${item.display_id} ·`))).toBeInTheDocument();
  }
  assertHeuristic();
  expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeEnabled();
});

function edit(field: string) {
  if (field === 'MS') fireEvent.click(screen.getByRole('radio', { name: 'MS 2' }));
  else if (field === 'empty MS') fireEvent.click(screen.getByRole('radio', { name: 'MS 1' }));
  else
    fireEvent.change(
      screen.getByRole('textbox', { name: field === 'title' ? /제목/ : '상세 설명' }),
      { target: { value: '수정된 내용' } },
    );
}
test.each(['title', 'description', 'MS', 'empty MS'])(
  '%s change before blur clears completed results without sending',
  async (field) => {
    mount();
    await fill();
    fireEvent.click(checkButton());
    await screen.findByText('이전 중복 1');
    edit(field);
    expect(semanticPanel().queryAllByRole('link')).toHaveLength(0);
    expect(previewRequests()).toHaveLength(1);
  },
);

test.each(['title', 'description', 'MS', 'empty MS'])(
  '%s change aborts pending and ignores a late reply even if fetch disregards abort',
  async (field) => {
    const pending = deferred();
    preview = () => pending.promise;
    mount();
    await fill();
    fireEvent.click(checkButton());
    expect(semanticPanel().getByText('확인 중…')).toBeInTheDocument();
    assertHeuristic();
    expect(screen.getByRole('button', { name: 'VOC 제출' })).toBeEnabled();
    edit(field);
    expect(previewRequest().init.signal?.aborted).toBe(true);
    expect(semanticPanel().queryByText('확인 중…')).not.toBeInTheDocument();
    await act(async () => {
      pending.resolve(json(result));
    });
    expect(semanticPanel().queryAllByRole('link')).toHaveLength(0);
    expect(previewRequests()).toHaveLength(1);
  },
);

test.each(['resolve', 'reject'])(
  'edit then check B; late A %s cannot clear B loading or show stale content',
  async (outcome) => {
    const a = deferred();
    const b = deferred();
    preview = vi
      .fn()
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);
    mount();
    await fill();
    fireEvent.click(checkButton());
    edit('title');
    fireEvent.click(checkButton());
    expect(previewRequest().init.signal?.aborted).toBe(true);
    await act(async () => {
      if (outcome === 'resolve') a.resolve(json(result));
      else a.reject(new Error('late failure'));
    });
    expect(semanticPanel().getByText('확인 중…')).toBeInTheDocument();
    expect(semanticPanel().queryAllByRole('link')).toHaveLength(0);
    await act(async () => {
      b.resolve(json(result));
    });
    expect(semanticPanel().getAllByRole('link')).toHaveLength(3);
    expect(semanticPanel().getByText('이전 중복 1')).toBeInTheDocument();
    expect(
      semanticPanel().queryByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    ).not.toBeInTheDocument();
  },
);

test.each(['resolve', 'reject'])(
  'edit then check B preserves B when old A %s settles last',
  async (outcome) => {
    const a = deferred();
    preview = vi
      .fn()
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(async () => json(result));
    mount();
    await fill();
    fireEvent.click(checkButton());
    edit('description');
    fireEvent.click(checkButton());
    await screen.findByText('이전 중복 1');
    await act(async () => {
      if (outcome === 'resolve') a.resolve(json({ available: true, items: [] }));
      else a.reject(new Error('late failure'));
    });
    expect(semanticPanel().getAllByRole('link')).toHaveLength(3);
    expect(semanticPanel().getByText('이전 중복 1')).toBeInTheDocument();
    expect(
      semanticPanel().queryByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    ).not.toBeInTheDocument();
    expect(previewRequests()).toHaveLength(2);
  },
);

test.each(['Error', 'AbortError'])(
  'edit returns to mounted idle and ignores a late %s without another check',
  async (name) => {
    const pending = deferred();
    preview = () => pending.promise;
    mount();
    await fill();
    fireEvent.click(checkButton());
    edit('description');
    expect(previewRequest().init.signal?.aborted).toBe(true);
    expect(checkButton()).toBeEnabled();
    await act(async () => {
      pending.reject(
        name === 'AbortError'
          ? new DOMException('Aborted', 'AbortError')
          : new Error('late failure'),
      );
    });
    expect(semanticPanel().getByRole('status')).toBeEmptyDOMElement();
    expect(semanticPanel().queryAllByRole('link')).toHaveLength(0);
    expect(
      semanticPanel().queryByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    ).not.toBeInTheDocument();
    expect(checkButton()).toBeEnabled();
    expect(previewRequests()).toHaveLength(1);
  },
);

test.each(['result', 'error'])(
  'unchanged description notifications and unrelated rerenders preserve pending and %s',
  async (state) => {
    const pending = deferred();
    preview = () => pending.promise;
    const { client } = mount();
    await fill();
    fireEvent.click(checkButton());
    async function notifyAndRerender() {
      fireEvent.click(screen.getByRole('button', { name: '동일 설명 알림' }));
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: '출처' })).getByRole('radio', {
          name: '타인 대신 보고',
        }),
      );
      await act(async () => {
        await client.invalidateQueries({ queryKey: ['managed-systems'] });
      });
      expect(previewRequests()).toHaveLength(1);
      expect(previewRequest().init.signal?.aborted).toBe(false);
    }
    await notifyAndRerender();
    expect(semanticPanel().getByText('확인 중…')).toBeInTheDocument();
    await act(async () => {
      pending.resolve(state === 'result' ? json(result) : json(quota('actor', 'day'), 429));
    });
    await notifyAndRerender();
    if (state === 'result') expect(semanticPanel().getAllByRole('link')).toHaveLength(3);
    else
      expect(
        semanticPanel().getByText('오늘 유사 VOC 조회 한도를 사용했습니다'),
      ).toBeInTheDocument();
  },
);

test.each(['pending', 'error'])(
  'actual create POST succeeds independently of preview %s',
  async (state) => {
    const pending = deferred();
    preview =
      state === 'pending' ? () => pending.promise : async () => json(quota('actor', 'day'), 429);
    const { router } = mount();
    await fill();
    fireEvent.click(checkButton());
    await screen.findByText(
      state === 'pending' ? '확인 중…' : '오늘 유사 VOC 조회 한도를 사용했습니다',
    );
    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ view: 'my', selected: CREATED }),
    );
    expect(createRequests()).toHaveLength(1);
    expect(previewRequests()).toHaveLength(1);
    if (state === 'pending') {
      expect(previewRequest().init.signal?.aborted).toBe(true);
      await act(async () => {
        pending.resolve(json(result));
      });
      expect(screen.queryByText('이전 중복 1')).not.toBeInTheDocument();
    }
  },
);

test('real candidate navigation opens DirtyConfirmation; keep writing preserves draft, move reaches UUID without writes', async () => {
  const { router } = mount();
  await fill();
  fireEvent.click(checkButton());
  const candidate = await screen.findByRole('link', { name: /이전 중복 1/ });
  fireEvent.click(candidate);
  const dialog = await screen.findByRole('dialog');
  expect(router.state.location.search).toMatchObject({ action: 'create' });
  fireEvent.click(within(dialog).getByRole('button', { name: '계속 작성' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: /제목/ })).toHaveValue('중복 여부 확인');
  expect(screen.getByRole('textbox', { name: '상세 설명' })).toHaveValue('재현 절차');
  expect(semanticPanel().getAllByRole('link')).toHaveLength(3);
  fireEvent.click(candidate);
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '이동' }));
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ view: 'inbox', selected: CANDIDATE }),
  );
  expect(router.state.location.pathname).toBe('/vocs');
  expect(
    requests
      .filter(({ method }) => ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method))
      .map(({ method, path }) => ({ method, path })),
  ).toEqual([{ method: 'POST', path: '/vocs/similarity-preview' }]);
});

test.each(['resolve', 'reject'])(
  'unmount aborts pending and late %s cannot affect a fresh idle remount',
  async (outcome) => {
    const pending = deferred();
    preview = () => pending.promise;
    const first = mount();
    await fill();
    fireEvent.click(checkButton());
    first.unmount();
    expect(previewRequest().init.signal?.aborted).toBe(true);
    mount();
    await screen.findByRole('textbox', { name: /제목/ });
    await screen.findByTestId('semantic-voc-panel');
    await act(async () => {
      if (outcome === 'resolve') pending.resolve(json(result));
      else pending.reject(new Error('late failure'));
    });
    expect(semanticPanel().queryAllByRole('link')).toHaveLength(0);
    expect(semanticPanel().queryByText('확인 중…')).not.toBeInTheDocument();
    expect(checkButton()).toBeDisabled();
    expect(previewRequests()).toHaveLength(1);
  },
);

test('Tab reaches the check button and each candidate; completing a check keeps button focus', async () => {
  const user = userEvent.setup();
  const pending = deferred();
  preview = () => pending.promise;
  mount();
  await fill();
  // Traverse from the document rather than assigning focus to the target.
  (document.activeElement as HTMLElement).blur();
  for (let index = 0; index < 40 && document.activeElement !== checkButton(); index++)
    await user.tab();
  expect(checkButton()).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(previewRequests()).toHaveLength(1);
  expect(checkButton()).toHaveFocus();
  expect(checkButton()).toHaveAttribute('aria-disabled', 'true');
  expect(checkButton()).toBeEnabled();
  await user.keyboard('{Enter} ');
  expect(previewRequests()).toHaveLength(1);
  await act(async () => {
    pending.resolve(json(result));
  });
  expect(checkButton()).toHaveFocus();
  for (const item of items) {
    await user.tab();
    expect(semanticPanel().getByRole('link', { name: new RegExp(item.title) })).toHaveFocus();
  }
});

test('submitting without ever checking sends zero preview requests after render, typing, focus and blur', async () => {
  const { router } = mount();
  await screen.findByRole('textbox', { name: /제목/ });
  expect(previewRequests()).toHaveLength(0);
  await fill();
  fireEvent.click(screen.getByRole('radio', { name: 'MS 2' }));
  for (const name of [/제목/, '상세 설명']) {
    fireEvent.focus(screen.getByRole('textbox', { name }));
    fireEvent.blur(screen.getByRole('textbox', { name }));
  }
  await act(async () => {
    await Promise.resolve();
  });
  expect(previewRequests()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ view: 'my', selected: CREATED }),
  );
  expect(createRequests()).toHaveLength(1);
  expect(previewRequests()).toHaveLength(0);
});
