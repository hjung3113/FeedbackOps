import {
  type MilestoneDetailDto,
  type MilestoneDto,
  type TaskDetailDto,
  assignTaskMilestoneRequestSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailPanel } from './TaskDetailPanel';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
const meImpl = vi.hoisted(() => ({
  value: {
    actor: { id: 'admin', role_level: 'admin' },
  } as { actor: { id: string; role_level: string } },
}));
const permissionImpl = vi.hoisted(() => ({ value: { state: 'denied' } as { state: string } }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: meImpl.value }) }));
vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: () => ({ data: permissionImpl.value }),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [
      {
        id: SYSTEM_ID,
        name: 'Tableau',
        default_owner_team_id: TEAM_ID,
        default_reviewer_team_id: null,
      },
    ],
    total: 1,
  })),
}));
vi.mock('@/lib/api/actors', () => ({
  resolveActors: vi.fn(async () => ({ actors: [], teams: [{ id: TEAM_ID, name: '운영팀' }] })),
}));

const TASK_A_ID = '10000000-0000-4000-8000-000000000001';
const TASK_B_ID = '10000000-0000-4000-8000-000000000002';
const SYSTEM_ID = '30000000-0000-4000-8000-000000000003';
const TEAM_ID = '20000000-0000-4000-8000-000000000002';
const WORKSPACE_ID = '90000000-0000-4000-8000-000000000009';
const OWNER_ID = '40000000-0000-4000-8000-000000000004';
const AM_ID = '50000000-0000-4000-8000-000000000001';
const MS2_ID = '50000000-0000-4000-8000-000000000002';
const BM_ID = '50000000-0000-4000-8000-000000000003';
const UPDATED_AT = '2026-10-13T00:00:00.000Z';
const UPDATED_AT_NEXT = '2026-10-13T01:00:00.000Z';
const MS2_OPTION = /MS-2 릴리스/;

function taskDetail(
  overrides: Partial<TaskDetailDto> & Pick<TaskDetailDto, 'id' | 'title' | 'milestone_id'>,
): TaskDetailDto {
  return {
    workspace_id: WORKSPACE_ID,
    display_id: 'TASK-1000',
    primary_managed_system_id: SYSTEM_ID,
    status: 'backlog',
    priority: 'medium',
    assignee_actor_id: null,
    assignee_team_id: null,
    due_date: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: OWNER_ID,
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: UPDATED_AT,
    source: null,
    ...overrides,
  };
}

function milestoneRow(
  overrides: Partial<MilestoneDto> & Pick<MilestoneDto, 'id' | 'display_id' | 'title' | 'status'>,
): MilestoneDto {
  return {
    workspace_id: WORKSPACE_ID,
    primary_managed_system_id: SYSTEM_ID,
    why: '이유',
    owner_actor_id: OWNER_ID,
    analytics_area_id: null,
    start_date: '2026-10-01',
    target_date: '2026-11-30',
    created_by: OWNER_ID,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    progress: { released_done: 1, in_flight: 2, queued: 3, total: 6, percent: 17 },
    ...overrides,
  };
}

const AM = milestoneRow({
  id: AM_ID,
  display_id: 'MS-A01',
  title: 'A 마일스톤',
  status: 'in_progress',
});
const MS2 = milestoneRow({ id: MS2_ID, display_id: 'MS-2', title: '릴리스', status: 'released' });
const BM = milestoneRow({
  id: BM_ID,
  display_id: 'MS-B01',
  title: 'B 마일스톤',
  status: 'planning',
});
const milestoneDetail = (row: MilestoneDto): MilestoneDetailDto => ({
  ...row,
  source_finding: null,
});

const taskA = taskDetail({ id: TASK_A_ID, title: 'A 작업', milestone_id: AM_ID });
const taskB = taskDetail({ id: TASK_B_ID, title: 'B 작업', milestone_id: BM_ID });
// POST /tasks/:id/milestone returns the strict TaskDto — no source field.
const { source: _source, ...taskADto } = taskA;

