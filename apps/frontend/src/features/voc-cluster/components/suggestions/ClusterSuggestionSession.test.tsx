import {
  confirmVocClusterSuggestionRequestSchema,
  discardVocClusterSuggestionRequestSchema,
  restoreVocClusterSuggestionRequestSchema,
  vocClusterSuggestionItemSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clusterSuggestionsKey, useClusterSuggestions } from '../../hooks/useClusterSuggestions';
import { ClusterSuggestionSession } from './ClusterSuggestionSession';

const pair = vocClusterSuggestionItemSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  primary_managed_system_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  revision: 3,
  embedding_version: 2,
  source_hashes: ['hash-a', 'hash-b'],
  vocs: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      display_id: 'VOC-12',
      title: '첫 번째 문의',
      description_rich_content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '첫 번째 본문' }] }],
      },
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      display_id: 'VOC-34',
      title: '두 번째 문의',
      description_rich_content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '두 번째 본문' }] }],
      },
    },
  ],
});
const clusterId = '44444444-4444-4444-8444-444444444444';
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));
let items = [pair];
let posts: Array<{ path: string; body: unknown; key: string }>;
let postResponse: (path: string) => Promise<Response>;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function testRouter() {
  const root = createRootRoute();
  const vocs = createRoute({ getParentRoute: () => root, path: '/vocs' });
  return createRouter({
    routeTree: root.addChildren([vocs]),
    history: createMemoryHistory({ initialEntries: ['/vocs'] }),
  });
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterContextProvider router={testRouter()}>
        <ClusterSuggestionSession>
          {({ list, panel, count }) => (
            <>
              <span data-testid="count">{count}</span>
              {list}
              {panel}
            </>
          )}
        </ClusterSuggestionSession>
      </RouterContextProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
beforeEach(() => {
  items = [pair];
  posts = [];
  toastSuccess.mockClear();
  postResponse = async () => {
    items = [];
    return json({ voc_cluster_id: clusterId, cluster_created: true });
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) => {
      if (init.method === 'GET') return json({ available: true, items });
      posts.push({
        path,
        body: JSON.parse(String(init.body)),
        key: String((init.headers as Record<string, string>)['Idempotency-Key']),
      });
      return postResponse(path);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('Cluster suggestion review', () => {
  it('reviews both texts and confirms the displayed pair once with a Cluster link and queue invalidation', async () => {
    const { client } = mount();
    for (const key of [['voc-clusters'], ['nav-counts'], ['recovery'], ['dashboard-summary']])
      client.setQueryData(key, { cached: true });
    fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
    expect(screen.getByText('첫 번째 본문')).toBeInTheDocument();
    expect(screen.getByText('두 번째 본문')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '확인 후 Cluster 생성' });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirmVocClusterSuggestionRequestSchema.parse(posts[0]?.body)).toEqual({
      expected_revision: 3,
      embedding_version: 2,
      source_hashes: ['hash-a', 'hash-b'],
    });
    expect(posts[0]?.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const options = toastSuccess.mock.calls[0]?.[1];
    render(options.description);
    expect(screen.getByRole('link', { name: 'Cluster 보기' })).toHaveAttribute(
      'href',
      `/voc-clusters/${clusterId}`,
    );
    for (const key of [['voc-clusters'], ['nav-counts'], ['recovery'], ['dashboard-summary']])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});

it('keeps a discarded line through refetch, then restores with the discard revision and focuses the row', async () => {
  const { client } = mount();
  postResponse = async (path) => {
    if (path.endsWith('/discard')) {
      items = [];
      return json({
        id: pair.id,
        revision: 4,
        discarded_at: new Date().toISOString(),
        undo_until: new Date(Date.now() + 300000).toISOString(),
      });
    }
    items = [{ ...pair, revision: 5 }];
    return json({ id: pair.id, revision: 5 });
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '기각' }));
  const undo = await screen.findByRole('button', { name: '되돌리기' });
  expect(undo).toHaveFocus();
  expect(discardVocClusterSuggestionRequestSchema.parse(posts[0]?.body)).toEqual({
    expected_revision: 3,
  });
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
  });
  expect(screen.getByText('제안을 기각했습니다')).toBeInTheDocument();
  fireEvent.click(undo);
  await waitFor(() => expect(screen.queryByText('제안을 기각했습니다')).not.toBeInTheDocument());
  expect(restoreVocClusterSuggestionRequestSchema.parse(posts[1]?.body)).toEqual({
    expected_revision: 4,
    embedding_version: 2,
    source_hashes: ['hash-a', 'hash-b'],
  });
  expect(posts[1]?.key).not.toBe(posts[0]?.key);
  expect(await screen.findByRole('button', { name: /VOC-12/ })).toHaveFocus();
});

it.each([403, 404, 409])(
  'removes an undo line after restore %i and focuses a safe error',
  async (status) => {
    mount();
    postResponse = async (path) => {
      items = [];
      return path.endsWith('/discard')
        ? json({
            id: pair.id,
            revision: 4,
            discarded_at: new Date().toISOString(),
            undo_until: new Date(Date.now() + 300000).toISOString(),
          })
        : json(
            {
              code:
                status === 409
                  ? 'conflict.stale_write'
                  : status === 404
                    ? 'not_found.record'
                    : 'permission.denied',
              message: 'safe failure',
            },
            status,
          );
    };
    fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
    fireEvent.click(screen.getByRole('button', { name: '기각' }));
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.queryByText('첫 번째 본문')).not.toBeInTheDocument();
  },
);

