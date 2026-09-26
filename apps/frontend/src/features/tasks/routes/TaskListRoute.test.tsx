import { getTask, listTasks } from '@/lib/api';
import { getMilestone } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import type { MilestoneDetailDto, TaskDetailDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailPanel } from '../components/TaskDetailPanel';
import { TaskListRoute } from './TaskListRoute';

vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    ListShell: ({
      list,
      detailPanel,
    }: {
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <main>{list}</main>
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});

// Shared across renders so a test can assert where a trail node sends the actor.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [{ id: '20000000-0000-0000-0000-000000000002', display_name: '담당자' }],
  }),
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [
      {
        id: '30000000-0000-0000-0000-000000000003',
        name: 'Billing Ops',
        archived_at: null,
      },
    ],
  })),
}));

vi.mock('@/lib/api', () => {
  const task = {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'TASK-1000',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    title: '매출 리포트 쿼리 플랜 개선',
    status: 'backlog',
    priority: 'high',
    assignee_actor_id: '20000000-0000-0000-0000-000000000002',
    due_date: null,
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: '20000000-0000-0000-0000-000000000002',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
  return {
    listTasks: vi.fn(async () => ({ items: [task] })),
    getTask: vi.fn(async () => ({
      ...task,
      source: {
        finding: {
          id: '40000000-0000-0000-0000-000000000004',
          display_id: 'FIN-179',
          title: '리포트 속도 저하',
          summary: '쿼리 플랜 개선 필요',
          evidence_count: 3,
        },
      },
    })),
  };
});

vi.mock('@/lib/api/milestones', () => ({
  getMilestone: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TaskListRoute display ids', () => {
  it('renders task display_id in the list row, detail header, and link trail', async () => {
    renderWithClient(<TaskListRoute />);

    await waitFor(() => {
      expect(screen.getAllByText('TASK-1000').length).toBeGreaterThan(0);
    });
    expect(await screen.findByText('FIN-179')).toBeInTheDocument();
    expect(screen.queryByText(/10000000/)).not.toBeInTheDocument();
  });

  it('AC-395-5: passes managed_system_id to listTasks when managedSystem prop is set', async () => {
    vi.mocked(listTasks).mockClear();
    renderWithClient(<TaskListRoute managedSystem="30000000-0000-0000-0000-000000000003" />);

    await screen.findByText('TASK-1000');
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith(
      expect.objectContaining({
        managed_system_id: '30000000-0000-0000-0000-000000000003',
      }),
    );
  });

  it('opens the source Finding from the linked-context trail', async () => {
    navigateMock.mockClear();
    renderWithClient(<TaskListRoute />);

    // The trail names the Finding twice over (Source evidence block and the
    // trail node); the navigable one is the button the trail renders.
    const findingNode = await screen.findByRole('button', { name: /리포트 속도 저하/ });
    await userEvent.click(findingNode);

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/findings/$findingId',
      params: { findingId: '40000000-0000-0000-0000-000000000004' },
    });
  });

  it('leaves the viewed Task itself unnavigable in the trail', async () => {
    renderWithClient(<TaskListRoute />);

    await screen.findByText('FIN-179');
    // Scoped to the Linked context section — the list row on the other side of
    // the shell is a button carrying the same title, and it is not the subject.
    const trail = document.querySelector('[data-anchor="context"]');
    expect(trail).not.toBeNull();
    const context = within(trail as HTMLElement);
    expect(context.getByRole('button', { name: /리포트 속도 저하/ })).toBeInTheDocument();
    expect(
      context.queryByRole('button', { name: /매출 리포트 쿼리 플랜 개선/ }),
    ).not.toBeInTheDocument();
  });

  it('renders permission denied instead of the list unavailable copy for a 403', async () => {
    vi.mocked(listTasks).mockRejectedValueOnce(
      new ApiError(403, {
        code: 'permission.denied',
        message: 'finding.manage capability required',
      }),
    );
    renderWithClient(<TaskListRoute />);

    const panel = await screen.findByText('Task list');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByText('Task list unavailable.')).not.toBeInTheDocument();
  });

  it('keeps a non-permission list failure unavailable', async () => {
    vi.mocked(listTasks).mockRejectedValueOnce(
      new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    );
    renderWithClient(<TaskListRoute />);

    expect(await screen.findByText('Task list unavailable.')).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();
  });

  it('renders permission denied instead of task detail unavailable for a 403', async () => {
    vi.mocked(getTask).mockRejectedValueOnce(
      new ApiError(403, {
        code: 'permission.denied',
        message: 'finding.manage capability required',
      }),
    );
    renderWithClient(
      <TaskDetailPanel
        taskId="10000000-0000-0000-0000-000000000001"
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
        onClose={vi.fn()}
      />,
    );

    const panel = await screen.findByText('Task detail');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByText('Task detail unavailable.')).not.toBeInTheDocument();
  });

  it('keeps a non-permission task detail failure unavailable', async () => {
    vi.mocked(getTask).mockRejectedValueOnce(
      new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    );
    renderWithClient(
      <TaskDetailPanel
        taskId="10000000-0000-0000-0000-000000000001"
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('Task detail unavailable.')).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();
  });
});

