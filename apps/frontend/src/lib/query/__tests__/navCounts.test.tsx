import { QueryClient, QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => vi.fn());
const triageMutationMock = vi.hoisted(() => vi.fn());
const taskRequestMutationMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient: apiClientMock,
  approveTaskRequest: taskRequestMutationMock,
  convertTaskRequest: taskRequestMutationMock,
  linkExistingTask: taskRequestMutationMock,
  rejectTaskRequest: taskRequestMutationMock,
  requestMoreEvidenceForTaskRequest: taskRequestMutationMock,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: apiClientMock,
}));

vi.mock('@/features/voc/lib/triage-transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/voc/lib/triage-transport')>()),
  patchVocTriage: triageMutationMock,
}));

import { useCreateFindingFromVocMutation } from '@/features/cross-system/create-finding/useCreateFindingFromVocMutation';
import { useFindingStatusMutation } from '@/features/findings/hooks/useFindingStatusMutation';
import { useRequestTaskFromFinding } from '@/features/findings/hooks/useRequestTaskFromFinding';
import { useCreateFindingFromSurveyResponse } from '@/features/surveys/hooks/useCreateFindingFromSurveyResponse';
import { useCreateSurvey } from '@/features/surveys/hooks/useSurveys';
import { useTaskRequestConversion } from '@/features/tasks/routes/task-requests/useTaskRequestConversion';
import { useTaskRequestDecision } from '@/features/tasks/routes/task-requests/useTaskRequestDecision';
import { useTaskRequestLink } from '@/features/tasks/routes/task-requests/useTaskRequestLink';
import { useAddClusterMember } from '@/features/voc-cluster/hooks/useAddClusterMember';
import { useConfirmCluster } from '@/features/voc-cluster/hooks/useConfirmCluster';
import { useCreateFindingFromCluster } from '@/features/voc-cluster/hooks/useCreateFindingFromCluster';
import { useCreateVocCluster } from '@/features/voc-cluster/hooks/useCreateVocCluster';
import { useLinkExistingFindingToVocCluster } from '@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster';
import { useRemoveClusterMember } from '@/features/voc-cluster/hooks/useRemoveClusterMember';
import { useRequestTaskFromCluster } from '@/features/voc-cluster/hooks/useRequestTaskFromCluster';
import { useConfirmVocRecommendation } from '@/features/voc/hooks/useConfirmVocRecommendation';
import { useRequestTaskFromVoc } from '@/features/voc/hooks/useRequestTaskFromVoc';
import { useTriageCommand } from '@/features/voc/hooks/useTriageCommand';
import { useVocCreateMutation } from '@/features/voc/hooks/useVocCreateMutation';
import { useVocPublicUpdateMutation } from '@/features/voc/hooks/useVocPublicUpdateMutation';
import { NAV_COUNTS_QUERY_KEY, invalidateNavCounts } from '../navCounts';

type MutationHandle = {
  mutateAsync: (variables: unknown) => Promise<unknown>;
};

type MutationCase = {
  name: string;
  render: () => MutationHandle;
  variables: unknown;
};

function mutationCase<TData, TError, TVariables>(
  name: string,
  hook: () => UseMutationResult<TData, TError, TVariables>,
  variables: TVariables,
): MutationCase {
  return {
    name,
    render: hook as unknown as () => MutationHandle,
    variables,
  };
}