interface RouterRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePanelRouter() {
  const requests: RouterRequest[] = [];
  // Deferred reads: `held` queues responses made while a gate flag is on;
  // releaseGated() serves them FIFO with a response built at release time.
  const held: Array<{ make: () => Response; resolve: (response: Response) => void }> = [];
  const config = {
    taskResponses: {
      [TASK_A_ID]: taskA,
      [TASK_B_ID]: taskB,
    } as Record<string, TaskDetailDto>,
    gatePost: false,
    gateTaskGets: false,
    gateMilestoneDetailGets: false,
  };
  let releasePost: ((response: Response) => void) | null = null;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path, headers: Object.fromEntries(new Headers(init?.headers)), body });
    if (method === 'POST' && /\/tasks\/[^/]+\/milestone$/.test(path)) {
      const parsed = assignTaskMilestoneRequestSchema.parse(body);
      const response = jsonResponse({
        ...taskADto,
        milestone_id: parsed.milestone_id,
        updated_at: UPDATED_AT_NEXT,
      });
      if (!config.gatePost) return response;
      return new Promise<Response>((resolve) => {
        releasePost = resolve;
      });
    }
    if (method === 'GET' && /^\/tasks\/[^/]+\/comments/.test(path)) {
      return jsonResponse({ items: [], page: { has_more: false } });
    }
    if (method === 'GET' && /^\/tasks\/[^/]+$/.test(path)) {
      const taskId = path.split('/')[2];
      const make = () => jsonResponse(config.taskResponses[taskId ?? ''] ?? taskA);
      if (config.gateTaskGets) {
        return new Promise<Response>((resolve) => {
          held.push({ make, resolve });
        });
      }
      return make();
    }
    if (method === 'GET' && path === `/milestones?managed_system_id=${SYSTEM_ID}`) {
      return jsonResponse({ items: [AM, MS2, BM] });
    }
    const detailMatch = path.match(/^\/milestones\/([0-9a-f-]+)$/);
    if (method === 'GET' && detailMatch) {
      const found = [AM, MS2, BM].find((row) => row.id === detailMatch[1]);
      if (found) {
        const make = () => jsonResponse(milestoneDetail(found));
        if (config.gateMilestoneDetailGets) {
          return new Promise<Response>((resolve) => {
            held.push({ make, resolve });
          });
        }
        return make();
      }
    }
    return jsonResponse({ code: 'not_found.record', message: 'unrouted' }, 404);
  });
  return {
    requests,
    fetchMock,
    config,
    releasePost: (response?: Response) => releasePost?.(response ?? jsonResponse(taskB)),
    releaseGated: () => {
      const next = held.shift();
      if (next) next.resolve(next.make());
    },
  };
}

const originalFetch = globalThis.fetch;
let router = makePanelRouter();

