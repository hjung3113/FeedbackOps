import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClusterSectionReadOnly } from '../ClusterSectionReadOnly';
import { installListMotionEnvironment } from './list-motion-environment';

const items = [1, 2].map((n) => ({
  voc_id: `00000000-0000-4000-8000-00000000000${n}`,
  display_id: `VOC-${n}`,
  title: `Candidate ${n}`,
  severity: null,
  reporter_facing_status: 'received' as const,
  score: 0.9,
}));
const response = { available: true, embedding_version: 1, items, total: 2 };
let environment: ReturnType<typeof installListMotionEnvironment>;
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  environment.restore();
});

function mount() {
  environment = installListMotionEnvironment();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['voc-recommendations', 'source-a'], response);
  client.setQueryData(['voc-recommendations', 'source-b'], {
    ...response,
    items: items.map((item) => ({
      ...item,
      voc_id: `${item.voc_id.slice(0, -1)}${Number(item.voc_id.slice(-1)) + 2}`,
    })),
  });
  const contents = (vocId: string) => (
    <QueryClientProvider client={client}>
      <ClusterSectionReadOnly vocId={vocId} similarCount={2} />
    </QueryClientProvider>
  );
  return { view: render(contents('source-a')), contents };
}

it('switches cached non-empty source VOCs without animating rows', async () => {
  const { view, contents } = mount();
  await act(async () => {});
  environment.animate.mockClear();
  view.rerender(contents('source-b'));
  await act(async () => {});
  expect(screen.getByTestId('cluster-recommendation-list').children).toHaveLength(2);
  expect(environment.animate).not.toHaveBeenCalled();
});

it('animates candidate dismissal in the same source VOC', async () => {
  mount();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ ...response, items: items.slice(1), total: 1 }), {
            headers: { 'content-type': 'application/json' },
          }),
    ),
  );
  await act(async () => {});
  environment.animate.mockClear();
  fireEvent.click(screen.getByTestId(`cluster-recommendation-dismiss-${items[0]?.voc_id}`));
  await waitFor(() => expect(environment.animate).toHaveBeenCalled());
  expect(screen.getByTestId(`cluster-recommendation-row-${items[1]?.voc_id}`)).toBeInTheDocument();
});
