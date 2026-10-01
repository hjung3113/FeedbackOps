import type { TaskRequestDto } from '@fops/shared';
import type { ListToolbarTab } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskRequestsQueue } from './useTaskRequestsQueue';

const { fetchTaskRequestsMock, resolveActorsMock } = vi.hoisted(() => ({
  fetchTaskRequestsMock: vi.fn(),
  resolveActorsMock: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTaskRequests: fetchTaskRequestsMock,
  resolveActors: resolveActorsMock,
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({ items: [] })),
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({
    data: { actor: { id: '60000000-0000-0000-0000-000000000006', role_level: 'Admin' } },
  }),
}));

const taskRequest = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-42',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: '쿼리 플랜 개선 필요',
  requested_outcome: 'Task 전환 검토',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: {
    type: 'finding',
    id: '40000000-0000-0000-0000-000000000004',
    display_id: 'FIN-179',
    relation_type: 'requested_task',
    link_id: '70000000-0000-0000-0000-000000000007',
  },
} as TaskRequestDto;

function renderQueue() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTaskRequestsQueue({}), { wrapper });
}

const badgeFor = (tabs: ListToolbarTab[], value: string) =>
  tabs.find((tab) => tab.value === value)?.badgeCount;

// #706 — tab counts are unknown until the read succeeds; unknown must never
// render as 0.
describe('useTaskRequestsQueue tab counts (#706)', () => {
  beforeEach(() => {
    fetchTaskRequestsMock.mockReset();
    resolveActorsMock.mockReset();
    resolveActorsMock.mockResolvedValue({ actors: [], teams: [] });
  });

  it.each(['pending', 'failed', 'loaded', 'loaded-empty'] as const)(
    'shows tab counts only after the read succeeds (%s)',
    async (state) => {
      if (state === 'pending') {
        // Never resolves: pins the read in its pending state. (The tsconfig
        // lib predates Promise.withResolvers, and no resolver is needed.)
        fetchTaskRequestsMock.mockReturnValue(new Promise(() => undefined));
      } else if (state === 'failed') {
        fetchTaskRequestsMock.mockRejectedValue(new Error('read failed'));
      } else if (state === 'loaded-empty') {
        fetchTaskRequestsMock.mockResolvedValue({ items: [] });
      } else {
        fetchTaskRequestsMock.mockResolvedValue({ items: [taskRequest] });
      }

      const { result } = renderQueue();

      if (state === 'pending') {
        expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ]);
        return;
      }
      if (state === 'failed') {
        await waitFor(() => expect(result.current.hasError).toBe(true));
        expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ]);
        return;
      }
      // Waiting on the badge itself: `hasItems === false` also holds while the
      // read is pending, so it cannot distinguish loaded-empty from pending.
      // The badge only appears once the read has succeeded.
      const expected = state === 'loaded-empty' ? 0 : 1;
      await waitFor(() => expect(badgeFor(result.current.tabs, 'all')).toBe(expected));
      expect(badgeFor(result.current.tabs, 'pending_review')).toBe(expected);
      expect(badgeFor(result.current.tabs, 'needs_more_evidence')).toBe(0);
      expect(badgeFor(result.current.tabs, 'approved')).toBe(0);
      expect(badgeFor(result.current.tabs, 'rejected')).toBe(0);
    },
  );

  it('recovers from a failed read through a no-data refetch to real zero counts', async () => {
    fetchTaskRequestsMock.mockRejectedValueOnce(new Error('read failed'));
    let releaseRead: (() => void) | undefined;
    fetchTaskRequestsMock.mockReturnValueOnce(
      new Promise<{ items: TaskRequestDto[] }>((resolve) => {
        releaseRead = () => resolve({ items: [] });
      }),
    );

    const { result } = renderQueue();
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    act(() => result.current.refetch());

    // Post-error refetch resets to pending with no data: the error clears and
    // the counts stay absent while it is unresolved.
    await waitFor(() => expect(result.current.hasError).toBe(false));
    expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    await act(async () => {
      releaseRead?.();
    });

    await waitFor(() => expect(badgeFor(result.current.tabs, 'all')).toBe(0));
    expect(badgeFor(result.current.tabs, 'pending_review')).toBe(0);
    expect(badgeFor(result.current.tabs, 'needs_more_evidence')).toBe(0);
    expect(badgeFor(result.current.tabs, 'approved')).toBe(0);
    expect(badgeFor(result.current.tabs, 'rejected')).toBe(0);
  });
});
