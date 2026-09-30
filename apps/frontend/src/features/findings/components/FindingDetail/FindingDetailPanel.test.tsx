import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FindingDetailPanel } from './FindingDetailPanel';

const apiClientMock = vi.hoisted(() => vi.fn());
const findingSourceType = vi.hoisted(() => ({
  value: 'manual' as 'voc' | 'voc_cluster' | 'survey' | 'survey_response' | 'manual',
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
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
  useWorkspaceActors: () => ({
    actors: [{ id: '40000000-0000-0000-0000-000000000004', display_name: '분석가' }],
  }),
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

describe('FindingDetailPanel', () => {
  beforeEach(() => {
    findingSourceType.value = 'manual';
  });

  it.each([
    ['voc', 'VOC'],
    ['voc_cluster', 'VOC Cluster'],
    ['survey', 'Survey'],
    ['survey_response', 'Survey Response'],
    ['manual', 'Manual'],
  ] as const)('renders source type %s as %s without raw enum values', (sourceType, label) => {
    findingSourceType.value = sourceType;
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(sourceType, { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('중간')).toBeInTheDocument();
    expect(screen.queryByText('medium', { exact: true })).not.toBeInTheDocument();
  });

  it('renders finding display_id in the detail header and linked task display_id in the link chip', async () => {
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    expect(screen.getByText('FIN-179')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('TASK-901')).toBeInTheDocument();
    });
    expect(screen.queryByText(/10000000/)).not.toBeInTheDocument();
  });

  it('keeps one primary execution action and groups the remaining actions as secondary', () => {
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    const primaryGroup = screen.getByRole('group', { name: '주요 실행' });
    const secondaryGroup = screen.getByRole('group', { name: '보조 작업' });
    expect(within(primaryGroup).getAllByRole('button')).toHaveLength(1);
    expect(within(primaryGroup).getByRole('button', { name: 'Task 요청' })).toBeVisible();
    expect(within(secondaryGroup).getByRole('button', { name: 'Evidence 추가' })).toBeVisible();
    expect(
      within(secondaryGroup).getByRole('button', { name: '기존 Evidence 연결' }),
    ).toBeVisible();
    expect(within(secondaryGroup).getByRole('button', { name: '조치 불필요 표시' })).toBeVisible();
  });

  it('submits a Task Request from the inline draft card with the Finding contract fields', async () => {
    const user = userEvent.setup();
    apiClientMock.mockReset();
    apiClientMock.mockResolvedValue({ data: { id: 'task-request-1' } });
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    await user.click(screen.getByTestId('request-task-btn'));
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

    await user.click(screen.getByTestId('request-task-btn'));
    await user.type(screen.getByTestId('request-task-requested-outcome-input'), 'A only');
    rerender(panel('10000000-0000-0000-0000-000000000002'));

    expect(screen.getByText('FIN-180')).toBeInTheDocument();
    expect(screen.queryByTestId('request-task-draft')).not.toBeInTheDocument();
  });
});