it.each([403, 404, 409])(
  'clears both texts/count after mutation %i and keeps a connected notice after refetch',
  async (status) => {
    mount();
    postResponse = async () => {
      items = [];
      return json(
        {
          code:
            status === 409
              ? 'conflict.stale_write'
              : status === 404
                ? 'not_found.record'
                : 'permission.denied',
          message: 'safe',
        },
        status,
      );
    };
    fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
    fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
    await waitFor(() => expect(screen.queryByText('첫 번째 본문')).not.toBeInTheDocument());
    expect(screen.queryByText('두 번째 본문')).not.toBeInTheDocument();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(posts).toHaveLength(1);
  },
);

it('reuses the full intent key after a transport failure and mints a new key after a revision change', async () => {
  const { client } = mount();
  postResponse = async () => {
    throw new TypeError('offline');
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]?.key).toBe(posts[0]?.key);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '확인 후 Cluster 생성' })).toBeEnabled(),
  );
  items = [{ ...pair, revision: 6 }];
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
  });
  fireEvent.click(screen.getByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
  await waitFor(() => expect(posts).toHaveLength(3));
  expect(posts[2]?.key).not.toBe(posts[1]?.key);
  expect(confirmVocClusterSuggestionRequestSchema.parse(posts[2]?.body).expected_revision).toBe(6);
});

it('expires an undo at its absolute partly elapsed deadline despite query replacement', async () => {
  const { client } = mount();
  postResponse = async () => {
    items = [];
    return json({
      id: pair.id,
      revision: 4,
      discarded_at: new Date(Date.now() - 298000).toISOString(),
      undo_until: new Date(Date.now() + 2000).toISOString(),
    });
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '기각' }));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole('button', { name: '되돌리기' })).toHaveFocus();
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1998);
  });
  expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
});

