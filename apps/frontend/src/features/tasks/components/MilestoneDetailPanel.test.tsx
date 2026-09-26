import { getMilestone, updateMilestone } from '@/lib/api/milestones';
import { listTasks } from '@/lib/api/tasks';
import { ApiError } from '@/lib/api/types';
import type { MilestoneDetailDto, TaskDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestoneDetailPanel } from './MilestoneDetailPanel';

vi.mock('@/lib/api/milestones', () => ({
  getMilestone: vi.fn(),
  updateMilestone: vi.fn(),
}));

vi.mock('@/lib/api/tasks', () => ({
  listTasks: vi.fn(),
}));

// The panel owns the only router usage in this tree; the hoisted mock mirrors
// TaskListRoute.test.tsx so navigation targets are assertable.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

const MANAGED_SYSTEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1';
const AREA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd00a1';
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002';
const ASSIGNEE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005';
const MILESTONE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1021';
const OTHER_MILESTONE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1022';
const FINDING_ID = 'ffffffff-ffff-4fff-8fff-ffffffff0181';

// Child Task rows for the B2d-tasks section (listTasks with milestone_id).
const childTask: TaskDto = {
  id: '33333333-3333-4333-8333-333333330902',
  workspace_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  display_id: 'TASK-902',
  primary_managed_system_id: MANAGED_SYSTEM_ID,
  title: 'Power BI 임베디드 SSO 재인증 핸들러 구현',
  status: 'doing',
  priority: 'urgent',
  assignee_actor_id: ASSIGNEE_ID,
  due_date: '2026-06-15',
  milestone_id: MILESTONE_ID,
  analytics_area_id: AREA_ID,
  source_task_request_id: null,
  created_by: OWNER_ID,
  created_at: '2026-07-20T01:00:00.000Z',
  updated_at: '2026-07-21T08:10:00.000Z',
};

const linkedDetail: MilestoneDetailDto = {
  id: MILESTONE_ID,
  workspace_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  display_id: 'MLS-1021',
  primary_managed_system_id: MANAGED_SYSTEM_ID,
  title: 'SSO Stabilization',
  why: 'SSO 세션 만료 후 재인증 흐름이 없습니다.',
  status: 'in_progress',
  owner_actor_id: OWNER_ID,
  analytics_area_id: AREA_ID,
  start_date: '2026-05-10',
  target_date: '2026-06-15',
  created_by: OWNER_ID,
  created_at: '2026-07-21T01:00:00.000Z',
  updated_at: '2026-07-21T08:30:00.000Z',
  progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
  source_finding: {
    id: FINDING_ID,
    display_id: 'FIN-181',
    title: 'Power BI 임베디드 보고서의 SSO 세션 재인증 흐름 누락',
    summary: '여러 팀에서 401 응답 후 빈 화면을 겪고 있습니다.',
    evidence_count: 7,
  },
};

const standaloneDetail: MilestoneDetailDto = {
  ...linkedDetail,
  analytics_area_id: null,
  source_finding: null,
};

const ACTOR_NAMES = new Map([
  [OWNER_ID, '박서연'],
  [ASSIGNEE_ID, '정하늘'],
]);
const MANAGED_SYSTEM_NAMES = new Map([[MANAGED_SYSTEM_ID, 'Power BI']]);
const AREA_NAMES = new Map([[AREA_ID, 'Product Usage']]);

function renderPanel(
  detail: MilestoneDetailDto | Promise<MilestoneDetailDto> | ApiError,
  options: { onClose?: () => void } = {},
): void {
  vi.mocked(getMilestone).mockReturnValue(
    detail instanceof ApiError ? Promise.reject(detail) : Promise.resolve(detail),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MilestoneDetailPanel
        milestoneId={MILESTONE_ID}
        onClose={options.onClose ?? (() => {})}
        actorNamesById={ACTOR_NAMES}
        managedSystemNamesById={MANAGED_SYSTEM_NAMES}
        analyticsAreaNamesById={AREA_NAMES}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getMilestone).mockReset();
  vi.mocked(listTasks).mockReset();
  // Default: the selected milestone has no child Task rows; task-specific
  // tests override with their own fixtures.
  vi.mocked(listTasks).mockResolvedValue({ items: [] });
  navigateMock.mockReset();
});

