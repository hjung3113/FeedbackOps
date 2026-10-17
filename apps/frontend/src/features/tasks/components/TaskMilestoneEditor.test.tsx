import { getTask } from '@/lib/api';
import { listMilestones } from '@/lib/api/milestones';
import { assignTaskMilestone } from '@/lib/api/tasks';
import {
  type MilestoneDetailDto,
  type MilestoneDto,
  type TaskDetailDto,
  assignTaskMilestoneRequestSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskMilestoneEditor } from './TaskMilestoneEditor';

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));

const TASK_ID = '10000000-0000-4000-8000-000000000001';
const SYSTEM_ID = '30000000-0000-4000-8000-000000000003';
const WORKSPACE_ID = '90000000-0000-4000-8000-000000000009';
const OWNER_ID = '40000000-0000-4000-8000-000000000004';
const MS1_ID = '50000000-0000-4000-8000-000000000001';
const MS2_ID = '50000000-0000-4000-8000-000000000002';
const UPDATED_AT = '2026-10-13T00:00:00.000Z';
const UPDATED_AT_NEXT = '2026-10-13T01:00:00.000Z';
const NO_MILESTONE_PICK = 'Milestone 없음';
const MS1_OPTION = /MS-1 출시 준비/;
const MS2_OPTION = /MS-2 릴리스/;

const baseTask = {
  id: TASK_ID,
  workspace_id: WORKSPACE_ID,
  display_id: 'TASK-1000',
  primary_managed_system_id: SYSTEM_ID,
  title: '배정 테스트',
  status: 'backlog' as const,
  priority: 'medium' as const,
  assignee_actor_id: null,
  assignee_team_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: OWNER_ID,
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: UPDATED_AT,
} satisfies Omit<TaskDetailDto, 'source'>;

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

const MS1 = milestoneRow({
  id: MS1_ID,
  display_id: 'MS-1',
  title: '출시 준비',
  status: 'in_progress',
});
const MS2 = milestoneRow({ id: MS2_ID, display_id: 'MS-2', title: '릴리스', status: 'released' });
const MS1_LABEL = 'MS-1 출시 준비';

// --- URL-mocked transport: the real apiRequest + shared schemas run. ---

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

function makeRouter(items: MilestoneDto[]) {
  const requests: RouterRequest[] = [];
  const config: { postResponse: Response | null; listResponse: Response | null } = {
    postResponse: null,
    listResponse: null,
  };
  let postSeen = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(new Headers(init?.headers));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path, headers, body });
    if (method === 'POST' && path === `/tasks/${TASK_ID}/milestone`) {
      postSeen = true;
      if (config.postResponse) return config.postResponse;
      const parsed = assignTaskMilestoneRequestSchema.parse(body);
      return jsonResponse({
        ...baseTask,
        ...(parsed.milestone_id !== null ? { milestone_id: parsed.milestone_id } : {}),
        updated_at: UPDATED_AT_NEXT,
      });
    }
    if (method === 'GET' && path === `/milestones?managed_system_id=${SYSTEM_ID}`) {
      if (config.listResponse) return config.listResponse.clone();
      return jsonResponse({ items: items.map((row) => (postSeen ? withPercent(row, 71) : row)) });
    }
    const detailMatch = path.match(/^\/milestones\/([0-9a-f-]+)$/);
    if (method === 'GET' && detailMatch) {
      const found = items.find((row) => row.id === detailMatch[1]);
      if (found) {
        return jsonResponse(milestoneDetail(postSeen ? withPercent(found, 71) : found));
      }
    }
    if (method === 'GET' && path === `/tasks/${TASK_ID}`) {
      return jsonResponse({ ...baseTask, source: null });
    }
    return jsonResponse({ code: 'not_found.record', message: 'unrouted' }, 404);
  });
  return { requests, fetchMock, config };
}

function withPercent(row: MilestoneDto, percent: number): MilestoneDto {
  return { ...row, progress: { ...row.progress, percent } };
}

function milestoneDetail(row: MilestoneDto): MilestoneDetailDto {
  return { ...row, source_finding: null };
}

const originalFetch = globalThis.fetch;
let router = makeRouter([MS1, MS2]);

