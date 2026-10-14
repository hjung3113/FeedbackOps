import {
  confirmVocClusterSuggestionRequestSchema,
  discardVocClusterSuggestionRequestSchema,
  restoreVocClusterSuggestionRequestSchema,
  vocClusterSuggestionItemSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ClusterSuggestionSession>
        {({ list, panel, count }) => (
          <>
            <span data-testid="count">{count}</span>
            {list}
            {panel}
          </>
        )}
      </ClusterSuggestionSession>
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

it.each(['unavailable', 'empty', 'error', 'denied'] as const)(
  'renders the distinct %s read state',
  async (state) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        state === 'unavailable'
          ? json({ available: false, reason: 'provider_disabled', items: [] })
          : state === 'empty'
            ? json({ available: true, items: [] })
            : json(
                {
                  code: state === 'denied' ? 'permission.denied' : 'internal.unexpected',
                  message: 'safe',
                },
                state === 'denied' ? 403 : 500,
              ),
      ),
    );
    mount();
    const copy = {
      unavailable: '임베딩이 꺼져 있어 Cluster 제안을 사용할 수 없습니다',
      empty: '검토할 Cluster 제안이 없습니다',
      error: 'Cluster 제안을 불러오지 못했습니다',
      denied: 'Cluster 제안을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
    };
    expect(await screen.findByText(copy[state])).toBeInTheDocument();
    expect(screen.queryByText('첫 번째 본문')).not.toBeInTheDocument();
  },
);

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