it('keeps two independent undo lines in their original positions through query replacement', async () => {
  const second = {
    ...pair,
    id: '55555555-5555-4555-8555-555555555555',
    vocs: [
      { ...pair.vocs[0], id: '66666666-6666-4666-8666-666666666666', display_id: 'VOC-56' },
      { ...pair.vocs[1], id: '77777777-7777-4777-8777-777777777777', display_id: 'VOC-78' },
    ] as typeof pair.vocs,
  };
  items = [pair, second];
  const { client } = mount();
  postResponse = async (path) => {
    const id = path.split('/')[2];
    if (!id) throw new Error('Missing suggestion id');
    items = items.filter((entry) => entry.id !== id);
    return json({
      id,
      revision: 4,
      discarded_at: new Date().toISOString(),
      undo_until: new Date(Date.now() + 300000).toISOString(),
    });
  };
  for (const name of [/VOC-12/, /VOC-56/]) {
    fireEvent.click(await screen.findByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: '기각' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '되돌리기' })).toHaveLength(
        name.source === 'VOC-12' ? 1 : 2,
      ),
    );
  }
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
  });
  // Restoring the first rendered line must target the original first pair.
  postResponse = async () => json({ id: pair.id, revision: 5 });
  const firstUndo = screen.getAllByRole('button', { name: '되돌리기' })[0];
  if (!firstUndo) throw new Error('First undo missing');
  fireEvent.click(firstUndo);
  await waitFor(() => expect(posts).toHaveLength(3));
  expect(posts[2]?.path).toBe(`/voc-cluster-suggestions/${pair.id}/restore`);
});

it('finishes cache invalidation after unmount without resurrecting a panel or focusing a late toast', async () => {
  let release!: (response: Response) => void;
  postResponse = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const { client, unmount } = mount();
  client.setQueryData(['recovery'], { cached: true });
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  unmount();
  await act(async () => {
    release(json({ voc_cluster_id: clusterId, cluster_created: true }));
  });
  await waitFor(() => expect(client.getQueryState(['recovery'])?.isInvalidated).toBe(true));
  expect(toastSuccess).not.toHaveBeenCalled();
});

it('does not re-enable the reviewed stale payload after a failed refetch', async () => {
  mount();
  let failRead = false;
  const originalFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) =>
      failRead && init.method === 'GET'
        ? json({ code: 'internal.unexpected', message: 'read failed' }, 500)
        : originalFetch(path, init),
    ),
  );
  postResponse = async () => {
    failRead = true;
    return json({ code: 'conflict.stale_write', message: 'changed' }, 409);
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '확인 후 Cluster 생성' })).toBeDisabled(),
  );
  expect(posts).toHaveLength(1);
});

it('renders the empty read state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ available: true, items: [] })),
  );
  mount();
  expect(await screen.findByText('검토할 Cluster 제안이 없습니다')).toBeInTheDocument();
  expect(screen.queryByText('첫 번째 본문')).not.toBeInTheDocument();
});

it('drops an already-expired discard response without rendering an undo', async () => {
  mount();
  postResponse = async () => {
    items = [];
    return json({
      id: pair.id,
      revision: 4,
      discarded_at: new Date(Date.now() - 301000).toISOString(),
      undo_until: new Date(Date.now() - 1000).toISOString(),
    });
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '기각' }));
  await screen.findByText('검토할 Cluster 제안이 없습니다');
  expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
});

it('excludes confirm and discard in the same event turn', async () => {
  mount();
  postResponse = () => new Promise(() => {});
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  const confirm = screen.getByRole('button', { name: '확인 후 Cluster 생성' });
  const discard = screen.getByRole('button', { name: '기각' });
  await act(async () => {
    fireEvent.click(confirm);
    fireEvent.click(discard);
  });
  expect(posts).toHaveLength(1);
  expect(confirm).toBeDisabled();
  expect(discard).toBeDisabled();
});

it('focuses a restored row only after it arrives in a subsequent read', async () => {
  const { client } = mount();
  postResponse = async (path) => {
    items = [];
    return path.endsWith('/discard')
      ? json({
          id: pair.id,
          revision: 4,
          discarded_at: new Date().toISOString(),
          undo_until: new Date(Date.now() + 300000).toISOString(),
        })
      : json({ id: pair.id, revision: 5 });
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '기각' }));
  fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument(),
  );
  items = [{ ...pair, revision: 5 }];
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
  });
  expect(await screen.findByRole('button', { name: /VOC-12/ })).toHaveFocus();
});