beforeEach(() => {
  router = makePanelRouter();
  globalThis.fetch = router.fetchMock as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function panelTree(client: QueryClient, taskId: string) {
  return (
    <QueryClientProvider client={client}>
      <TaskDetailPanel
        taskId={taskId}
        onClose={() => {}}
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
      />
    </QueryClientProvider>
  );
}

function renderPanel(client: QueryClient, taskId: string): RenderResult {
  return render(panelTree(client, taskId));
}

function switchTask(view: RenderResult, client: QueryClient, taskId: string) {
  view.rerender(panelTree(client, taskId));
}

async function pickMilestoneAndSave() {
  fireEvent.click(await screen.findByRole('button', { name: 'Milestone 수정' }));
  fireEvent.click(await screen.findByRole('combobox', { name: 'Milestone 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: MS2_OPTION }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await act(async () => {
    await Promise.resolve();
  });
}

interface StoredMilestonePost {
  ifMatch: string;
  body: unknown;
  response: Response;
}

interface IdempotentRouter {
  requests: RouterRequest[];
  fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  config: {
    taskResponses: Record<string, TaskDetailDto>;
    postMode: 'commit' | 'lost' | 'stale';
  };
}

// Server-rule mirror (routes.ts request hash, idempotency-service lookup): a
// stored key replayed with a different If-Match or body is
// conflict.idempotency_key_reuse; the same key + If-Match + body replays the
// stored 200; a stale_write rejection is thrown before the record, so it
// stores nothing. postMode 'lost' commits but answers 502.
function makeIdempotentRouter(): IdempotentRouter {
  const requests: RouterRequest[] = [];
  const stored = new Map<string, StoredMilestonePost>();
  const config = {
    taskResponses: {
      [TASK_A_ID]: taskA,
    } as Record<string, TaskDetailDto>,
    postMode: 'commit' as 'commit' | 'lost' | 'stale',
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(new Headers(init?.headers));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path, headers, body });
    if (method === 'POST' && /\/tasks\/[^/]+\/milestone$/.test(path)) {
      const key = headers['idempotency-key'] ?? '';
      const ifMatch = headers['if-match'] ?? '';
      const hit = stored.get(key);
      if (hit) {
        if (hit.ifMatch !== ifMatch || JSON.stringify(hit.body) !== JSON.stringify(body)) {
          return jsonResponse(
            {
              code: 'conflict.idempotency_key_reuse',
              message: 'Idempotency-Key reused with a different request body',
            },
            409,
          );
        }
        return hit.response.clone();
      }
      const parsed = assignTaskMilestoneRequestSchema.parse(body);
      if (config.postMode === 'stale') {
        return jsonResponse(
          {
            code: 'conflict.stale_write',
            message: 'task updated_at does not match If-Match',
            detail: { current_updated_at: config.taskResponses[TASK_A_ID]?.updated_at },
          },
          409,
        );
      }
      const response = jsonResponse({
        ...taskADto,
        milestone_id: parsed.milestone_id,
        updated_at: UPDATED_AT_NEXT,
      });
      stored.set(key, { ifMatch, body, response });
      if (config.postMode === 'lost') {
        return jsonResponse({ code: 'upstream.unavailable', message: 'response lost' }, 502);
      }
      return response.clone();
    }
    if (method === 'GET' && /^\/tasks\/[^/]+\/comments/.test(path)) {
      return jsonResponse({ items: [], page: { has_more: false } });
    }
    if (method === 'GET' && /^\/tasks\/[^/]+$/.test(path)) {
      const taskId = path.split('/')[2];
      return jsonResponse(config.taskResponses[taskId ?? ''] ?? taskA);
    }
    if (method === 'GET' && path === `/milestones?managed_system_id=${SYSTEM_ID}`) {
      return jsonResponse({ items: [AM, MS2, BM] });
    }
    const detailMatch = path.match(/^\/milestones\/([0-9a-f-]+)$/);
    if (method === 'GET' && detailMatch) {
      const found = [AM, MS2, BM].find((row) => row.id === detailMatch[1]);
      if (found) return jsonResponse(milestoneDetail(found));
    }
    return jsonResponse({ code: 'not_found.record', message: 'unrouted' }, 404);
  });
  return { requests, fetchMock, config };
}