const mutationCases: MutationCase[] = [
  mutationCase('VOC create', () => useVocCreateMutation({ idempotencyKey: 'key' }), {} as never),
  mutationCase('VOC public update and status change', useVocPublicUpdateMutation, {} as never),
  mutationCase(
    'Request Task from VOC',
    () => useRequestTaskFromVoc({ vocId: 'voc-1', idempotencyKey: 'key' }),
    {} as never,
  ),
  mutationCase(
    'Create Finding from VOC',
    () => useCreateFindingFromVocMutation({ idempotencyKey: 'key' }),
    {} as never,
  ),
  mutationCase('Create VOC Cluster', useCreateVocCluster, {} as never),
  mutationCase('Confirm VOC Cluster', useConfirmCluster, 'cluster-1'),
  mutationCase('Add VOC Cluster member', useAddClusterMember, {
    clusterId: 'cluster-1',
    vocId: 'voc-1',
  }),
  mutationCase('Remove VOC Cluster member', useRemoveClusterMember, {
    clusterId: 'cluster-1',
    vocId: 'voc-1',
  }),
  mutationCase('Link Finding to VOC Cluster', useLinkExistingFindingToVocCluster, {
    clusterId: 'cluster-1',
    findingId: 'finding-1',
  }),
  mutationCase('Create Finding from VOC Cluster', useCreateFindingFromCluster, {
    clusterId: 'cluster-1',
    body: {} as never,
  }),
  mutationCase(
    'Request Task from VOC Cluster',
    () => useRequestTaskFromCluster({ clusterId: 'cluster-1', idempotencyKey: 'key' }),
    {} as never,
  ),
  mutationCase(
    'Create Finding from Survey Response',
    () => useCreateFindingFromSurveyResponse('survey-1'),
    { responseId: 'response-1', body: {} as never },
  ),
  mutationCase(
    'Finding status change',
    () => useFindingStatusMutation({ findingId: 'finding-1', idempotencyKey: 'key' }),
    {} as never,
  ),
  mutationCase(
    'Request Task from Finding',
    () => useRequestTaskFromFinding({ findingId: 'finding-1', idempotencyKey: 'key' }),
    {} as never,
  ),
  mutationCase('Survey create', useCreateSurvey, {} as never),
  mutationCase(
    'Confirm VOC Cluster recommendation',
    () => useConfirmVocRecommendation('voc-1'),
    'candidate-1',
  ),
];

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  queryClient.setQueryData([...NAV_COUNTS_QUERY_KEY, 'managed-system-1'], { counts: {} });
  return queryClient;
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function isScopedNavCountInvalidated(queryClient: QueryClient, managedSystemId: string) {
  return queryClient.getQueryState([...NAV_COUNTS_QUERY_KEY, managedSystemId])?.isInvalidated;
}