beforeEach(() => {
  router = makeRouter([MS1, MS2]);
  globalThis.fetch = router.fetchMock as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface HarnessOverrides {
  milestoneId?: string | null;
  valueLabel?: string | null;
  canEdit?: boolean;
}

function renderHarness(overrides: HarnessOverrides = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSave = (next: string | null, key: string) =>
    assignTaskMilestone(TASK_ID, { milestone_id: next }, key, UPDATED_AT);
  const current = {
    taskId: TASK_ID,
    managedSystemId: SYSTEM_ID,
    ifMatch: UPDATED_AT,
    milestoneId: overrides.milestoneId ?? null,
    valueLabel: overrides.valueLabel ?? null,
    canEdit: overrides.canEdit ?? true,
    onSave,
  };
  const view = render(
    <QueryClientProvider client={client}>
      <TaskMilestoneEditor {...current} />
    </QueryClientProvider>,
  );
  const rerenderProps = (milestoneId: string | null, valueLabel: string | null) => {
    current.milestoneId = milestoneId;
    current.valueLabel = valueLabel;
    view.rerender(
      <QueryClientProvider client={client}>
        <TaskMilestoneEditor {...current} />
      </QueryClientProvider>,
    );
  };
  return { client, rerenderProps };
}

/** Subscribed observers so the mutation's invalidations refetch fresh 30 s seeds. */
function ProgressProbes({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id) => (
        <DetailProbe key={id} id={id} />
      ))}
      <ListProbe />
    </>
  );
}

