import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { type FindingDto, listEntityLinksQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FindingDetailPanel } from './FindingDetailPanel';
import { FullFindingDetail } from './FullFindingDetail';

const apiClientMock = vi.hoisted(() => vi.fn());
const workspaceActors = vi.hoisted(() => ({
  actors: [] as Array<{ id: string; display_name: string }>,
}));
const findingSourceType = vi.hoisted(() => ({
  value: 'manual' as 'voc' | 'voc_cluster' | 'survey' | 'survey_response' | 'manual',
}));
const ORIGINAL_FETCH = globalThis.fetch;

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string>;
    className?: string;
  }) => (
    <a
      href={`${to}${search ? `?${new URLSearchParams(search).toString()}` : ''}`}
      className={className}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: () => ({ data: { state: 'approved' } }),
}));

vi.mock('@/features/findings/hooks/useEvidenceHighlights', () => ({
  useEvidenceHighlights: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: (findingId: string) => ({
    data: {
      id: findingId,
      workspace_id: '90000000-0000-0000-0000-000000000009',
      display_id: findingId.endsWith('2') ? 'FIN-180' : 'FIN-179',
      primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
      title: '리포트 속도 저하',
      summary: '쿼리 플랜 개선 필요',
      source_type: findingSourceType.value,
      source_id: null,
      evidence_count: 0,
      severity: 'high',
      confidence: 'medium',
      status: 'active',
      analytics_area_id: null,
      linked_task_id: '20000000-0000-0000-0000-000000000002',
      linked_milestone_id: null,
      created_by: '40000000-0000-0000-0000-000000000004',
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-10T00:00:00.000Z',
      source: null,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/features/findings/hooks/useFindingStatusMutation', () => ({
  useFindingStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/cross-system/useVocDetail', () => ({
  useVocDetail: () => ({ data: null }),
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: workspaceActors.actors }),
}));

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: '30000000-0000-0000-0000-000000000003', name: 'Billing Ops' }],
  })),
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { role_level: 'admin' } } }),
}));