describe('nav count mutation invalidation', () => {
  beforeEach(() => {
    apiClientMock.mockReset().mockResolvedValue({
      data: { id: 'record-1', display_id: 'VOC-1000', voc_cluster_id: 'cluster-1' },
    });
    triageMutationMock.mockReset().mockResolvedValue({
      id: 'record-1',
      display_id: 'VOC-1000',
      voc_cluster_id: 'cluster-1',
    });
    taskRequestMutationMock.mockReset().mockResolvedValue({
      id: 'task-1',
      display_id: 'TASK-1000',
    });
  });

  it.each(mutationCases)('$name invalidates scoped nav counts after success', async (testCase) => {
    const queryClient = createQueryClient();
    const { result } = renderHook(testCase.render, { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync(testCase.variables);
    });

    expect(isScopedNavCountInvalidated(queryClient, 'managed-system-1')).toBe(true);
  });

  it.each(mutationCases)('$name leaves scoped nav counts valid after failure', async (testCase) => {
    apiClientMock.mockRejectedValue(new Error('mutation failed'));
    triageMutationMock.mockRejectedValue(new Error('mutation failed'));
    const queryClient = createQueryClient();
    const { result } = renderHook(testCase.render, { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await expect(result.current.mutateAsync(testCase.variables)).rejects.toThrow(
        'mutation failed',
      );
    });

    expect(isScopedNavCountInvalidated(queryClient, 'managed-system-1')).toBe(false);
  });

  const mutationOutcomes = [
    { outcome: 'success', fails: false },
    { outcome: 'failure', fails: true },
  ];

  it.each(mutationOutcomes)(
    'active VOC triage command refreshes counts on $outcome',
    async ({ fails }) => {
      let resolvePatch: (value: unknown) => void = () => undefined;
      let rejectPatch: (reason?: unknown) => void = () => undefined;
      const patchPromise = new Promise<unknown>((resolve, reject) => {
        resolvePatch = resolve;
        rejectPatch = reject;
      });
      triageMutationMock.mockReturnValue(patchPromise);
      const queryClient = createQueryClient();
      const { result } = renderHook(
        () =>
          useTriageCommand({
            voc: {
              id: 'voc-1',
              severity: 'high',
              owner_user_id: null,
              owner_team_id: null,
              analytics_area_id: null,
            } as never,
          }),
        { wrapper: createWrapper(queryClient) },
      );

      act(() => {
        result.current.commit({ kind: 'skip', vocId: 'voc-1', ifMatch: 'version-1' });
      });
      await waitFor(() => expect(result.current.isSubmitting).toBe(true));
      await act(async () => {
        if (fails) rejectPatch(new Error('triage failed'));
        else resolvePatch({ id: 'voc-1', triage_state: 'triaged', updated_at: 'version-2' });
        await patchPromise.catch(() => undefined);
      });
      await waitFor(() => expect(result.current.isSubmitting).toBe(false));

      expect(isScopedNavCountInvalidated(queryClient, 'managed-system-1')).toBe(!fails);
    },
  );

  it.each(mutationOutcomes)(
    'Task Request decision refreshes counts on $outcome',
    async ({ fails }) => {
      if (fails) taskRequestMutationMock.mockRejectedValue(new Error('decision failed'));
      const item = {
        id: 'request-1',
        status: 'pending_review',
        requester_actor_id: 'requester-1',
        primary_managed_system_id: 'managed-system-1',
      } as never;
      const queryClient = createQueryClient();
      const { result } = renderHook(
        () =>
          useTaskRequestDecision({
            item,
            currentActorId: 'reviewer-1',
            currentRole: 'admin',
          }),
        { wrapper: createWrapper(queryClient) },
      );

      act(() => result.current.approve());
      await act(async () => {
        result.current.submitDecision({
          preventDefault: () => undefined,
        } as unknown as FormEvent<HTMLFormElement>);
      });
      await waitFor(() => {
        if (fails) expect(result.current.error).not.toBeNull();
        else expect(result.current.result).not.toBeNull();
      });

      expect(isScopedNavCountInvalidated(queryClient, 'managed-system-1')).toBe(!fails);
    },
  );

  it.each(mutationOutcomes)(
    'Task Request conversion refreshes counts on $outcome',
    async ({ fails }) => {
      if (fails) taskRequestMutationMock.mockRejectedValue(new Error('conversion failed'));
      const queryClient = createQueryClient();
      const { result } = renderHook(
        () =>
          useTaskRequestConversion({
            item: {
              id: 'request-1',
              status: 'approved',
              requested_outcome: 'Finish the requested work',
              primary_managed_system_id: 'managed-system-1',
            } as never,
            currentRole: 'admin',
          }),
        { wrapper: createWrapper(queryClient) },
      );

      act(() => {
        result.current.submit({
          preventDefault: () => undefined,
        } as unknown as FormEvent<HTMLFormElement>);
      });
      await waitFor(() => {
        if (fails) expect(result.current.error).not.toBeNull();
        else expect(result.current.result).not.toBeNull();
      });

      expect(isScopedNavCountInvalidated(queryClient, 'managed-system-1')).toBe(!fails);
    },
  );

  it.each(mutationOutcomes)('Task Request link refreshes counts on $outcome', async ({ fails }) => {
    if (fails) taskRequestMutationMock.mockRejectedValue(new Error('link failed'));
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () =>
        useTaskRequestLink({
          item: {
            id: 'request-1',
            status: 'approved',
            requester_actor_id: 'requester-1',
            primary_managed_system_id: 'managed-system-1',
          } as never,
          currentRole: 'admin',
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.link('task-1'));
    await waitFor(() => {
      if (fails) expect(result.current.error).not.toBeNull();
      else expect(result.current.result).not.toBeNull();
    });

    expect(isScopedNavCountInvalidated(queryClient, 'managed-system-1')).toBe(!fails);
  });

  it('invalidates every managed-system scope under the shared key root', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData([...NAV_COUNTS_QUERY_KEY, 'managed-system-2'], { counts: {} });

    invalidateNavCounts(queryClient);

    expect(isScopedNavCountInvalidated(queryClient, 'managed-system-1')).toBe(true);
    expect(isScopedNavCountInvalidated(queryClient, 'managed-system-2')).toBe(true);
  });
});