function DetailProbe({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['milestone', id] as const,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/milestones/${id}`, { signal });
      return (await res.json()) as MilestoneDetailDto;
    },
    staleTime: 30 * 1000,
  });
  return (
    <span data-testid={`detail-${id}`}>
      {query.data ? `${query.data.progress.percent}` : 'none'}
    </span>
  );
}

function ListProbe() {
  const query = useQuery({
    queryKey: ['milestones', 'task-options', SYSTEM_ID] as const,
    queryFn: ({ signal }) => listMilestones({ managed_system_id: SYSTEM_ID, signal }),
    staleTime: 30 * 1000,
  });
  return (
    <span data-testid="list">
      {(query.data?.items ?? [])
        .map((row) => `${row.display_id}:${row.progress.percent}`)
        .join(',')}
    </span>
  );
}

function TaskDetailProbe() {
  const query = useQuery({
    queryKey: ['task', TASK_ID] as const,
    queryFn: ({ signal }) => getTask(TASK_ID, signal),
    staleTime: 30 * 1000,
  });
  return <span data-testid="task-probe">{query.data?.updated_at ?? 'none'}</span>;
}

async function openEditorAndPick(optionName: string | RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: 'Milestone 수정' }));
  fireEvent.click(await screen.findByRole('combobox', { name: 'Milestone 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

async function submitAndAwaitPost(): Promise<RouterRequest> {
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await act(async () => {
    await Promise.resolve();
  });
  const posts = () =>
    router.requests.filter(
      (request) => request.method === 'POST' && /\/milestone$/.test(request.path),
    );
  await waitFor(() => expect(posts().length).toBeGreaterThan(0));
  const [post] = posts();
  if (post === undefined) throw new Error('milestone POST was not recorded');
  return post;
}

const conflictResponse = () =>
  jsonResponse(
    {
      code: 'conflict.stale_write',
      message: '다른 사용자가 먼저 변경했습니다.',
      detail: { current_updated_at: UPDATED_AT_NEXT },
    },
    409,
  );

describe('TaskMilestoneEditor', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
  });

  it.each([
    {
      scenario: 'assigns a Milestone to an unassigned Task',
      from: null,
      pick: MS1_OPTION,
      body: { milestone_id: MS1_ID },
      rowLabel: MS1_LABEL,
    },
    {
      scenario: 'moves the Task from one Milestone to another',
      from: MS1_ID,
      pick: MS2_OPTION,
      body: { milestone_id: MS2_ID },
      rowLabel: 'MS-2 릴리스',
    },
    {
      scenario: 'clears the Milestone through Milestone 없음',
      from: MS1_ID,
      pick: NO_MILESTONE_PICK,
      body: { milestone_id: null },
      rowLabel: null,
    },
  ] as const)('$scenario', async ({ from, pick, body, rowLabel }) => {
    const { rerenderProps } = renderHarness({
      milestoneId: from,
      valueLabel: from === null ? null : MS1_LABEL,
    });
    await openEditorAndPick(pick);
    const post = await submitAndAwaitPost();
    expect(post.body).toEqual(body);
    expect(assignTaskMilestoneRequestSchema.parse(post.body)).toEqual(body);
    expect(post.headers['if-match']).toBe(UPDATED_AT);
    expect(post.headers['idempotency-key']).toBeTruthy();
    // Success closes the editor and returns focus to the trigger; the rerender
    // feeds the row value the panel shows after its Task refetch.
    rerenderProps(body.milestone_id, rowLabel);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Milestone 수정' })).toHaveFocus(),
    );
    if (rowLabel === null) {
      expect(screen.getByText('—')).toBeInTheDocument();
    } else {
      expect(screen.getByText(rowLabel)).toBeInTheDocument();
    }
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('requests only the Task Managed System choices and lists a released Milestone as selectable', async () => {
    renderHarness();
    await openEditorAndPick(MS2_OPTION);
    const listGets = router.requests.filter(
      (request) => request.method === 'GET' && request.path.startsWith('/milestones?'),
    );
    expect(listGets.length).toBeGreaterThan(0);
    for (const request of listGets) {
      expect(request.path).toBe(`/milestones?managed_system_id=${SYSTEM_ID}`);
    }
    const post = await submitAndAwaitPost();
    expect(post.body).toEqual({ milestone_id: MS2_ID });
  });

  it('resends the captured identity on an ambiguous-failure retry and mints a new one after the choice changes', async () => {
    // 502 after the server may have committed: ambiguous, so the captured
    // key, If-Match, and body go back out unchanged.
    router.config.postResponse = jsonResponse(
      { code: 'upstream.unavailable', message: 'response lost' },
      502,
    );
    renderHarness({ milestoneId: MS1_ID, valueLabel: MS1_LABEL });
    await openEditorAndPick(MS2_OPTION);
    const first = await submitAndAwaitPost();
    expect(first.headers['idempotency-key']).toBeTruthy();
    // Retry the same choice: same draft, same captured identity.
    router.config.postResponse = null;
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => {
      expect(router.requests.filter((request) => request.method === 'POST')).toHaveLength(2);
    });
    const posts = router.requests.filter((request) => request.method === 'POST');
    expect(posts[1]?.headers['idempotency-key']).toBe(first.headers['idempotency-key']);
    expect(posts[1]?.headers['if-match']).toBe(UPDATED_AT);
    expect(posts[1]?.body).toEqual(first.body);
    // A changed choice starts a new attempt with a new key.
    await waitFor(() => expect(screen.getByRole('button', { name: /수정/ })).toBeInTheDocument());
    await openEditorAndPick(NO_MILESTONE_PICK);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => {
      expect(router.requests.filter((request) => request.method === 'POST')).toHaveLength(3);
    });
    const third = router.requests.filter((request) => request.method === 'POST')[2];
    expect(third?.headers['idempotency-key']).not.toBe(first.headers['idempotency-key']);
  });

  it('keeps the editor open with the choice on 409 stale write, shows the conflict, refetches the Task, and toasts no success', async () => {
    router.config.postResponse = conflictResponse();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['task', TASK_ID], { ...baseTask, source: null });
    render(
      <QueryClientProvider client={client}>
        <TaskDetailProbe />
        <TaskMilestoneEditor
          taskId={TASK_ID}
          managedSystemId={SYSTEM_ID}
          ifMatch={UPDATED_AT}
          milestoneId={MS1_ID}
          valueLabel="MS-1 출시 준비"
          canEdit
          onSave={(next, key) =>
            assignTaskMilestone(TASK_ID, { milestone_id: next }, key, UPDATED_AT)
          }
        />
      </QueryClientProvider>,
    );
    await openEditorAndPick(MS2_OPTION);
    const post = await submitAndAwaitPost();
    expect(post.body).toEqual({ milestone_id: MS2_ID });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '다른 사용자가 먼저 변경했습니다. 최신 내용을 불러올까요?',
    );
    expect(screen.getByRole('combobox', { name: 'Milestone 선택' })).toHaveTextContent(
      /MS-2 릴리스/,
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    // The Task row refetches the moved-under-us record (same stale-write
    // behaviour as the Milestone status editor).
    const postIndex = router.requests.indexOf(post);
    await waitFor(() =>
      expect(
        router.requests.some(
          (request, index) =>
            index > postIndex && request.method === 'GET' && request.path === `/tasks/${TASK_ID}`,
        ),
      ).toBe(true),
    );
  });

  it('shows no trigger and keeps the read-only value without canEdit', () => {
    renderHarness({ canEdit: false, valueLabel: MS1_LABEL });
    expect(screen.queryByRole('button', { name: 'Milestone 수정' })).not.toBeInTheDocument();
    expect(screen.getByText(MS1_LABEL)).toBeInTheDocument();
  });

  it('cancels on Escape and returns focus to the trigger', async () => {
    renderHarness({ milestoneId: MS1_ID, valueLabel: MS1_LABEL });
    fireEvent.click(await screen.findByRole('button', { name: 'Milestone 수정' }));
    expect(await screen.findByRole('combobox', { name: 'Milestone 선택' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Milestone 선택' }), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Milestone 수정' })).toHaveFocus(),
    );
    expect(screen.queryByRole('combobox', { name: 'Milestone 선택' })).not.toBeInTheDocument();
  });

  it('gives the trigger an accessible Milestone name while the visible text stays 수정', () => {
    renderHarness({ valueLabel: MS1_LABEL });
    const trigger = screen.getByRole('button', { name: 'Milestone 수정' });
    expect(trigger).toHaveTextContent('수정');
  });

  it('shows a distinct read error and only Milestone 없음 when the initial choices GET fails', async () => {
    router.config.listResponse = jsonResponse(
      { code: 'internal_error.server', message: 'boom' },
      500,
    );
    renderHarness();
    fireEvent.click(await screen.findByRole('button', { name: /수정/ }));
    // The read error is distinguishable from an empty list…
    expect(await screen.findByText('Milestone 목록을 불러올 수 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Milestone 선택' }));
    const none = await screen.findByRole('option', { name: NO_MILESTONE_PICK });
    expect(screen.queryByRole('option', { name: MS1_OPTION })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: MS2_OPTION })).not.toBeInTheDocument();
    // …and the explicit clear stays available and submittable.
    fireEvent.click(none);
    const post = await submitAndAwaitPost();
    expect(post.body).toEqual({ milestone_id: null });
  });

  it('hides retained choices and blocks a held non-null pick after a settled refetch error', async () => {
    const harness = renderHarness({ milestoneId: MS1_ID, valueLabel: MS1_LABEL });
    await openEditorAndPick(MS2_OPTION);
    // Cached success, then a failed background refetch.
    router.config.listResponse = jsonResponse(
      { code: 'internal_error.server', message: 'boom' },
      500,
    );
    await act(async () => {
      await harness.client.refetchQueries({ queryKey: ['milestones', 'task-options', SYSTEM_ID] });
    });
    expect(await screen.findByText('Milestone 목록을 불러올 수 없습니다.')).toBeInTheDocument();
    // The unavailable non-null choice cannot be saved; only an explicit none
    // is allowed through. (Asserted with the listbox closed — while it is
    // open, Radix hides the outside tree from the accessibility tree.)
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      router.requests.filter(
        (request) => request.method === 'POST' && /\/milestone$/.test(request.path),
      ),
    ).toHaveLength(0);
    // Retained titles no longer render as options; the held pick is
    // identity-free and disabled.
    fireEvent.click(screen.getByRole('combobox', { name: 'Milestone 선택' }));
    expect(await screen.findByRole('option', { name: '확인할 수 없음' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: MS1_OPTION })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: MS2_OPTION })).not.toBeInTheDocument();
  });

  describe('progress refresh', () => {
    it.each([
      {
        scenario: 'assign refreshes the new Milestone progress',
        from: null,
        pick: MS1_OPTION,
        involved: [MS1],
      },
      {
        scenario: 'move refreshes the old and the new Milestone progress',
        from: MS1_ID,
        pick: MS2_OPTION,
        involved: [MS1, MS2],
      },
      {
        scenario: 'clear refreshes the previous Milestone progress',
        from: MS1_ID,
        pick: NO_MILESTONE_PICK,
        involved: [MS1],
      },
    ] as const)('$scenario', async ({ from, pick, involved }) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(['milestones', 'task-options', SYSTEM_ID], { items: [MS1, MS2] });
      for (const row of involved) {
        client.setQueryData(['milestone', row.id], milestoneDetail(row));
      }
      render(
        <QueryClientProvider client={client}>
          <ProgressProbes ids={involved.map((row) => row.id)} />
          <TaskMilestoneEditor
            taskId={TASK_ID}
            managedSystemId={SYSTEM_ID}
            ifMatch={UPDATED_AT}
            milestoneId={from}
            valueLabel={from === null ? null : MS1_LABEL}
            canEdit
            onSave={(next, key) =>
              assignTaskMilestone(TASK_ID, { milestone_id: next }, key, UPDATED_AT)
            }
          />
        </QueryClientProvider>,
      );
      for (const row of involved) {
        expect(screen.getByTestId(`detail-${row.id}`)).toHaveTextContent(`${row.progress.percent}`);
      }
      await openEditorAndPick(pick);
      const post = await submitAndAwaitPost();
      const postIndex = router.requests.indexOf(post);
      // Changed progress arrives only through GETs served after the POST.
      await waitFor(() => {
        for (const row of involved) {
          expect(screen.getByTestId(`detail-${row.id}`)).toHaveTextContent('71');
        }
        expect(screen.getByTestId('list')).toHaveTextContent('MS-1:71');
        expect(screen.getByTestId('list')).toHaveTextContent('MS-2:71');
      });
      expect(
        router.requests.slice(0, postIndex).filter((request) => request.method === 'GET'),
      ).toEqual([]);
    });
  });
});
