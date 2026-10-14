import { useFindingStatusMutation } from '@/features/findings/hooks/useFindingStatusMutation';
import { useTaskStatusTransition } from '@/features/tasks/hooks/useTaskStatusTransition';
import { useAddClusterMember } from '@/features/voc-cluster/hooks/useAddClusterMember';
import { useCreateFindingFromCluster } from '@/features/voc-cluster/hooks/useCreateFindingFromCluster';
import { useLinkExistingFindingToVocCluster } from '@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster';
import { useRemoveClusterMember } from '@/features/voc-cluster/hooks/useRemoveClusterMember';
import type { FindingDto, TaskDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());
it('source repair invalidates inactive recovery pages, detail, history and every summary scope after unmount', async () => {
  let settle!: (response: Response) => void;
  const fetch = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        settle = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient();
  const keys = [
    ['recovery', 'list', 'visible'],
    ['recovery', 'list', 'hidden'],
    ['recovery', 'detail', 'selected'],
    ['recovery', 'history'],
    ['dashboard-summary'],
    ['dashboard-summary', 'scope'],
  ];
  for (const key of keys) client.setQueryData(key, { value: 'before' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(
    () =>
      useFindingStatusMutation({
        findingId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: '11111111-1111-4111-8111-111111111112',
      }),
    { wrapper },
  );
  act(() => result.current.mutate({ status: 'not_actionable' }));
  await waitFor(() => expect(settle).toBeTypeOf('function'));
  unmount();
  await act(async () =>
    settle(
      new Response(
        JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', status: 'not_actionable' }),
      ),
    ),
  );
  await waitFor(() =>
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]),
  );
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ status: 'not_actionable' });
});

const sourceId = '11111111-1111-4111-8111-111111111111';
const task: TaskDto = {
  id: sourceId,
  workspace_id: sourceId,
  display_id: 'TASK-1',
  primary_managed_system_id: sourceId,
  title: 'Repair Task',
  status: 'backlog',
  priority: 'high',
  assignee_actor_id: null,
  assignee_team_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: sourceId,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};
const finding: FindingDto = {
  id: sourceId,
  workspace_id: sourceId,
  display_id: 'FIN-1',
  primary_managed_system_id: sourceId,
  title: 'Repair Finding',
  summary: 'Summary',
  evidence_count: 1,
  severity: 'high',
  confidence: null,
  status: 'draft',
  owner_actor_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  source_type: 'voc_cluster',
  source_id: sourceId,
  source: { type: 'voc_cluster', id: sourceId, relation_type: 'created_finding' },
  created_by: sourceId,
  created_at: task.created_at,
  updated_at: task.updated_at,
};
const repairs = [
  {
    name: 'Task status transition',
    useRepair: () => {
      const mutation = useTaskStatusTransition(['tasks']);
      return () => mutation.mutate({ task, status: 'released' });
    },
    body: { status: 'released' },
    response: { ...task, status: 'released', source: null },
  },
  {
    name: 'Cluster create Finding',
    useRepair: () => {
      const mutation = useCreateFindingFromCluster();
      return () =>
        mutation.mutate({
          clusterId: sourceId,
          body: { title: 'Repair Finding', summary: 'Summary', severity: 'high' },
        });
    },
    body: { title: 'Repair Finding', summary: 'Summary', severity: 'high' },
    response: finding,
  },
  {
    name: 'Cluster link Finding',
    useRepair: () => {
      const mutation = useLinkExistingFindingToVocCluster();
      return () => mutation.mutate({ clusterId: sourceId, findingId: sourceId });
    },
    body: { finding_id: sourceId },
    response: { id: sourceId, display_id: 'FIN-1', status: 'active' },
  },
  {
    name: 'Cluster add member',
    useRepair: () => {
      const mutation = useAddClusterMember();
      return () => mutation.mutate({ clusterId: sourceId, vocId: sourceId });
    },
    body: { voc_id: sourceId },
    response: { voc_id: sourceId, added_by: sourceId, added_at: task.created_at },
  },
  {
    name: 'Cluster remove member',
    useRepair: () => {
      const mutation = useRemoveClusterMember();
      return () => mutation.mutate({ clusterId: sourceId, vocId: sourceId });
    },
    body: null,
    response: null,
  },
];
it.each(repairs)(
  '$name invalidates inactive recovery and summary caches after unmount',
  async ({ useRepair, body, response }) => {
    let settle!: (response: Response) => void;
    const fetch = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient();
    const keys = [
      ['recovery', 'list', 'visible'],
      ['recovery', 'list', 'hidden'],
      ['recovery', 'detail', 'selected'],
      ['recovery', 'history'],
      ['dashboard-summary'],
      ['dashboard-summary', 'scope'],
    ];
    for (const key of keys) client.setQueryData(key, { value: 'before' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(useRepair, { wrapper });
    act(() => result.current());
    await waitFor(() => expect(settle).toBeTypeOf('function'));
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    unmount();
    await act(async () =>
      settle(
        body === null
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(response)),
      ),
    );
    await waitFor(() =>
      expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
        true,
        true,
        true,
        true,
        true,
        true,
      ]),
    );
    expect(
      fetch.mock.calls[0]?.[1]?.body ? JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) : null,
    ).toEqual(body);
  },
);

it('a superseded successful Task status transition still invalidates recovery', async () => {
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
  );
  const client = new QueryClient();
  const keys = [
    ['recovery', 'list'],
    ['dashboard-summary', 'scope'],
  ];
  for (const key of keys) client.setQueryData(key, { value: 'before' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useTaskStatusTransition(['tasks']), { wrapper });
  act(() => result.current.mutate({ task, status: 'doing' }));
  await waitFor(() => expect(pending).toHaveLength(1));
  act(() => result.current.mutate({ task, status: 'released' }));
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () =>
    pending[0]?.(new Response(JSON.stringify({ ...task, status: 'doing', source: null }))),
  );
  await waitFor(() =>
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true]),
  );
  for (const key of keys) client.setQueryData(key, { value: 'between' });
  await act(async () =>
    pending[1]?.(new Response(JSON.stringify({ ...task, status: 'released', source: null }))),
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true]);
});