it('expires while restore is pending and uses a bounded focus fallback if the restored row stays absent', async () => {
  mount();
  let release!: (response: Response) => void;
  postResponse = async (path) => {
    items = [];
    if (path.endsWith('/restore'))
      return new Promise((resolve) => {
        release = resolve;
      });
    return json({
      id: pair.id,
      revision: 4,
      discarded_at: new Date(Date.now() - 299000).toISOString(),
      undo_until: new Date(Date.now() + 1000).toISOString(),
    });
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '기각' }));
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
  await act(async () => {
    release(json({ id: pair.id, revision: 5 }));
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByLabelText('Cluster 제안')).toHaveFocus();
});

it.each([403, 404])(
  'evicts a denied pair after tab exit before a delayed corrective read (%i)',
  async (status) => {
    const actorContext = 'workspace:actor:admin';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Host({ active }: { active: boolean }) {
      const query = useClusterSuggestions(undefined, actorContext);
      return (
        <>
          <span data-testid="badge">{query.data?.items.length}</span>
          {active && (
            <ClusterSuggestionSession actorContext={actorContext}>
              {({ list, panel, count }) => (
                <>
                  <span data-testid="count">{count}</span>
                  {list}
                  {panel}
                </>
              )}
            </ClusterSuggestionSession>
          )}
        </>
      );
    }
    const router = testRouter();
    const view = (active: boolean) => (
      <QueryClientProvider client={client}>
        <RouterContextProvider router={router}>
          <Host active={active} />
        </RouterContextProvider>
      </QueryClientProvider>
    );
    let release!: (response: Response) => void;
    postResponse = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const { rerender } = render(view(true));
    fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
    fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    rerender(view(false));
    const reads: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            reads.push(resolve);
          }),
      ),
    );
    await act(async () => {
      release(
        json(
          { code: status === 403 ? 'permission.denied' : 'not_found.record', message: 'safe' },
          status,
        ),
      );
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    rerender(view(true));
    expect(screen.queryByRole('button', { name: /VOC-12/ })).not.toBeInTheDocument();
    expect(screen.queryByText('첫 번째 본문')).not.toBeInTheDocument();
    expect(screen.queryByText('두 번째 본문')).not.toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('0');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    await act(async () => {
      for (const resolve of reads) resolve(json({ available: true, items: [] }));
    });
    client.clear();
  },
);

