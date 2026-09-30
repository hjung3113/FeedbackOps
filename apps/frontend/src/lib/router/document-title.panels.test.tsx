import { FindingDetailPanel } from '@/features/findings/components/FindingDetail/FindingDetailPanel';
import { MilestoneDetailPanel } from '@/features/tasks/components/MilestoneDetailPanel';
import { TaskDetailPanel } from '@/features/tasks/components/TaskDetailPanel';
import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import { VocClusterDetailPanel } from '@/features/voc-cluster/components/detail/VocClusterDetailPanel';
import { VocDetailPanel } from '@/features/voc/components/detail/VocDetailPanel';
import { fetchTaskRequests } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import { DOCUMENT_TITLE_COPY } from '@/lib/copy/document-titles';
import { DocumentTitleProvider } from '@/lib/router/document-title';
import type { TaskDetailDto, TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readResults = vi.hoisted(() => ({
  findings: {} as Record<string, unknown>,
  vocs: {} as Record<string, unknown>,
  clusters: {} as Record<string, unknown>,
  tasks: {} as Record<string, unknown>,
  milestones: {} as Record<string, unknown>,
  resolveRead: async (reads: Record<string, unknown>, id: string): Promise<unknown> => {
    const result = reads[id];
    if (result instanceof Error) throw result;
    return result;
  },
}));

vi.mock('@/features/findings/components/FindingDetail/FullFindingDetail', () => ({
  FullFindingDetail: ({ finding }: { finding: { display_id: string; title: string } }) => (
    <div data-testid="finding-record">
      {finding.display_id} {finding.title}
    </div>
  ),
}));

vi.mock('@/features/voc/components/detail/FullDetailView', () => ({
  FullDetailView: ({ voc }: { voc: { display_id: string; title: string } }) => (
    <div data-testid="voc-record">
      {voc.display_id} {voc.title}
    </div>
  ),
}));

vi.mock('@/features/voc/components/detail/SummaryPermissionView', () => ({
  SummaryPermissionView: () => <div>Summary only</div>,
}));

vi.mock('@/features/voc-cluster/hooks/useConfirmCluster', () => ({
  useConfirmCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/voc-cluster/hooks/useRemoveClusterMember', () => ({
  useRemoveClusterMember: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/voc-cluster/hooks/useRequestTaskFromCluster', () => ({
  useRequestTaskFromCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/cross-system/useManagedSystem', () => ({
  useManagedSystem: () => null,
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: 'actor-1', role_level: 'admin' } } }),
}));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: () => ({ data: { state: 'approved' } }),
}));

vi.mock('@/features/cross-system/progress-notes/ProgressNotesSection', () => ({
  ProgressNotesSection: () => null,
}));

vi.mock('@/features/tasks/components/milestone-detail/MilestoneDetailContent', () => ({
  MilestoneDetailContent: ({ milestone }: { milestone: { display_id: string; title: string } }) => (
    <div data-testid="milestone-record">
      {milestone.display_id} {milestone.title}
    </div>
  ),
}));

vi.mock('@/features/tasks/routes/task-requests/TaskRequestPanel', () => ({
  TaskRequestPanel: ({ item }: { item: TaskRequestDto }) => (
    <div data-testid="task-request-record">
      {item.display_id} {item.requested_outcome}
    </div>
  ),
}));

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    ListShell: ({
      list,
      detailPanel,
    }: { list: React.ReactNode; detailPanel?: React.ReactNode }) => (
      <div data-shell="list">
        <main>{list}</main>
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});

