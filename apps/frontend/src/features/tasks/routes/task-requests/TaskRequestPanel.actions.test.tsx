import type { TaskDto, TaskRequestDto, TaskRequestStatus } from '@fops/shared';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useDecision, useConversion, useLink, useFindingDetail } = vi.hoisted(() => ({
  useDecision: vi.fn(),
  useConversion: vi.fn(),
  useLink: vi.fn(),
  useFindingDetail: vi.fn(),
}));

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({ useFindingDetail }));
vi.mock('./useTaskRequestDecision', () => ({ useTaskRequestDecision: useDecision }));
vi.mock('./useTaskRequestConversion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useTaskRequestConversion')>()),
  useTaskRequestConversion: useConversion,
}));
vi.mock('./useTaskRequestLink', () => ({ useTaskRequestLink: useLink }));
vi.mock('./useTaskRequestConvertedTaskLink', () => ({
  useTaskRequestConvertedTaskLink: () => ({ isSuccess: false, data: undefined }),
}));

import { TASK_REQUEST_STATUS_LABELS as STATUS_LABELS } from '@/lib/copy/enum-labels';
import { TaskRequestPanel } from './TaskRequestPanel';
import { formatDate } from './predicates';

const request: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-42',
  source_type: 'voc',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: '로그인 흐름에서 오류가 발생합니다.',
  requested_outcome: '로그인 오류를 수정합니다.',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};

const names = { actorsById: {}, managedSystemsById: {} };
const reviewerId = '20000000-0000-0000-0000-000000000003';
const decidedNames = {
  actorsById: { [reviewerId]: { id: reviewerId, display_name: '김지원' } },
  managedSystemsById: {},
};
const actions = ['승인', '근거 추가 요청', '반려', 'Task로 전환', '기존 Task 연결'];
const decidedAt = '2026-07-10T12:30:00.000Z';
const resultingTask: TaskDto = {
  id: '10000000-0000-0000-0000-000000000099',
  workspace_id: request.workspace_id,
  display_id: 'TASK-901',
  primary_managed_system_id: request.primary_managed_system_id,
  title: '로그인 오류 수정',
  status: 'backlog',
  priority: 'medium',
  assignee_actor_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: request.id,
  created_by: request.requester_actor_id,
  created_at: request.created_at,
  updated_at: request.updated_at,
};

function renderInRouter(item: TaskRequestDto) {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/tasks',
    component: () => (
      <TaskRequestPanel
        item={item}
        names={names}
        currentActorId={request.requester_actor_id}
        currentRole="developer"
        onClose={vi.fn()}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/tasks'] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  useFindingDetail.mockReturnValue({ data: undefined });
  useDecision.mockImplementation(({ item }: { item: TaskRequestDto }) => ({
    dialog: null,
    isSubmitting: false,
    isPending: false,
    isSelfApproval: false,
    canApprove: item.status === 'pending_review' || item.status === 'needs_more_evidence',
    canReject: item.status === 'pending_review' || item.status === 'needs_more_evidence',
    canRequestEvidence: item.status === 'pending_review',
    approve: vi.fn(),
    reject: vi.fn(),
    requestEvidence: vi.fn(),
    submitDecision: vi.fn(),
    changeValue: vi.fn(),
    close: vi.fn(),
  }));
  useConversion.mockImplementation(({ item }: { item: TaskRequestDto }) => ({
    open: false,
    canConvert: item.status === 'approved',
    result: null,
    setOpen: vi.fn(),
  }));
  useLink.mockImplementation(({ item }: { item: TaskRequestDto }) => ({
    open: false,
    canLinkExisting: item.status === 'approved',
    setOpen: vi.fn(),
    isTasksLoading: false,
    inScopeTasks: [],
    result: null,
    resultTaskRequestId: null,
    link: vi.fn(),
  }));
});