it.each(
  [403, 404].flatMap((status) =>
    ['confirm', 'discard', 'restore'].map((action) => ({ status, action })),
  ),
)(
  'evicts every captured actor scope and cancels obsolete reads before scope switch ($action $status)',
  async ({ status, action }) => {
    const actorContext = 'workspace:actor:admin';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const scope of [undefined, pair.primary_managed_system_id, 'other-ms']) {
      client.setQueryData(clusterSuggestionsKey(scope, actorContext), {
        available: true,
        items: [pair],
      });
    }
    client.setQueryData(clusterSuggestionsKey(undefined, 'other-workspace:actor:admin'), {
      available: true,
      items: [pair],
    });
    function Host({ scope }: { scope: string | undefined }) {
      return (
        <ClusterSuggestionSession
          key={scope ?? 'all'}
          managedSystemId={scope}
          actorContext={actorContext}
        >
          {({ list, panel, count }) => (
            <>
              <span data-testid="count">{count}</span>
              {list}
              {panel}
            </>
          )}
        </ClusterSuggestionSession>
      );
    }
    const router = testRouter();
    const view = (scope: string | undefined) => (
      <QueryClientProvider client={client}>
        <RouterContextProvider router={router}>
          <Host scope={scope} />
        </RouterContextProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(view(pair.primary_managed_system_id));
    fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
    if (action === 'restore') {
      postResponse = async () => {
        items = [];
        return json({
          id: pair.id,
          revision: 4,
          discarded_at: new Date().toISOString(),
          undo_until: new Date(Date.now() + 300000).toISOString(),
        });
      };
      fireEvent.click(screen.getByRole('button', { name: '기각' }));
      await screen.findByRole('button', { name: '되돌리기' });
    }
    const obsolete: Array<{ resolve: (response: Response) => void; signal: AbortSignal }> = [];
    const originalFetch = globalThis.fetch;
    let delayReads = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string, init: RequestInit) => {
        if (delayReads && init.method === 'GET')
          return new Promise<Response>((resolve) => {
            obsolete.push({ resolve, signal: init.signal as AbortSignal });
          });
        return originalFetch(path, init);
      }),
    );
    delayReads = true;
    // Start reads that still contain the old pair in every cached scope before denial.
    const pendingReads = [undefined, pair.primary_managed_system_id, 'other-ms'].map((scope) =>
      client.fetchQuery({
        queryKey: clusterSuggestionsKey(scope, actorContext),
        queryFn: async ({ signal }) =>
          await fetch('/voc-cluster-suggestions', { method: 'GET', signal }).then((r) => r.json()),
      }),
    );
    const settledReads = Promise.allSettled(pendingReads);
    const oldReads = [...obsolete];
    postResponse = async () =>
      json(
        { code: status === 403 ? 'permission.denied' : 'not_found.record', message: 'safe' },
        status,
      );
    fireEvent.click(
      screen.getByRole('button', {
        name:
          action === 'restore'
            ? '되돌리기'
            : action === 'discard'
              ? '기각'
              : '확인 후 Cluster 생성',
      }),
    );
    await screen.findByRole('alert');
    rerender(view(undefined));
    expect(screen.queryByRole('button', { name: /VOC-12/ })).not.toBeInTheDocument();
    expect(screen.queryByText('첫 번째 본문')).not.toBeInTheDocument();
    expect(screen.queryByText('두 번째 본문')).not.toBeInTheDocument();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(oldReads.every(({ signal }) => signal.aborted)).toBe(true);
    await act(async () => {
      for (const { resolve } of oldReads) resolve(json({ available: true, items: [pair] }));
      await settledReads;
    });
    for (const scope of [undefined, pair.primary_managed_system_id, 'other-ms']) {
      rerender(view(scope));
      expect(screen.queryByRole('button', { name: /VOC-12/ })).not.toBeInTheDocument();
      expect(screen.getByTestId('count')).toHaveTextContent('0');
    }
    expect(
      client.getQueryData(clusterSuggestionsKey(undefined, 'other-workspace:actor:admin')),
    ).toEqual({ available: true, items: [pair] });
    await act(async () => {
      for (const { resolve } of obsolete) resolve(json({ available: true, items: [] }));
    });
    client.clear();
  },
);

it.each([403, 404, 409])(
  'focuses each identical restore notice after two keyboard undo activations (%i)',
  async (status) => {
    const second = {
      ...pair,
      id: '55555555-5555-4555-8555-555555555555',
      vocs: [
        { ...pair.vocs[0], id: '66666666-6666-4666-8666-666666666666', display_id: 'VOC-56' },
        { ...pair.vocs[1], id: '77777777-7777-4777-8777-777777777777', display_id: 'VOC-78' },
      ] as typeof pair.vocs,
    };
    items = [pair, second];
    mount();
    postResponse = async (path) => {
      const id = path.split('/')[2];
      if (path.endsWith('/discard')) {
        items = items.filter((entry) => entry.id !== id);
        return json({
          id,
          revision: 4,
          discarded_at: new Date().toISOString(),
          undo_until: new Date(Date.now() + 300000).toISOString(),
        });
      }
      return json(
        {
          code:
            status === 409
              ? 'conflict.stale_write'
              : status === 404
                ? 'not_found.record'
                : 'permission.denied',
          message: 'same safe failure',
        },
        status,
      );
    };
    for (const name of [/VOC-12/, /VOC-56/]) {
      fireEvent.click(await screen.findByRole('button', { name }));
      fireEvent.click(screen.getByRole('button', { name: '기각' }));
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: '되돌리기' })).toHaveLength(
          name.source === 'VOC-12' ? 1 : 2,
        ),
      );
    }
    const user = userEvent.setup();
    for (const remaining of [1, 0]) {
      const undo = screen.getAllByRole('button', { name: '되돌리기' })[0];
      if (!undo) throw new Error('Undo missing');
      undo.focus();
      await user.keyboard('{Enter}');
      await waitFor(() =>
        expect(screen.queryAllByRole('button', { name: '되돌리기' })).toHaveLength(remaining),
      );
      expect(screen.getByRole('alert')).toHaveFocus();
      expect(document.activeElement?.isConnected).toBe(true);
    }
  },
);