vi.mock('@/lib/api/managed-systems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/managed-systems')>();
  return {
    ...actual,
    fetchManagedSystems: vi.fn(async () => ({ items: [] })),
  };
});

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    apiRequest: vi.fn(async (_method: string, path: string) => {
      if (path.split('?')[0] === '/findings') return { data: { items: [] } };
      const [collection, id] = path.split('/').slice(1);
      const reads =
        collection === 'findings'
          ? readResults.findings
          : collection === 'voc-clusters'
            ? readResults.clusters
            : {};
      return { data: await readResults.resolveRead(reads, id ?? '') };
    }),
    apiClient: vi.fn(async (_method: string, path: string) => {
      if (path.endsWith('/candidate-peers'))
        return { data: { candidate_basis: 'same_managed_system_active_voc', candidates: [] } };
      const id = path.split('/').at(-1) ?? '';
      return { data: await readResults.resolveRead(readResults.vocs, id) };
    }),
    getTask: vi.fn(async (id: string) => {
      return readResults.resolveRead(readResults.tasks, id);
    }),
    fetchTaskRequests: vi.fn(async () => ({ items: [] })),
    resolveActors: vi.fn(async () => ({ actors: [], teams: [] })),
  };
});

vi.mock('@/lib/api/milestones', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/milestones')>();
  return {
    ...actual,
    getMilestone: vi.fn(async (id: string) => readResults.resolveRead(readResults.milestones, id)),
  };
});

const IDS = {
  allowed: '10000000-0000-4000-8000-000000000001',
  blocked: '10000000-0000-4000-8000-000000000002',
  taskRequestA: '20000000-0000-4000-8000-000000000001',
  taskRequestB: '20000000-0000-4000-8000-000000000002',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderAtRoute(
  path: '/vocs' | '/findings' | '/tasks' | '/voc-clusters',
  Page: () => React.ReactNode,
  initialUrl: string = path,
) {
  const root = createRootRoute({
    component: () => (
      <DocumentTitleProvider>
        <Outlet />
      </DocumentTitleProvider>
    ),
  });
  const pageRoute = createRoute({
    getParentRoute: () => root,
    path,
    component: Page,
  });
  const router = createRouter({
    routeTree: root.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

function FindingSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select blocked Finding
      </button>
      <FindingDetailPanel findingId={id} />
    </>
  );
}

function VocSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select blocked VOC
      </button>
      <VocDetailPanel vocId={id} onClose={() => undefined} />
    </>
  );
}

function ClusterSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select missing Cluster
      </button>
      <VocClusterDetailPanel clusterId={id} />
    </>
  );
}

function TaskSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select blocked Task
      </button>
      <TaskDetailPanel
        taskId={id}
        onClose={() => undefined}
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
      />
    </>
  );
}

function MilestoneSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select missing Milestone
      </button>
      <MilestoneDetailPanel
        milestoneId={id}
        onClose={() => undefined}
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
        analyticsAreaNamesById={new Map()}
      />
    </>
  );
}

const taskRequest = (id: string, displayId: string, requestedOutcome: string): TaskRequestDto => ({
  id,
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: displayId,
  source_type: 'finding',
  source_id: '50000000-0000-4000-8000-000000000005',
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  evidence_summary: 'summary',
  requested_outcome: requestedOutcome,
  requester_actor_id: '40000000-0000-4000-8000-000000000004',
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: {
    id: '50000000-0000-4000-8000-000000000005',
    type: 'finding',
    relation_type: 'requested_task',
    link_id: '60000000-0000-4000-8000-000000000006',
  },
});

function TaskRequestSelection() {
  const [selectedParam, setSelectedParam] = React.useState(IDS.taskRequestA);
  return (
    <>
      <button type="button" onClick={() => setSelectedParam('missing-request-id')}>
        Select missing Task Request
      </button>
      <TaskRequestsRoute selectedParam={selectedParam} />
    </>
  );
}

const taskDetail = (id: string, displayId: string, title: string): TaskDetailDto => ({
  id,
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: displayId,
  title,
  status: 'backlog',
  priority: 'medium',
  assignee_actor_id: null,
  due_date: null,
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '40000000-0000-4000-8000-000000000004',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
});

const milestone = (id: string, displayId: string, title: string) => ({
  id,
  display_id: displayId,
  title,
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  source_finding: null,
});