describe('MilestoneDetailPanel (#514 B2d)', () => {
  it('renders the overview copy, progress strip, and property labels from the detail DTO', async () => {
    renderPanel(linkedDetail);

    expect(await screen.findByRole('heading', { name: 'SSO Stabilization' })).toBeInTheDocument();
    expect(screen.getByText('Why this milestone exists')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 tasks released')).toBeInTheDocument();
    for (const label of [
      'Status',
      'Managed System',
      'Analytics Area',
      'Owner',
      'Start',
      'Target',
      'Created',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Existing linked source Finding keeps its display card (approved contract).
    expect(screen.getByText('From finding')).toBeInTheDocument();
    expect(screen.getByText('FIN-181')).toBeInTheDocument();
    expect(screen.getByText('Evidence · 7')).toBeInTheDocument();
  });

  it('renders the standalone source copy and no Link source finding control when source_finding is null', async () => {
    renderPanel(standaloneDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(
      screen.getByText(
        '근거 Finding 이 연결되어 있지 않습니다. Standalone milestone 으로 운영 중입니다.',
      ),
    ).toBeInTheDocument();
    // The Finding → Milestone writer is out of scope (#514); no control may
    // pretend one exists.
    expect(screen.queryByRole('button', { name: 'Link source finding' })).not.toBeInTheDocument();
  });

  it('renders empty Evidence and Activity copy without outcome-survey controls', async () => {
    renderPanel(linkedDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(screen.getByText('연결된 evidence highlight 가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('활동 기록이 없습니다.')).toBeInTheDocument();
    // FOP-OUT-014: no Milestone → Outcome Survey validation in MVP.
    expect(screen.queryByText(/Outcome survey/)).not.toBeInTheDocument();
  });

  it('has exactly Overview, Tasks, Evidence, Activity in the section nav — no Timeline', async () => {
    renderPanel(linkedDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    const nav = screen.getByRole('button', { name: 'Overview' }).closest('div');
    if (!nav) throw new Error('section nav not found');
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent);
    // 'Tasks0' = the label plus the count pill (DetailPanelSectionNav renders
    // the count as a child span once the child read resolves).
    expect(labels).toEqual(['Overview', 'Tasks0', 'Evidence', 'Activity']);
    expect(screen.queryByRole('button', { name: 'Timeline' })).not.toBeInTheDocument();
  });

  it('renders Managed System as read-only text, not an input', async () => {
    renderPanel(linkedDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByText('Power BI').length).toBeGreaterThan(0);
  });

  // B2d fixup finding 1 — the prototype nests the real Why text in
  // NestedTextBlock (screen-milestones.jsx:331-335); no bare paragraph.
  it('renders the real why text inside the NestedTextBlock hierarchy', async () => {
    renderPanel(linkedDetail);

    const why = await screen.findByText('SSO 세션 만료 후 재인증 흐름이 없습니다.');
    // NestedTextBlock presentation (packages/ui NestedTextBlock): inset
    // bordered canvas block, per the prototype's panel-section Why block.
    expect(why).toHaveClass('rounded-md');
    expect(why).toHaveClass('border-border-subtle');
    expect(why).toHaveClass('bg-surface-canvas');
  });

  // B2d fixup finding 2 — the shared header chrome and close action stay
  // mounted independently of the detail query result; pending/denied/missing
  // states stay dismissible and never expose unavailable record data.
  it('keeps the panel header and close action mounted while the detail read is pending', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel(new Promise<MilestoneDetailDto>(() => {}), { onClose });

    expect(screen.getByText('Loading Milestone…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '패널 닫기' })).toBeInTheDocument();
    // No record data may leak before the read resolves.
    expect(screen.queryByText('SSO Stabilization')).not.toBeInTheDocument();
    expect(screen.queryByText('MLS-1021')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the panel dismissible on a permission-denied detail read', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      new ApiError(403, { code: 'permission.denied', message: 'finding.manage required' }),
      {
        onClose,
      },
    );

    expect(await screen.findByRole('heading', { name: 'Milestone detail' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '패널 닫기' })).toBeInTheDocument();
    expect(screen.queryByText('SSO 세션 만료 후 재인증 흐름이 없습니다.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps the panel dismissible when the selected detail is missing', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel(new ApiError(404, { code: 'not_found.record', message: 'record not found' }), {
      onClose,
    });

    expect(await screen.findByText('Milestone detail unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '패널 닫기' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // R2-1 — React Query keeps the successful record when a later read fails.
  // The same client and ['milestone', id] key must drop cached identity,
  // body, and record actions once that refetch is terminal.
  it.each([
    {
      failure: '403 permission.denied',
      error: new ApiError(403, {
        code: 'permission.denied',
        message: 'finding.manage required',
      }),
      blocked: true,
    },
    {
      failure: '404 not_found.record',
      error: new ApiError(404, { code: 'not_found.record', message: 'record not found' }),
      blocked: false,
    },
  ])(
    'hides the cached milestone after a successful read then a $failure refetch',
    async ({ error, blocked }) => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      vi.mocked(getMilestone).mockResolvedValueOnce(linkedDetail);

      render(
        <QueryClientProvider client={queryClient}>
          <MilestoneDetailPanel
            milestoneId={MILESTONE_ID}
            onClose={onClose}
            actorNamesById={ACTOR_NAMES}
            managedSystemNamesById={MANAGED_SYSTEM_NAMES}
            analyticsAreaNamesById={AREA_NAMES}
          />
        </QueryClientProvider>,
      );

      expect(await screen.findByRole('heading', { name: 'SSO Stabilization' })).toBeInTheDocument();
      expect(screen.getByText('MLS-1021')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open finding' })).toBeInTheDocument();

      vi.mocked(getMilestone).mockRejectedValueOnce(error);
      await queryClient.invalidateQueries({ queryKey: ['milestone', MILESTONE_ID] });

      if (blocked) {
        expect(
          await screen.findByRole('heading', { name: 'Milestone detail' }),
        ).toBeInTheDocument();
        expect(screen.getByText('finding.manage required')).toBeInTheDocument();
        expect(screen.queryByText('Milestone detail unavailable.')).not.toBeInTheDocument();
      } else {
        expect(await screen.findByText('Milestone detail unavailable.')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Milestone detail' })).not.toBeInTheDocument();
      }

      expect(screen.queryByRole('heading', { name: 'SSO Stabilization' })).not.toBeInTheDocument();
      expect(screen.queryByText('MLS-1021')).not.toBeInTheDocument();
      expect(
        screen.queryByText('SSO 세션 만료 후 재인증 흐름이 없습니다.'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('From finding')).not.toBeInTheDocument();
      expect(screen.queryByText('FIN-181')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open finding' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '링크 복사' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();

      expect(screen.getByText('Milestone')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '패널 닫기' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '패널 닫기' }));
      expect(onClose).toHaveBeenCalledOnce();
    },
  );

  // B2d fixup finding 3 — a linked source Finding opens its own detail route
  // (prototype Open finding, screen-milestones.jsx:337-343; routes-and-layout
  // linked-context rule). No writer is implied: source_finding is read-only.
  it('opens the linked source Finding detail route from the Source section', async () => {
    const user = userEvent.setup();
    renderPanel(linkedDetail);

    await user.click(await screen.findByRole('button', { name: 'Open finding' }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/findings/$findingId',
      params: { findingId: FINDING_ID },
    });
  });

  it('renders no Open finding control when the milestone is standalone', async () => {
    renderPanel(standaloneDetail);

    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(screen.queryByRole('button', { name: 'Open finding' })).not.toBeInTheDocument();
  });

  // B2e fixup S1/P1 — editor state is isolated to the selected record. With
  // both details cached, a draft typed on A must not survive selecting B: the
  // keyed remount closes the editor, so A's draft cannot be PATCHed against
  // B's id and If-Match token.
  it('drops the title draft when switching between two cached records', async () => {
    const user = userEvent.setup();
    const rowA: MilestoneDetailDto = { ...standaloneDetail, title: 'Alpha milestone' };
    const rowB: MilestoneDetailDto = {
      ...standaloneDetail,
      id: OTHER_MILESTONE_ID,
      display_id: 'MLS-1022',
      title: 'Beta milestone',
    };
    vi.mocked(getMilestone).mockImplementation((id) =>
      Promise.resolve(id === MILESTONE_ID ? rowA : rowB),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MilestoneDetailPanel
          milestoneId={MILESTONE_ID}
          onClose={() => {}}
          actorNamesById={ACTOR_NAMES}
          managedSystemNamesById={MANAGED_SYSTEM_NAMES}
          analyticsAreaNamesById={AREA_NAMES}
        />
      </QueryClientProvider>,
    );

    await screen.findByRole('heading', { name: 'Alpha milestone' });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MilestoneDetailPanel
          milestoneId={OTHER_MILESTONE_ID}
          onClose={() => {}}
          actorNamesById={ACTOR_NAMES}
          managedSystemNamesById={MANAGED_SYSTEM_NAMES}
          analyticsAreaNamesById={AREA_NAMES}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Beta milestone' });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MilestoneDetailPanel
          milestoneId={MILESTONE_ID}
          onClose={() => {}}
          actorNamesById={ACTOR_NAMES}
          managedSystemNamesById={MANAGED_SYSTEM_NAMES}
          analyticsAreaNamesById={AREA_NAMES}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Alpha milestone' });

    await user.click(screen.getByRole('button', { name: 'Edit title' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), ' typed on A');

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MilestoneDetailPanel
          milestoneId={OTHER_MILESTONE_ID}
          onClose={() => {}}
          actorNamesById={ACTOR_NAMES}
          managedSystemNamesById={MANAGED_SYSTEM_NAMES}
          analyticsAreaNamesById={AREA_NAMES}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Beta milestone' });

    // B renders with no editor, no Save control, and no trace of A's draft:
    // the wrong-record submit path cannot even be reached.
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByText(/typed on A/)).not.toBeInTheDocument();
    expect(vi.mocked(updateMilestone)).not.toHaveBeenCalled();
  });

  // #514 B2d-tasks — Tasks section (screen-milestones.jsx:402-416), fed by
  // GET /tasks?milestone_id= through the existing tasks client.
  it('reads the child list with milestone_id through listTasks', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [childTask] });
    renderPanel(linkedDetail);

    await screen.findByText('Tasks · 1');
    expect(vi.mocked(listTasks)).toHaveBeenCalledWith({
      milestone_id: MILESTONE_ID,
      signal: expect.any(AbortSignal),
    });
  });

  it('renders the Tasks header count and empty copy when no child rows exist', async () => {
    renderPanel(linkedDetail);

    expect(await screen.findByText('Tasks · 0')).toBeInTheDocument();
    expect(screen.getByText('아직 연결된 Task 가 없습니다.')).toBeInTheDocument();
  });

  it('renders a child row with priority, display id, title, internal status, and assignee', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [childTask] });
    renderPanel(linkedDetail);

    const section = await screen.findByText('Tasks · 1');
    const row = section.closest('[data-anchor="tasks"]');
    if (!row) throw new Error('tasks section not found');
    // SeverityIndicator driven by task.priority (urgent → critical).
    expect(within(row as HTMLElement).getByLabelText('critical')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('TASK-902')).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByText('Power BI 임베디드 SSO 재인증 핸들러 구현'),
    ).toBeInTheDocument();
    // Internal task status — distinct from reporter-facing status.
    expect(within(row as HTMLElement).getByText('Doing')).toBeInTheDocument();
    // UserAvatar renders the assignee's Hangul initial only.
    expect(within(row as HTMLElement).getByText('정')).toBeInTheDocument();
  });

  it('renders the Unassigned chip when a child row has no assignee', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [{ ...childTask, assignee_actor_id: null }] });
    renderPanel(linkedDetail);

    expect(await screen.findByText('Unassigned')).toBeInTheDocument();
  });

  // B2d fixup F2 — a non-null assignee id missing from the actor directory
  // (lookup pending or failed) still shows an explicit assigned indication:
  // the Task list/detail fallback 'Assigned' (TaskListRoute:124), never a
  // bare row. Resolving the map replaces the fallback with the avatar.
  it('falls back to Assigned while the actor name is unresolved, then the avatar once resolved', async () => {
    vi.mocked(getMilestone).mockResolvedValue(linkedDetail);
    vi.mocked(listTasks).mockResolvedValue({ items: [childTask] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MilestoneDetailPanel
          milestoneId={MILESTONE_ID}
          onClose={() => {}}
          actorNamesById={new Map()}
          managedSystemNamesById={MANAGED_SYSTEM_NAMES}
          analyticsAreaNamesById={AREA_NAMES}
        />
      </QueryClientProvider>,
    );

    const row = (await screen.findByText('Tasks · 1')).closest('[data-anchor="tasks"]');
    if (!row) throw new Error('tasks section not found');
    // The avatar renders the fallback name's initial; Unassigned stays
    // specific to a genuinely null assignment.
    expect(within(row as HTMLElement).getByText('A')).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText('Unassigned')).not.toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MilestoneDetailPanel
          milestoneId={MILESTONE_ID}
          onClose={() => {}}
          actorNamesById={ACTOR_NAMES}
          managedSystemNamesById={MANAGED_SYSTEM_NAMES}
          analyticsAreaNamesById={AREA_NAMES}
        />
      </QueryClientProvider>,
    );
    expect(within(row as HTMLElement).getByText('정')).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText('A')).not.toBeInTheDocument();
  });

  // G-columns (ADR-0050, choice a): the slot where the prototype shows
  // estimate (design §7 item 12) renders the Task due_date; no estimate
  // field is added to the Task contract.
  it('shows the task due date in the estimate slot and never the word estimate', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [childTask] });
    renderPanel(linkedDetail);

    const row = (await screen.findByText('Tasks · 1')).closest('[data-anchor="tasks"]');
    expect(row).toHaveTextContent('2026-06-15');
    expect(row).not.toHaveTextContent('estimate');
  });

  it('keeps the updated stamp on the child row', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [childTask] });
    renderPanel(linkedDetail);

    const row = (await screen.findByText('Tasks · 1')).closest('[data-anchor="tasks"]');
    expect(row).toHaveTextContent('updated 2026-07-21');
  });

  it('renders no Add task control in the Tasks section', async () => {
    vi.mocked(listTasks).mockResolvedValue({ items: [childTask] });
    renderPanel(linkedDetail);

    await screen.findByText('Tasks · 1');
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
  });

  // B2d fixup F1 — a denied child-list read is a permission-limited state,
  // not a general outage (frontend AGENTS: distinct permission-limited
  // states): the same ApiError(403) classification as TaskListRoute drives
  // the approved PermissionBlockedPanel inside the section.
  it('renders the permission blocked panel when the child read is denied', async () => {
    vi.mocked(listTasks).mockRejectedValue(
      new ApiError(403, { code: 'permission.denied', message: 'finding.manage required' }),
    );
    renderPanel(linkedDetail);

    expect(await screen.findByRole('heading', { name: 'Task list' })).toBeInTheDocument();
    expect(screen.getByText('finding.manage required')).toBeInTheDocument();
    // The generic outage copy never explains a 403.
    expect(screen.queryByText('Task list unavailable.')).not.toBeInTheDocument();
    // The milestone itself stays readable.
    expect(screen.getByRole('heading', { name: 'SSO Stabilization' })).toBeInTheDocument();
  });

  // B2d fixup F1 — the milestone and child reads have separate lifetimes:
  // after a successful child read, a denied refetch must clear the retained
  // count from the nav and section title (same terminal-error contract as
  // the milestone read, R2-1) before showing the blocked panel.
  it('clears the retained count when a successful child read is denied on refetch', async () => {
    vi.mocked(getMilestone).mockResolvedValue(linkedDetail);
    vi.mocked(listTasks).mockResolvedValueOnce({ items: [childTask] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MilestoneDetailPanel
          milestoneId={MILESTONE_ID}
          onClose={() => {}}
          actorNamesById={ACTOR_NAMES}
          managedSystemNamesById={MANAGED_SYSTEM_NAMES}
          analyticsAreaNamesById={AREA_NAMES}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Tasks · 1')).toBeInTheDocument();

    vi.mocked(listTasks).mockRejectedValue(
      new ApiError(403, { code: 'permission.denied', message: 'finding.manage required' }),
    );
    await queryClient.refetchQueries({ queryKey: ['tasks', { milestone_id: MILESTONE_ID }] });

    expect(await screen.findByRole('heading', { name: 'Task list' })).toBeInTheDocument();
    expect(screen.getByText('finding.manage required')).toBeInTheDocument();
    // Retained success data no longer feeds the nav entry or section count.
    expect(screen.queryByText('Tasks · 1')).not.toBeInTheDocument();
    const nav = screen.getByRole('button', { name: 'Overview' }).closest('div');
    if (!nav) throw new Error('section nav not found');
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual(['Overview', 'Tasks', 'Evidence', 'Activity']);
    // Rows and empty copy stay hidden: a denied read is not an empty success.
    expect(screen.queryByText('TASK-902')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 연결된 Task 가 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('Task list unavailable.')).not.toBeInTheDocument();
  });
});