function mountWithRouter() {
  const root = createRootRoute();
  const vocs = createRoute({ getParentRoute: () => root, path: '/vocs' });
  const router = createRouter({
    routeTree: root.addChildren([vocs]),
    history: createMemoryHistory({ initialEntries: ['/vocs'] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterContextProvider router={router}>
        <ClusterSuggestionSession>
          {({ list, panel, count }) => (
            <>
              <span data-testid="count">{count}</span>
              {list}
              {panel}
            </>
          )}
        </ClusterSuggestionSession>
      </RouterContextProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

it('announces the inline discard confirmation while undo receives focus', async () => {
  mountWithRouter();
  postResponse = async () => {
    items = [];
    return json({
      id: pair.id,
      revision: 4,
      discarded_at: new Date().toISOString(),
      undo_until: new Date(Date.now() + 300000).toISOString(),
    });
  };
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  fireEvent.click(screen.getByRole('button', { name: '기각' }));
  expect(await screen.findByRole('button', { name: '되돌리기' })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('제안을 기각했습니다');
});

it('does not replay a dismissed notice when another pair is keyboard-opened', async () => {
  const second = { ...pair, id: '55555555-5555-4555-8555-555555555555' };
  items = [pair, second];
  mountWithRouter();
  postResponse = async () => {
    items = [second];
    return json({ code: 'permission.denied', message: 'safe failure' }, 403);
  };
  const first = (await screen.findAllByRole('button', { name: /VOC-12/ }))[0];
  if (!first) throw new Error('First suggestion missing');
  fireEvent.click(first);
  fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  const row = await screen.findByRole('button', { name: /VOC-12/ });
  row.focus();
  await userEvent.setup().keyboard('{Enter}');
  expect(screen.getByTestId('cluster-suggestion-panel')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(row).toHaveFocus();
});

it('keeps focus on the toast Cluster link after confirming the last pair', async () => {
  const { client } = mountWithRouter();
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '확인 후 Cluster 생성' }));
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(toastSuccess).toHaveBeenCalled();
  render(toastSuccess.mock.calls[0]?.[1].description);
  const link = screen.getByRole('link', { name: 'Cluster 보기' });
  expect(link).toHaveFocus();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(link).toHaveFocus();
  client.clear();
});

it('shows an explicit description fallback for an empty TipTap doc', async () => {
  items = [
    {
      ...pair,
      vocs: [
        { ...pair.vocs[0], description_rich_content: { type: 'doc', content: [] } },
        pair.vocs[1],
      ],
    },
  ];
  mountWithRouter();
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  expect(screen.getByText('설명 없음')).toBeInTheDocument();
  expect(screen.getByText('두 번째 본문')).toBeInTheDocument();
});

it('places the suggestion title beside the kind chip in the panel identity group', async () => {
  mountWithRouter();
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  const header = screen.getByTestId('detail-panel-header-content');
  expect(header.firstElementChild).toHaveTextContent('Cluster 제안');
  expect(header.firstElementChild).toHaveTextContent('Cluster');
});
