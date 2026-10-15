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
  const config = {
    taskResponses: {
      [TASK_A_ID]: taskA,
      [TASK_B_ID]: taskB,
    } as Record<string, TaskDetailDto>,
    gatePost: false,
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
  return {
    requests,
    fetchMock,
    config,
    releasePost: (response?: Response) => releasePost?.(response ?? jsonResponse(taskB)),
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
  fireEvent.click(await screen.findByRole('button', { name: '수정' }));
  fireEvent.click(await screen.findByRole('combobox', { name: 'Milestone 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: MS2_OPTION }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await act(async () => {
    await Promise.resolve();
  });
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
    expect(screen.getByRole('button', { name: '수정' })).toHaveFocus();
    expect(screen.queryByText('MS-A01 A 마일스톤')).not.toBeInTheDocument();
  });

  it('shows the trigger for a Developer with the scoped finding.manage grant', async () => {
    meImpl.value = { actor: { id: 'dev', role_level: 'developer' } };
    permissionImpl.value = { state: 'approved' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['task', TASK_A_ID], taskA);
    renderPanel(client, TASK_A_ID);
    expect(await screen.findByRole('button', { name: '수정' })).toBeInTheDocument();
  });
});
