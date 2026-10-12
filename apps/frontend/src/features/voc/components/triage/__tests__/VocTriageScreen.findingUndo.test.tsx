import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate, renderers } = vi.hoisted(() => ({
  navigate: vi.fn(),
  renderers: [] as Array<(id: string | number) => ReactNode>,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/vocs', href: '/vocs?view=triage' }),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn((renderer: (id: string | number) => ReactNode) => {
      renderers.push(renderer);
      return `undo-${renderers.length}`;
    }),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { VocTriageScreen } from '../VocTriageScreen';

const VOC: VocListItem = {
  id: '10000000-0000-4000-8000-000000000001',
  display_id: 'VOC-UNDO-1',
  title: 'Finding undo',
  reporter_facing_status: 'received',
  severity: 'high',
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '10000000-0000-4000-8000-000000000099',
  reporter_id: '10000000-0000-4000-8000-000000000010',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function response(state: string, status = 200) {
  return new Response(
    JSON.stringify(
      status === 409
        ? { code: 'conflict.stale_write', message: 'Stale write' }
        : { id: VOC.id, triage_state: state, updated_at: '2026-05-02T00:00:00.000Z' },
    ),
    { status, headers: { 'content-type': 'application/json' } },
  );
}
async function settle(request: ReturnType<typeof deferred>, value: Response) {
  await act(async () => {
    request.resolve(value);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function setup(items = [VOC]) {
  const forward = deferred();
  const compensation = deferred();
  const post = deferred();
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push({ url, method, body });
      if (method === 'POST') return post.promise;
      if (method === 'PATCH') {
        return body.triage_state === 'triaged' ? forward.promise : compensation.promise;
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = (selectedId: string) => (
    <QueryClientProvider client={client}>
      <VocTriageScreen
        items={items}
        selectedId={selectedId}
        activeTab="untriaged"
        onSelectVoc={vi.fn()}
        onTabChange={vi.fn()}
      />
    </QueryClientProvider>
  );
  const rendered = render(view(VOC.id));
  return { forward, compensation, post, requests, client, view, ...rendered };
}
function undo(index = 0) {
  const renderer = renderers[index];
  expect(renderer).toBeDefined();
  const host = render(
    <ol data-sonner-toaster>
      <li data-sonner-toast>{renderer?.(`undo-${index + 1}`)}</li>
    </ol>,
  );
  fireEvent.click(within(host.container).getByText('실행 취소'));
}
async function openFinding() {
  fireEvent.click(screen.getByRole('button', { name: 'Finding 만들기' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  // Singleton queue empties, unmounting the panel that captured the undo handler.
  expect(screen.queryByTestId('triage-panel-column')).not.toBeInTheDocument();
}

beforeEach(() => {
  renderers.length = 0;
  navigate.mockReset();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Finding dialog lifetime through token-bound undo (#1030)', () => {
  it.each(['pending', 'compensated', 'rejected'] as const)(
    'closes only when its VOC is restored: %s',
    async (path) => {
      const { forward, compensation, requests } = setup();
      await openFinding();
      await waitFor(() =>
        expect(requests.some((r) => r.body.triage_state === 'triaged')).toBe(true),
      );
      if (path !== 'pending') await settle(forward, response('triaged'));
      undo();
      if (path === 'pending') {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await settle(forward, response('triaged'));
      } else {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      }
      await waitFor(() =>
        expect(requests.some((r) => r.body.triage_state === 'untriaged')).toBe(true),
      );
      await settle(compensation, response('untriaged', path === 'compensated' ? 200 : 409));
      if (path === 'rejected') {
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      } else {
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      }
    },
  );

  it('restoring another VOC leaves the open Finding dialog intact', async () => {
    const other = { ...VOC, id: '10000000-0000-4000-8000-000000000002', title: 'Other VOC' };
    const { rerender, view, requests } = setup([VOC, other]);
    fireEvent.click(screen.getByRole('button', { name: '중간' }));
    fireEvent.click(screen.getByRole('button', { name: /Triage 확정/ }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === 'PATCH' && r.url === `/vocs/${VOC.id}`)).toBe(true),
    );
    // A missing selection unmounts the old panel, keeping its toast's command alive.
    rerender(view('outside-queue'));
    expect(screen.queryByTestId('triage-panel-column')).not.toBeInTheDocument();
    rerender(view(other.id));
    fireEvent.click(screen.getByRole('button', { name: 'Finding 만들기' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    undo(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/제목/)).toHaveValue('Other VOC');
    expect(screen.getByText(VOC.title)).toBeInTheDocument();
  });

  it('undo unmounts an in-flight Finding submission without navigating after POST succeeds', async () => {
    const { forward, compensation, post, requests, client } = setup();
    const key = ['findings', { managedSystemId: 'test' }];
    client.setQueryData(key, { items: [] });
    await openFinding();
    fireEvent.change(screen.getByLabelText(/요약/), { target: { value: '실행 가능한 판단' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finding 생성' }));
    await waitFor(() => expect(requests.some((r) => r.method === 'POST')).toBe(true));
    undo();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await settle(
      post,
      new Response(JSON.stringify({ id: '10000000-0000-4000-8000-000000000050' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    await settle(forward, response('triaged'));
    await waitFor(() =>
      expect(requests.some((r) => r.body.triage_state === 'untriaged')).toBe(true),
    );
    await settle(compensation, response('untriaged'));
    expect(navigate).not.toHaveBeenCalled();
  });
});