const VOC_ID = '50000000-0000-0000-0000-000000000005';
const FINDING_ID = '40000000-0000-0000-0000-000000000004';
const VOC_TITLE = '로그인 지연 불만';

function taskDetailFixture(
  source: TaskDetailDto['source'],
  milestoneId: string | null = null,
): TaskDetailDto {
  return {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'TASK-1000',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    title: '매출 리포트 쿼리 플랜 개선',
    status: 'backlog',
    priority: 'high',
    assignee_actor_id: '20000000-0000-0000-0000-000000000002',
    due_date: null,
    milestone_id: milestoneId,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: '20000000-0000-0000-0000-000000000002',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    source,
  };
}

function renderTaskDetailPanel(): void {
  renderWithClient(
    <TaskDetailPanel
      taskId="10000000-0000-0000-0000-000000000001"
      actorNamesById={new Map()}
      managedSystemNamesById={new Map()}
      onClose={vi.fn()}
    />,
  );
}

describe('Task detail Linked context source VOC (#378)', () => {
  it('renders the allowed source VOC node first and navigates to the /vocs selection', async () => {
    navigateMock.mockClear();
    vi.mocked(getTask).mockResolvedValueOnce(
      taskDetailFixture({
        voc: {
          visibility_state: 'allowed',
          id: VOC_ID,
          display_id: 'V-204',
          title: VOC_TITLE,
        },
        finding: {
          id: FINDING_ID,
          title: '리포트 속도 저하',
          summary: '쿼리 플랜 개선 필요',
          evidence_count: 3,
        },
      }),
    );
    renderTaskDetailPanel();

    await screen.findByText('Linked context');
    const trail = document.querySelector('[data-anchor="context"]') as HTMLElement;
    const vocBadge = trail.querySelector('[data-entity-type="voc"]');
    const findingBadge = trail.querySelector('[data-entity-type="finding"]');
    // Positive render first: the allowed VOC node exists with its identifiers.
    expect(vocBadge).not.toBeNull();
    expect(findingBadge).not.toBeNull();
    expect(within(trail).getByText(VOC_TITLE)).toBeInTheDocument();
    expect(within(trail).getByRole('button', { name: new RegExp(VOC_TITLE) })).toBeInTheDocument();
    // …and it leads the trail: the VOC badge precedes the Finding badge.
    const vocFirst =
      vocBadge && findingBadge
        ? vocBadge.compareDocumentPosition(findingBadge) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0;
    expect(vocFirst).toBeTruthy();

    // Clicking navigates exactly like every other VOC link: /vocs URL state.
    await userEvent.click(within(trail).getByRole('button', { name: new RegExp(VOC_TITLE) }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/vocs',
      search: { selected: VOC_ID },
    });

    // Finding and Task nodes are unchanged: Finding navigable, Task not.
    await userEvent.click(within(trail).getByRole('button', { name: /리포트 속도 저하/ }));
    expect(navigateMock).toHaveBeenLastCalledWith({
      to: '/findings/$findingId',
      params: { findingId: FINDING_ID },
    });
    expect(
      within(trail).queryByRole('button', { name: /매출 리포트 쿼리 플랜 개선/ }),
    ).not.toBeInTheDocument();
  });

  it('renders the summary_visible blocked panel with no identifiers and no VOC node', async () => {
    vi.mocked(getTask).mockResolvedValueOnce(
      taskDetailFixture({
        voc: { visibility_state: 'summary_visible' },
        finding: {
          id: FINDING_ID,
          title: '리포트 속도 저하',
          summary: '쿼리 플랜 개선 필요',
          evidence_count: 3,
        },
      }),
    );
    renderTaskDetailPanel();

    await screen.findByText('Linked context');
    const trail = document.querySelector('[data-anchor="context"]') as HTMLElement;
    // Positive control for the negatives: the blocked panel really renders.
    expect(within(trail).getByText('Source VOC').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'summary_visible',
    );
    // No VOC node, no navigation affordance, no identifiers invented.
    expect(trail.querySelector('[data-entity-type="voc"]')).toBeNull();
    expect(
      within(trail).queryByRole('button', { name: new RegExp(VOC_TITLE) }),
    ).not.toBeInTheDocument();
    expect(within(trail).queryByText('V-204')).not.toBeInTheDocument();
    // Finding node unchanged.
    expect(within(trail).getByRole('button', { name: /리포트 속도 저하/ })).toBeInTheDocument();
  });

  it('renders the denied blocked panel with no identifiers and no VOC node', async () => {
    vi.mocked(getTask).mockResolvedValueOnce(
      taskDetailFixture({
        voc: { visibility_state: 'denied' },
        finding: {
          id: FINDING_ID,
          title: '리포트 속도 저하',
          summary: '쿼리 플랜 개선 필요',
          evidence_count: 3,
        },
      }),
    );
    renderTaskDetailPanel();

    await screen.findByText('Linked context');
    const trail = document.querySelector('[data-anchor="context"]') as HTMLElement;
    expect(within(trail).getByText('Source VOC').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'denied',
    );
    expect(trail.querySelector('[data-entity-type="voc"]')).toBeNull();
    expect(
      within(trail).queryByRole('button', { name: new RegExp(VOC_TITLE) }),
    ).not.toBeInTheDocument();
    expect(within(trail).getByRole('button', { name: /리포트 속도 저하/ })).toBeInTheDocument();
  });

  it('renders no VOC node and no blocked panel when the backend omits voc', async () => {
    vi.mocked(getTask).mockResolvedValueOnce(
      taskDetailFixture({
        finding: {
          id: FINDING_ID,
          title: '리포트 속도 저하',
          summary: '쿼리 플랜 개선 필요',
          evidence_count: 3,
        },
      }),
    );
    renderTaskDetailPanel();

    await screen.findByText('Linked context');
    const trail = document.querySelector('[data-anchor="context"]') as HTMLElement;
    expect(trail.querySelector('[data-state]')).toBeNull();
    expect(screen.queryByText('Source VOC')).not.toBeInTheDocument();
    expect(trail.querySelector('[data-entity-type="voc"]')).toBeNull();
    // Positive control: the Finding node still renders as before.
    expect(within(trail).getByRole('button', { name: /리포트 속도 저하/ })).toBeInTheDocument();
  });
});