beforeEach(() => {
  readResults.findings = {
    [IDS.allowed]: { id: IDS.allowed, display_id: 'FIN-1', title: 'Finding title' },
    [IDS.blocked]: new ApiError(403, { code: 'permission.denied', message: 'Finding is blocked' }),
  };
  readResults.vocs = {
    [IDS.allowed]: {
      id: IDS.allowed,
      display_id: 'VOC-1',
      title: 'VOC title',
      primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
      reporter_id: 'actor-1',
      triage_state: 'untriaged',
    },
    [IDS.blocked]: new ApiError(403, { code: 'permission.denied', message: 'VOC is blocked' }),
  };
  readResults.clusters = {
    [IDS.allowed]: {
      id: IDS.allowed,
      display_id: 'CLU-1',
      title: 'Cluster title',
      primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
      status: 'open',
      members: [],
      linked_findings: [],
    },
    [IDS.blocked]: new ApiError(404, { code: 'not_found.record', message: 'Cluster missing' }),
  };
  readResults.tasks = {
    [IDS.allowed]: taskDetail(IDS.allowed, 'TASK-1', 'Task title'),
    [IDS.blocked]: new ApiError(403, {
      code: 'permission.denied',
      message: 'Task is not readable',
    }),
  };
  readResults.milestones = {
    [IDS.allowed]: milestone(IDS.allowed, 'MLS-1', 'Milestone title'),
    [IDS.blocked]: new ApiError(404, {
      code: 'not_found.record',
      message: 'Milestone missing',
    }),
  };
  vi.mocked(fetchTaskRequests).mockResolvedValue({
    items: [
      taskRequest(IDS.taskRequestA, 'REQ-1', 'Request A outcome'),
      taskRequest(IDS.taskRequestB, 'REQ-2', 'Request B outcome'),
    ],
  });
});