vi.mock('@/lib/api', () => ({
  apiClient: apiClientMock,
  errorMapper: () => ({ message: 'mapped error' }),
  fetchTaskRequests: vi.fn(async () => ({ items: [] })),
  getTask: vi.fn(async () => ({
    id: '20000000-0000-0000-0000-000000000002',
    display_id: 'TASK-901',
    title: '매출 리포트 쿼리 플랜 개선',
  })),
  linkTaskToFinding: vi.fn(),
  listTasks: vi.fn(async () => ({ items: [] })),
  useIdempotencyKey: () => ({ key: 'idem-key', markConsumed: vi.fn() }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mediumFinding: FindingDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'FIN-179',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  title: '리포트 속도 저하',
  summary: '쿼리 플랜 개선 필요',
  source_type: 'manual',
  source_id: null,
  evidence_count: 0,
  severity: 'medium',
  confidence: 'medium',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: '40000000-0000-0000-0000-000000000004',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
};

describe('FindingDetailPanel', () => {
  beforeEach(() => {
    findingSourceType.value = 'manual';
    workspaceActors.actors = [
      { id: '40000000-0000-0000-0000-000000000004', display_name: '분석가' },
    ];
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('renders medium Finding severity as "중간" in the detail panel', () => {
    renderWithClient(<FullFindingDetail finding={mediumFinding} />);

    const panel = screen.getByTestId('finding-detail-panel');
    expect(panel.querySelector('[data-token="--severity-medium"]')).toHaveTextContent('중간');
  });

  // #679 FIX2: an unresolvable creator is unknown, not absent — the fallback must
  // not imply the Finding has no creator.
  it('falls back to 알 수 없는 사용자 when the creator is missing from actorsById', () => {
    workspaceActors.actors = [];
    renderWithClient(<FullFindingDetail finding={mediumFinding} />);

    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
  });

  it.each([
    ['voc', 'VOC'],
    ['voc_cluster', 'VOC Cluster'],
    ['survey', 'Survey'],
    ['survey_response', 'Survey 응답'],
    ['manual', '수동'],
  ] as const)('renders source type %s as %s without raw enum values', (sourceType, label) => {
    findingSourceType.value = sourceType;
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(sourceType, { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('중간')).toBeInTheDocument();
    expect(screen.queryByText('medium', { exact: true })).not.toBeInTheDocument();
  });

  it('renders the Finding title without duplicate horizontal padding', () => {
    const { container } = renderWithClient(
      <FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />,
    );

    const header = container.querySelector('[data-kind="finding"]');
    expect(header).toBeInTheDocument();
    expect(within(header as HTMLElement).getByText('FIN-179')).toBeInTheDocument();
    const findingTitle = screen.getByRole('heading', { name: '리포트 속도 저하' });
    expect(findingTitle).toBeInTheDocument();
    expect(findingTitle.parentElement).toHaveClass('px-0');
    expect(screen.getByText('FIN-179')).toBeInTheDocument();
    expect(screen.queryByText(/10000000/)).not.toBeInTheDocument();
  });

  it('keeps linked Task identity accessible and its move affordance on one line', async () => {
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    await waitFor(() => {
      const taskId = screen.getByText('TASK-901');
      expect(taskId).toHaveClass('whitespace-nowrap', 'shrink-0');
      const taskLink = screen.getByRole('link', {
        name: /매출 리포트 쿼리 플랜 개선.*TASK-901/,
      });
      expect(taskLink).toContainElement(taskId);
      expect(within(taskLink).getByText('이동')).toHaveClass('whitespace-nowrap', 'shrink-0');
    });
  });

  it('AC-681-2 shows an active pending Task Request and makes it the primary footer action', async () => {
    const taskRequestId = '10000000-0000-4000-8000-000000000077';
    const entityLinksPayload = {
      items: [
        {
          id: '50000000-0000-4000-8000-000000000077',
          source_type: 'finding',
          source_id: mediumFinding.id,
          target_type: 'task_request',
          target_id: taskRequestId,
          relation_type: 'requested_task',
          visibility: 'internal_only',
          status: 'active',
          managed_system_id: mediumFinding.primary_managed_system_id,
          created_by: '40000000-0000-0000-0000-000000000004',
          created_at: '2026-07-10T00:00:00.000Z',
          updated_at: null,
          visibility_state: 'allowed',
          target_summary: {
            type: 'task_request',
            id: taskRequestId,
            display_id: 'REQ-681',
            source_type: 'finding',
            source_id: mediumFinding.id,
            evidence_summary: '쿼리 플랜 개선 필요',
            requested_outcome: '쿼리 플랜을 검토합니다.',
            status: 'pending_review',
            primary_managed_system_id: mediumFinding.primary_managed_system_id,
            requester_actor_id: '40000000-0000-0000-0000-000000000004',
          },
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      return new Response(
        JSON.stringify(path === '/entity-links' ? entityLinksPayload : { items: [] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    globalThis.fetch = fetchMock;

    renderWithClient(<FullFindingDetail finding={mediumFinding} />);

    const requestLink = await screen.findByRole('link', { name: /REQ-681/ });
    expect(requestLink).toHaveTextContent(TASK_REQUEST_STATUS_LABELS.pending_review);
    expect(requestLink).toHaveAttribute('href', `/tasks?view=requests&param=${taskRequestId}`);

    const primaryGroup = screen.getByRole('group', { name: '주요 실행' });
    expect(within(primaryGroup).getByRole('link', { name: 'Task Request 보기' })).toHaveAttribute(
      'href',
      `/tasks?view=requests&param=${taskRequestId}`,
    );
    expect(
      within(primaryGroup).queryByRole('button', { name: 'Task 요청' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '보조 작업' })).toHaveTextContent('Task 요청');

    const entityLinksUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((input) => new URL(input, 'http://localhost').pathname === '/entity-links');
    expect(entityLinksUrl).toBeDefined();
    if (entityLinksUrl === undefined) throw new Error('Expected the entity-links read.');
    const url = new URL(entityLinksUrl, 'http://localhost');
    expect(url.pathname).toBe('/entity-links');
    expect(url.searchParams.get('source_type')).toBe('finding');
    expect(url.searchParams.get('source_id')).toBe(mediumFinding.id);
    expect(url.searchParams.has('relation_type')).toBe(false);
    expect(listEntityLinksQuerySchema.safeParse(Object.fromEntries(url.searchParams)).success).toBe(
      true,
    );
  });

  it.each(['stays on retry', 'moves to another control'] as const)(
    'AC-681-2 shows an unknown state after a failed read and retries to the existing pending request when focus %s',
    async (focusBehavior) => {
      const taskRequestId = '10000000-0000-4000-8000-000000000078';
      const pendingPayload = {
        items: [
          {
            id: '50000000-0000-4000-8000-000000000078',
            source_type: 'finding',
            source_id: mediumFinding.id,
            target_type: 'task_request',
            target_id: taskRequestId,
            relation_type: 'requested_task',
            visibility: 'internal_only',
            status: 'active',
            managed_system_id: mediumFinding.primary_managed_system_id,
            created_by: '40000000-0000-0000-0000-000000000004',
            created_at: '2026-07-10T00:00:00.000Z',
            updated_at: null,
            visibility_state: 'allowed',
            target_summary: {
              type: 'task_request',
              id: taskRequestId,
              display_id: 'REQ-682',
              source_type: 'finding',
              source_id: mediumFinding.id,
              evidence_summary: '쿼리 플랜 개선 필요',
              requested_outcome: '쿼리 플랜을 검토합니다.',
              status: 'pending_review',
              primary_managed_system_id: mediumFinding.primary_managed_system_id,
              requester_actor_id: '40000000-0000-0000-0000-000000000004',
            },
          },
        ],
      };
      let settleFailedRead: (response: Response) => void = () => undefined;
      const failedRead = new Promise<Response>((resolve) => {
        settleFailedRead = resolve;
      });
      let settleRetryRead: (response: Response) => void = () => undefined;
      const retryRead = new Promise<Response>((resolve) => {
        settleRetryRead = resolve;
      });
      let entityLinkReads = 0;
      globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input), 'http://localhost').pathname;
        if (path === '/entity-links') {
          entityLinkReads += 1;
          if (entityLinkReads === 1) return failedRead;
          return retryRead;
        }
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

      renderWithClient(<FullFindingDetail finding={mediumFinding} />);

      const initialCheckingMessage = await screen.findByText('확인 중…');
      expect(initialCheckingMessage).toHaveClass('text-text-muted');
      settleFailedRead(
        new Response(JSON.stringify({ message: 'Entity links unavailable.' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const failureMessage = await screen.findByRole('alert');
      expect(failureMessage).toHaveTextContent('Task Request를 확인하지 못했습니다.');
      expect(failureMessage).toHaveClass('text-text-danger');
      expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: '주요 실행' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('request-task-btn')).not.toBeInTheDocument();

      const user = userEvent.setup();
      const retryButton = screen.getByRole('button', { name: '다시 시도' });
      retryButton.focus();
      expect(document.activeElement).toBe(retryButton);
      await user.keyboard('{Enter}');

      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toHaveAttribute('aria-disabled', 'true');
      expect(retryButton).toHaveAttribute('aria-busy', 'true');
      expect(document.activeElement).toBe(retryButton);
      const movedControl = screen.getByTestId('add-evidence-btn');
      if (focusBehavior === 'moves to another control') {
        await user.tab();
        expect(movedControl).toHaveFocus();
      }
      settleRetryRead(
        new Response(JSON.stringify(pendingPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const requestLink = await screen.findByRole('link', { name: /REQ-682/ });
      if (focusBehavior === 'stays on retry') {
        await waitFor(() => expect(document.activeElement).toBe(requestLink));
      } else {
        expect(movedControl).toHaveFocus();
      }
      expect(requestLink).toHaveTextContent(TASK_REQUEST_STATUS_LABELS.pending_review);
      expect(
        within(screen.getByRole('group', { name: '주요 실행' })).getByRole('link', {
          name: 'Task Request 보기',
        }),
      ).toHaveAttribute('href', `/tasks?view=requests&param=${taskRequestId}`);
    },
  );

  it('keeps one primary execution action and groups the remaining actions as secondary', async () => {
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    await screen.findByTestId('request-task-btn');
    const primaryGroup = screen.getByRole('group', { name: '주요 실행' });
    const secondaryGroup = screen.getByRole('group', { name: '보조 작업' });
    expect(within(primaryGroup).getAllByRole('button')).toHaveLength(1);
    const taskRequest = within(primaryGroup).getByRole('button', { name: 'Task 요청' });
    expect(taskRequest).toBeVisible();
    expect(taskRequest).toHaveClass('bg-accent-primary', 'text-text-on-accent');

    const secondaryActions = [
      within(secondaryGroup).getByRole('button', { name: 'Evidence 추가' }),
      within(secondaryGroup).getByRole('button', { name: '기존 Evidence 연결' }),
      within(secondaryGroup).getByRole('button', { name: '조치 불필요 표시' }),
    ];
    for (const action of secondaryActions) {
      expect(action).toBeVisible();
      expect(action).toHaveClass('bg-transparent');
      expect(action).not.toHaveClass('bg-accent-primary');
    }
  });

  it('submits a Task Request from the inline draft card with the Finding contract fields', async () => {
    const user = userEvent.setup();
    apiClientMock.mockReset();
    apiClientMock.mockResolvedValue({ data: { id: 'task-request-1' } });
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    await user.click(await screen.findByTestId('request-task-btn'));
    const draft = await screen.findByRole('region', { name: 'Task Request 초안' });
    expect(draft).toHaveTextContent('출처 FIN-179 · Finding');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.type(
      screen.getByTestId('request-task-requested-outcome-input'),
      'Improve the report query plan',
    );
    await user.click(screen.getByTestId('request-task-submit'));

    await waitFor(() =>
      expect(apiClientMock).toHaveBeenCalledWith(
        'POST',
        '/findings/10000000-0000-0000-0000-000000000001/request-task',
        expect.objectContaining({
          body: {
            evidence_summary: '쿼리 플랜 개선 필요',
            requested_outcome: 'Improve the report query plan',
          },
          idempotencyKey: 'idem-key',
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('request-task-draft')).not.toBeInTheDocument());
  });

  it('drops an open draft when the selection moves to another Finding', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const panel = (findingId: string) => (
      <QueryClientProvider client={queryClient}>
        <FindingDetailPanel findingId={findingId} />
      </QueryClientProvider>
    );
    const { rerender } = render(panel('10000000-0000-0000-0000-000000000001'));

    await user.click(await screen.findByTestId('request-task-btn'));
    await user.type(screen.getByTestId('request-task-requested-outcome-input'), 'A only');
    rerender(panel('10000000-0000-0000-0000-000000000002'));

    expect(screen.getByText('FIN-180')).toBeInTheDocument();
    expect(screen.queryByTestId('request-task-draft')).not.toBeInTheDocument();
  });
});