describe('TaskRequestPanel next actions', () => {
  it.each([
    ['pending', 'pending_review', ['승인', '근거 추가 요청', '반려']],
    ['approved', 'approved', ['Task로 전환', '기존 Task 연결']],
    ['converted', 'converted', []],
    ['rejected', 'rejected', []],
  ] as const)(
    'shows the current status and only valid next actions for %s requests',
    (_label, status: TaskRequestStatus, expectedActions) => {
      render(
        <TaskRequestPanel
          item={{ ...request, status }}
          names={names}
          currentActorId={request.requester_actor_id}
          currentRole="developer"
          onClose={vi.fn()}
        />,
      );

      expect(screen.getAllByText(STATUS_LABELS[status])).toHaveLength(
        status === 'converted' || status === 'rejected' ? 2 : 1,
      );
      expect(
        actions.filter((action) => screen.queryByRole('button', { name: action }) !== null),
      ).toEqual(expectedActions);
    },
  );

  it('makes Convert the full-width primary action and Link existing secondary when approved', () => {
    render(
      <TaskRequestPanel
        item={{ ...request, status: 'approved' }}
        names={names}
        currentActorId={request.requester_actor_id}
        currentRole="developer"
        onClose={vi.fn()}
      />,
    );

    const decisionSection = screen.getByText('검토 결정').closest('section');
    expect(decisionSection).not.toBeNull();
    const buttons = within(decisionSection as HTMLElement).getAllByRole('button');
    const convert = screen.getByRole('button', { name: 'Task로 전환' });
    const linkExisting = screen.getByRole('button', { name: '기존 Task 연결' });

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Task로 전환',
      '기존 Task 연결',
    ]);
    expect(convert).toHaveClass('bg-accent-primary', 'w-full');
    expect(linkExisting).toHaveClass('bg-surface-raised', 'w-full');
  });

  it('keeps only the form submit primary while the conversion form is open', () => {
    useConversion.mockReturnValue({
      open: true,
      canConvert: true,
      result: null,
      setOpen: vi.fn(),
      title: '로그인 오류를 수정합니다.',
      setTitle: vi.fn(),
      titleError: null,
      titleInputRef: { current: null },
      titleMaxLength: 200,
      priority: 'medium',
      setPriority: vi.fn(),
      assigneeId: '',
      setAssigneeId: vi.fn(),
      dueDate: '',
      setDueDate: vi.fn(),
      milestoneId: '',
      setMilestoneId: vi.fn(),
      milestones: [],
      milestonePickerError: null,
      milestoneSelectionUnavailable: false,
      analyticsAreaId: '',
      setAnalyticsAreaId: vi.fn(),
      analyticsAreas: [],
      submit: vi.fn(),
      isPending: false,
    });

    render(
      <TaskRequestPanel
        item={{ ...request, status: 'approved' }}
        names={names}
        currentActorId={request.requester_actor_id}
        currentRole="developer"
        onClose={vi.fn()}
      />,
    );

    const decisionSection = screen.getByText('검토 결정').closest('section') as HTMLElement;
    const submit = within(decisionSection).getByTestId('task-request-convert-submit');
    const primaryActions = within(decisionSection)
      .getAllByRole('button')
      .filter((button) => button.classList.contains('bg-accent-primary'));

    expect(primaryActions).toEqual([submit]);
    expect(within(decisionSection).getAllByRole('button', { name: 'Task로 전환' })[0]).toHaveClass(
      'bg-surface-raised',
    );
  });

  it.each([
    ['converted', 'converted', null],
    ['rejected', 'rejected', '중복 요청입니다.'],
  ] as const)(
    'shows a decided summary with status, reviewer, date, and optional reason for %s requests',
    (_label, status, reason) => {
      render(
        <TaskRequestPanel
          item={{
            ...request,
            status,
            reviewer_actor_id: reviewerId,
            decision_reason: reason,
            decided_at: decidedAt,
          }}
          names={decidedNames}
          currentActorId={request.requester_actor_id}
          currentRole="developer"
          onClose={vi.fn()}
        />,
      );

      const summary = document.querySelector('[data-anchor="outcome"]');
      expect(summary).not.toBeNull();
      expect(summary).toHaveTextContent('결정 요약');
      expect(within(summary as HTMLElement).getByText(STATUS_LABELS[status])).toBeInTheDocument();
      expect(within(summary as HTMLElement).getByText('김지원')).toBeInTheDocument();
      expect(summary).toHaveTextContent(formatDate(decidedAt));
      expect(screen.getByRole('button', { name: '결정 요약' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Decision' })).not.toBeInTheDocument();
      expect(screen.queryByText('검토 결정')).not.toBeInTheDocument();

      if (reason) {
        expect(within(summary as HTMLElement).getByText(reason)).toBeInTheDocument();
      } else {
        expect(within(summary as HTMLElement).queryByText('사유')).not.toBeInTheDocument();
      }
    },
  );

  it.each(['conversion', 'existing Task link'] as const)(
    'shows the resulting Task link when a converted request has a %s result',
    async (resultSource) => {
      if (resultSource === 'conversion') {
        useConversion.mockReturnValue({
          open: false,
          canConvert: false,
          result: resultingTask,
          setOpen: vi.fn(),
        });
      } else {
        useLink.mockReturnValue({
          open: false,
          canLinkExisting: false,
          setOpen: vi.fn(),
          isTasksLoading: false,
          inScopeTasks: [],
          result: { ...resultingTask, source_task_request_id: null },
          resultTaskRequestId: request.id,
          link: vi.fn(),
        });
      }

      renderInRouter({ ...request, status: 'converted' });

      const taskLink = await screen.findByRole('link', { name: /TASK-901/ });
      expect(taskLink).toHaveAttribute(
        'href',
        expect.stringContaining(`param=${resultingTask.id}`),
      );
      expect(screen.getByText('연결된 Task')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Task로 전환' })).not.toBeInTheDocument();
    },
  );
});