describe('Task detail Milestone row', () => {
  it('resets editing state on a Task switch, and a deferred save of Task A leaves Task B untouched while invalidating A Milestones', async () => {
    router.config.gatePost = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Cached fresh Tasks (30 s staleTime) — no Task GETs on render.
    client.setQueryData(['task', TASK_A_ID], taskA);
    client.setQueryData(['task', TASK_B_ID], taskB);
    const view = renderPanel(client, TASK_A_ID);
    expect(await screen.findByText('MS-A01 A 마일스톤')).toBeInTheDocument();

    await pickMilestoneAndSave();
    // Task switch while A's save is still in flight.
    switchTask(view, client, TASK_B_ID);
    expect(await screen.findByText('MS-B01 B 마일스톤')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Milestone 선택' })).not.toBeInTheDocument();

    router.releasePost(
      jsonResponse({ ...taskADto, milestone_id: MS2_ID, updated_at: UPDATED_AT_NEXT }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(client.getQueryState(['milestone', AM_ID])?.isInvalidated).toBe(true),
    );
    expect(client.getQueryState(['milestones', 'task-options', SYSTEM_ID])?.isInvalidated).toBe(
      true,
    );
    // B's own read-only value and focus are untouched by A's completion.
    expect(screen.getByText('MS-B01 B 마일스톤')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Milestone 선택' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('shows the new Milestone value and focus on the trigger after a real save and Task refetch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['task', TASK_A_ID], taskA);
    renderPanel(client, TASK_A_ID);
    expect(await screen.findByText('MS-A01 A 마일스톤')).toBeInTheDocument();
    // The commit changed the Task: the follow-up GET serves the new state.
    router.config.taskResponses[TASK_A_ID] = taskDetail({
      id: TASK_A_ID,
      title: 'A 작업',
      milestone_id: MS2_ID,
      updated_at: UPDATED_AT_NEXT,
    });
    await pickMilestoneAndSave();
    // The POST carries the exact body and the Task's concurrency token.
    const post = router.requests.find(
      (request) => request.method === 'POST' && /\/tasks\/[^/]+\/milestone$/.test(request.path),
    );
    expect(post?.body).toEqual({ milestone_id: MS2_ID });
    expect(post?.headers['if-match']).toBe(UPDATED_AT);
    // ['task'] invalidation refetches A; milestone_id flips to MS-2 and the row follows.
    await waitFor(() => expect(screen.getByText('MS-2 릴리스')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Milestone 수정' })).toHaveFocus();
    expect(screen.queryByText('MS-A01 A 마일스톤')).not.toBeInTheDocument();
  });

  it('shows the trigger for a Developer with the scoped finding.manage grant', async () => {
    meImpl.value = { actor: { id: 'dev', role_level: 'developer' } };
    permissionImpl.value = { state: 'approved' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['task', TASK_A_ID], taskA);
    renderPanel(client, TASK_A_ID);
    expect(await screen.findByRole('button', { name: 'Milestone 수정' })).toBeInTheDocument();
  });

  it('holds the submitted choice label in the row until the Task and new Milestone refetches settle', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['task', TASK_A_ID], taskA);
    renderPanel(client, TASK_A_ID);
    expect(await screen.findByText('MS-A01 A 마일스톤')).toBeInTheDocument();
    // The commit changed the Task; both follow-up reads are served only on release.
    router.config.taskResponses[TASK_A_ID] = taskDetail({
      id: TASK_A_ID,
      title: 'A 작업',
      milestone_id: MS2_ID,
      updated_at: UPDATED_AT_NEXT,
    });
    router.config.gateTaskGets = true;
    router.config.gateMilestoneDetailGets = true;
    await pickMilestoneAndSave();
    // Editor closed; the row keeps the submitted label — no old value, no —.
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Milestone 선택' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('MS-2 릴리스')).toBeInTheDocument();
    expect(screen.queryByText('MS-A01 A 마일스톤')).not.toBeInTheDocument();
    // Task settles to the saved state while the new Milestone detail is gated.
    router.releaseGated();
    await waitFor(() =>
      expect(
        router.requests.some(
          (request) => request.method === 'GET' && request.path === `/milestones/${MS2_ID}`,
        ),
      ).toBe(true),
    );
    expect(screen.getByText('MS-2 릴리스')).toBeInTheDocument();
    expect(screen.queryByText('MS-A01 A 마일스톤')).not.toBeInTheDocument();
    // Detail settles; the row serves the refetched truth.
    router.releaseGated();
    await waitFor(() => expect(screen.getByText('MS-2 릴리스')).toBeInTheDocument());
  });
});

describe('Task detail Milestone save retries', () => {
  let idemRouter: IdempotentRouter;

  beforeEach(() => {
    idemRouter = makeIdempotentRouter();
    globalThis.fetch = idemRouter.fetchMock as typeof fetch;
  });

  const postsToMilestone = () =>
    idemRouter.requests.filter(
      (request) => request.method === 'POST' && /\/tasks\/[^/]+\/milestone$/.test(request.path),
    );

  it('replays the committed save on retry after a lost response instead of resending the key with a new If-Match', async () => {
    idemRouter.config.postMode = 'lost';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['task', TASK_A_ID], taskA);
    renderPanel(client, TASK_A_ID);
    expect(await screen.findByText('MS-A01 A 마일스톤')).toBeInTheDocument();
    await pickMilestoneAndSave();
    // The POST committed but the response was lost.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // A background Task refetch observes the committed state (new updated_at).
    idemRouter.config.taskResponses[TASK_A_ID] = taskDetail({
      id: TASK_A_ID,
      title: 'A 작업',
      milestone_id: MS2_ID,
      updated_at: UPDATED_AT_NEXT,
    });
    await act(async () => {
      await client.refetchQueries({ queryKey: ['task', TASK_A_ID], exact: true });
    });
    // The panel caught up with the committed state: it reads the new
    // Milestone detail (the commit that fired this GET carries the moved
    // updated_at into the editor's If-Match source).
    await waitFor(() =>
      expect(
        idemRouter.requests.some(
          (request) => request.method === 'GET' && request.path === `/milestones/${MS2_ID}`,
        ),
      ).toBe(true),
    );
    await act(async () => {});
    // Retrying the unchanged choice replays the stored 200.
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Milestone 선택' })).not.toBeInTheDocument(),
    );
    const posts = postsToMilestone();
    expect(posts).toHaveLength(2);
    expect(posts[1]?.headers['idempotency-key']).toBe(posts[0]?.headers['idempotency-key']);
    expect(posts[1]?.headers['if-match']).toBe(UPDATED_AT);
    expect(posts[1]?.body).toEqual({ milestone_id: MS2_ID });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('starts a new attempt after a 409 stale write with a new key and the refreshed If-Match', async () => {
    idemRouter.config.postMode = 'stale';
    idemRouter.config.taskResponses[TASK_A_ID] = taskDetail({
      id: TASK_A_ID,
      title: 'A 작업',
      milestone_id: BM_ID,
      updated_at: UPDATED_AT_NEXT,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['task', TASK_A_ID], taskA);
    renderPanel(client, TASK_A_ID);
    expect(await screen.findByText('MS-A01 A 마일스톤')).toBeInTheDocument();
    await pickMilestoneAndSave();
    expect(await screen.findByRole('alert')).toHaveTextContent('다른 사용자가 먼저 변경했습니다.');
    // The refetched Task has settled once the current-value line shows up.
    expect(await screen.findByText('현재: MS-B01 B 마일스톤')).toBeInTheDocument();
    idemRouter.config.postMode = 'commit';
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Milestone 선택' })).not.toBeInTheDocument(),
    );
    const posts = postsToMilestone();
    expect(posts).toHaveLength(2);
    expect(posts[1]?.headers['idempotency-key']).not.toBe(posts[0]?.headers['idempotency-key']);
    expect(posts[1]?.headers['if-match']).toBe(UPDATED_AT_NEXT);
    expect(posts[1]?.body).toEqual({ milestone_id: MS2_ID });
  });

  it.each([
    {
      scenario: 'another Milestone',
      milestoneId: BM_ID as string | null,
      current: '현재: MS-B01 B 마일스톤',
    },
    { scenario: 'no Milestone', milestoneId: null, current: '현재: Milestone 없음' },
  ])(
    'shows the refreshed current value under the stale-write alert: $scenario',
    async ({ milestoneId, current }) => {
      idemRouter.config.postMode = 'stale';
      idemRouter.config.taskResponses[TASK_A_ID] = taskDetail({
        id: TASK_A_ID,
        title: 'A 작업',
        milestone_id: milestoneId,
        updated_at: UPDATED_AT_NEXT,
      });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(['task', TASK_A_ID], taskA);
      renderPanel(client, TASK_A_ID);
      expect(await screen.findByText('MS-A01 A 마일스톤')).toBeInTheDocument();
      await pickMilestoneAndSave();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '다른 사용자가 먼저 변경했습니다.',
      );
      // The user's choice stays selected, and the refreshed current value from
      // the refetched Task/Milestone is spelled out under the alert.
      expect(screen.getByRole('combobox', { name: 'Milestone 선택' })).toHaveTextContent(
        /MS-2 릴리스/,
      );
      expect(await screen.findByText(current)).toBeInTheDocument();
    },
  );
});