describe('Task detail Milestone row (#514 B3b)', () => {
  const MILESTONE_ID = '60000000-0000-0000-0000-000000000006';

  function milestoneFixture(): MilestoneDetailDto {
    return {
      id: MILESTONE_ID,
      workspace_id: '90000000-0000-0000-0000-000000000009',
      display_id: 'MLS-1000',
      primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
      title: 'Q3 결제 지표 개선',
      why: '결제 전환율 개선',
      status: 'in_progress',
      owner_actor_id: '20000000-0000-0000-0000-000000000002',
      analytics_area_id: null,
      start_date: '2026-07-01',
      target_date: '2026-09-30',
      created_by: '20000000-0000-0000-0000-000000000002',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
      progress: { released_done: 0, in_flight: 2, queued: 1, total: 3, percent: 0 },
      source_finding: null,
    };
  }

  async function milestoneRow(): Promise<HTMLElement> {
    const row = (await screen.findByText('Milestone')).parentElement;
    if (!(row instanceof HTMLElement)) throw new Error('Milestone row not found');
    return row;
  }

  it('shows the label Milestone and — when milestone_id is null', async () => {
    vi.mocked(getMilestone).mockClear();
    renderTaskDetailPanel();

    const row = await milestoneRow();
    expect(within(row).getByText('—')).toBeInTheDocument();
    // The row is a read: nothing to fetch without a linked milestone.
    expect(getMilestone).not.toHaveBeenCalled();
  });

  it('fetches the linked milestone via getMilestone and shows its display_id and title', async () => {
    vi.mocked(getTask).mockResolvedValueOnce(taskDetailFixture(null, MILESTONE_ID));
    vi.mocked(getMilestone).mockResolvedValueOnce(milestoneFixture());
    renderTaskDetailPanel();

    expect(await screen.findByText('Q3 결제 지표 개선')).toBeInTheDocument();
    expect(screen.getByText('MLS-1000')).toBeInTheDocument();
    expect(getMilestone).toHaveBeenCalledWith(MILESTONE_ID, expect.anything());
  });

  it('shows — when the milestone fetch returns 404', async () => {
    vi.mocked(getTask).mockResolvedValueOnce(taskDetailFixture(null, MILESTONE_ID));
    vi.mocked(getMilestone).mockRejectedValueOnce(
      new ApiError(404, { code: 'not_found.record', message: 'milestone not found' }),
    );
    renderTaskDetailPanel();

    const row = await milestoneRow();
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('MLS-1000')).not.toBeInTheDocument();
  });

  it('renders no control that assigns a milestone (no POST /tasks/:id/milestone)', async () => {
    vi.mocked(getTask).mockResolvedValueOnce(taskDetailFixture(null, MILESTONE_ID));
    vi.mocked(getMilestone).mockResolvedValueOnce(milestoneFixture());
    renderTaskDetailPanel();

    expect(await screen.findByText('Q3 결제 지표 개선')).toBeInTheDocument();
    // The row is a read: no picker and no action button live in it.
    const row = await milestoneRow();
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });
});