describe('document titles from production detail panels', () => {
  it('uses the permitted Finding title, then the Findings screen title for a 403', async () => {
    renderAtRoute('/findings', FindingSelection);
    await waitFor(() => expect(document.title).toBe('FIN-1 · Finding title · FeedbackOps'));

    const blockedRead = deferred<unknown>();
    readResults.findings[IDS.blocked] = blockedRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select blocked Finding' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.findings} · FeedbackOps`),
    );
    expect(screen.getByLabelText('Finding 상세 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByTestId('finding-record')).not.toBeInTheDocument();

    blockedRead.reject(
      new ApiError(403, { code: 'permission.denied', message: 'Finding is blocked' }),
    );
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Finding 상세' })).toBeInTheDocument(),
      {
        timeout: 4000,
      },
    );
    expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.findings} · FeedbackOps`);
    expect(screen.queryByTestId('finding-record')).not.toBeInTheDocument();
  });

  it('uses the permitted VOC title, then the Inbox screen title for a 403', async () => {
    renderAtRoute('/vocs', VocSelection, '/vocs?view=inbox');
    await waitFor(() => expect(document.title).toBe('VOC-1 · VOC title · FeedbackOps'));

    const blockedRead = deferred<unknown>();
    readResults.vocs[IDS.blocked] = blockedRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select blocked VOC' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.voc.inbox} · FeedbackOps`),
    );
    expect(screen.getByLabelText('VOC 상세 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByTestId('voc-record')).not.toBeInTheDocument();

    blockedRead.reject(new ApiError(403, { code: 'permission.denied', message: 'VOC is blocked' }));
    await waitFor(
      () => expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.voc.inbox} · FeedbackOps`);
    expect(screen.queryByTestId('voc-record')).not.toBeInTheDocument();
  });

  it('uses the permitted Cluster title, then the Clusters screen title for a 404', async () => {
    renderAtRoute('/voc-clusters', ClusterSelection);
    await waitFor(() => expect(document.title).toBe('CLU-1 · Cluster title · FeedbackOps'));

    const missingRead = deferred<unknown>();
    readResults.clusters[IDS.blocked] = missingRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select missing Cluster' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.vocClusters} · FeedbackOps`),
    );
    expect(screen.getByTestId('cluster-detail-skeleton')).toBeInTheDocument();

    missingRead.reject(new ApiError(404, { code: 'not_found.record', message: 'Cluster missing' }));
    await waitFor(
      () =>
        expect(screen.getByTestId('cluster-detail-error')).toHaveTextContent('찾을 수 없습니다'),
      { timeout: 4000 },
    );
    expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.vocClusters} · FeedbackOps`);
    expect(screen.queryByText('Cluster title')).not.toBeInTheDocument();
  });

  it('uses the permitted Task title, then the backlog screen title for a 403', async () => {
    renderAtRoute('/tasks', TaskSelection, '/tasks?view=backlog');
    await waitFor(() => expect(document.title).toBe('TASK-1 · Task title · FeedbackOps'));

    const blockedRead = deferred<unknown>();
    readResults.tasks[IDS.blocked] = blockedRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select blocked Task' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.tasks.backlog} · FeedbackOps`),
    );
    expect(screen.getByText('Loading Task...')).toBeInTheDocument();

    blockedRead.reject(
      new ApiError(403, { code: 'permission.denied', message: 'Task is not readable' }),
    );
    await waitFor(() => expect(screen.getByText('Task detail')).toBeInTheDocument());
    expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.tasks.backlog} · FeedbackOps`);
    expect(screen.queryByText('Task title')).not.toBeInTheDocument();
  });

  it('uses the permitted Milestone title, then the Milestones screen title for a 404', async () => {
    renderAtRoute('/tasks', MilestoneSelection, '/tasks?view=milestones');
    await waitFor(() => expect(document.title).toBe('MLS-1 · Milestone title · FeedbackOps'));

    const missingRead = deferred<unknown>();
    readResults.milestones[IDS.blocked] = missingRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select missing Milestone' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.tasks.milestones} · FeedbackOps`),
    );
    expect(screen.getByText('Loading Milestone…')).toBeInTheDocument();

    missingRead.reject(
      new ApiError(404, { code: 'not_found.record', message: 'Milestone missing' }),
    );
    await waitFor(() =>
      expect(screen.getByText('Milestone detail unavailable.')).toBeInTheDocument(),
    );
    expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.tasks.milestones} · FeedbackOps`);
    expect(screen.queryByTestId('milestone-record')).not.toBeInTheDocument();
  });

  it('clears the title after a settled failed refetch while React Query retains the old Finding', async () => {
    const { queryClient } = renderAtRoute('/findings', FindingSelection);
    await waitFor(() => expect(document.title).toBe('FIN-1 · Finding title · FeedbackOps'));

    const failedRefetch = deferred<unknown>();
    readResults.findings[IDS.allowed] = failedRefetch.promise;
    const refetch = queryClient.refetchQueries({ queryKey: ['finding', IDS.allowed] });
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.findings} · FeedbackOps`),
    );
    await waitFor(() =>
      expect(queryClient.getQueryState(['finding', IDS.allowed])?.fetchStatus).toBe('fetching'),
    );

    failedRefetch.reject(
      new ApiError(403, { code: 'permission.denied', message: 'Finding access expired' }),
    );
    await refetch;
    await waitFor(() =>
      expect(queryClient.getQueryState(['finding', IDS.allowed])?.status).toBe('error'),
    );
    expect(queryClient.getQueryData(['finding', IDS.allowed])).toMatchObject({ id: IDS.allowed });
    expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.findings} · FeedbackOps`);
    expect(screen.queryByTestId('finding-record')).not.toBeInTheDocument();
  });

  it('uses the selected Task Request title after a row click and clears it for a missing URL target', async () => {
    renderAtRoute('/tasks', TaskRequestSelection, '/tasks?view=requests');
    await waitFor(() => expect(document.title).toBe('REQ-1 · Request A outcome · FeedbackOps'));

    fireEvent.click(screen.getByRole('button', { name: /REQ-2/ }));
    await waitFor(() => expect(document.title).toBe('REQ-2 · Request B outcome · FeedbackOps'));

    fireEvent.click(screen.getByRole('button', { name: 'Select missing Task Request' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.tasks.requests} · FeedbackOps`),
    );
    expect(document.title).not.toContain('Request B outcome');
  });
});
