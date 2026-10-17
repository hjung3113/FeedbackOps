import type { VocFollowUpState } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoFollowUpSection } from '../NoFollowUpSection';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: request,
}));
const open: VocFollowUpState = { decision: null, can_record: true, can_withdraw: false };
const id = '00000000-0000-4000-8000-000000000001';
function setup(state: VocFollowUpState | undefined = open, allowed = true) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NoFollowUpSection
        key={id}
        vocId={id}
        state={state}
        canTriage={allowed}
        actorNames={new Map()}
      />
    </QueryClientProvider>,
  );
  return { ...view, client };
}
function start() {
  fireEvent.click(screen.getByRole('button', { name: '후속 조치 불필요로 결정' }));
  fireEvent.change(screen.getByLabelText('결정 사유'), { target: { value: '  사유  ' } });
}

describe('VOC no-follow-up detail', () => {
  beforeEach(() => request.mockReset());
  it.each([undefined, { decision: null, can_record: false, can_withdraw: false }])(
    'fails closed on absent eligibility or hidden direct/Cluster follow-up',
    (state) => {
      const client = new QueryClient();
      render(
        <QueryClientProvider client={client}>
          <NoFollowUpSection vocId={id} state={state} canTriage actorNames={new Map()} />
        </QueryClientProvider>,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
  it('omits actions while permission is loading or denied', () => {
    setup(open, false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('validates reason and prevents same-event duplicate submit while refreshing source caches', async () => {
    let resolve!: (v: unknown) => void;
    request.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { client } = setup();
    for (const key of [
      ['voc', id],
      ['vocs'],
      ['nav-counts'],
      ['recovery'],
      ['dashboard-summary'],
      ['dashboard-area-report'],
    ])
      client.setQueryData(key, {});
    fireEvent.click(screen.getByRole('button', { name: '후속 조치 불필요로 결정' }));
    expect(screen.getByTestId('voc-no-follow-up-submit')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('결정 사유'), { target: { value: '   ' } });
    expect(screen.getByTestId('voc-no-follow-up-submit')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('결정 사유'), { target: { value: '사유' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('voc-no-follow-up-submit'));
      fireEvent.click(screen.getByTestId('voc-no-follow-up-submit'));
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ data: {} }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    for (const key of [
      ['voc', id],
      ['vocs'],
      ['nav-counts'],
      ['recovery'],
      ['dashboard-summary'],
      ['dashboard-area-report'],
    ])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
  it('retains a failed draft and retries the same intent', async () => {
    request.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce({ data: {} });
    setup();
    start();
    fireEvent.click(screen.getByTestId('voc-no-follow-up-submit'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('결정 사유')).toHaveValue('  사유  ');
    fireEvent.click(screen.getByTestId('voc-no-follow-up-submit'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(request.mock.calls[0]?.[3]?.idempotencyKey).toBe(
      request.mock.calls[1]?.[3]?.idempotencyKey,
    );
  });
  it('does not close a new VOC dialog when the old command settles', async () => {
    let resolve!: (v: unknown) => void;
    request.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { rerender, client } = setup();
    start();
    fireEvent.click(screen.getByTestId('voc-no-follow-up-submit'));
    await act(async () => {
      await Promise.resolve();
    });
    const nextId = '00000000-0000-4000-8000-000000000002';
    rerender(
      <QueryClientProvider client={client}>
        <NoFollowUpSection
          key={nextId}
          vocId={nextId}
          state={open}
          canTriage
          actorNames={new Map()}
        />
      </QueryClientProvider>,
    );
    start();
    await act(async () => resolve({ data: {} }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('결정 사유')).toHaveValue('  사유  ');
  });
  it('discards a cancelled draft and gives the new intent a fresh key', async () => {
    request.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce({ data: {} });
    setup();
    start();
    fireEvent.click(screen.getByTestId('voc-no-follow-up-submit'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '후속 조치 불필요로 결정' }));
    expect(screen.getByLabelText('결정 사유')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('결정 사유'), { target: { value: '새 사유' } });
    fireEvent.click(screen.getByTestId('voc-no-follow-up-submit'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(request.mock.calls[0]?.[3]?.idempotencyKey).not.toBe(
      request.mock.calls[1]?.[3]?.idempotencyKey,
    );
  });
  it.each(['scope', 'permission'] as const)(
    'discards the draft on %s lifetime changes',
    (change) => {
      const { rerender, client } = setup();
      start();
      const renderState = (key: string, allowed: boolean) => (
        <QueryClientProvider client={client}>
          <NoFollowUpSection
            key={key}
            vocId={id}
            state={open}
            canTriage={allowed}
            actorNames={new Map()}
          />
        </QueryClientProvider>
      );
      // FullDetailView keys this subtree by selection, scope, permission and server eligibility.
      rerender(renderState(`${id}:${change}`, change !== 'permission'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      rerender(renderState(`${id}:restored`, true));
      fireEvent.click(screen.getByRole('button', { name: '후속 조치 불필요로 결정' }));
      expect(screen.getByLabelText('결정 사유')).toHaveValue('');
    },
  );
  it('displays the actor, time and reason and sends bodyless withdrawal', async () => {
    request.mockResolvedValue({ data: {} });
    setup({
      decision: {
        decision: 'no_follow_up',
        actor_id: id,
        reason: '이미 해결됨',
        decided_at: '2026-10-16T00:00:00.000Z',
      },
      can_record: false,
      can_withdraw: true,
    });
    expect(screen.getByText('이미 해결됨')).toBeInTheDocument();
    expect(screen.getByText(id)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '결정 철회' }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(request.mock.calls[0]?.[0]).toBe('DELETE');
    expect(request.mock.calls[0]?.[3]).not.toHaveProperty('body');
  });
});
