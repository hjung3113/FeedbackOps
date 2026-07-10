import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FindingDetailPanel } from './FindingDetailPanel';

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

vi.mock('@/features/admin/permissions/use-permission-check', () => ({
  usePermissionCheck: () => ({ data: { state: 'approved' } }),
}));

vi.mock('@/features/integration/hooks/useEvidenceHighlights', () => ({
  useEvidenceHighlights: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('@/features/integration/hooks/useFindingDetail', () => ({
  useFindingDetail: () => ({
    data: {
      id: '10000000-0000-0000-0000-000000000001',
      workspace_id: '90000000-0000-0000-0000-000000000009',
      display_id: 'FIN-179',
      primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
      title: '리포트 속도 저하',
      summary: '쿼리 플랜 개선 필요',
      source_type: 'manual',
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

vi.mock('@/features/integration/hooks/useFindingStatusMutation', () => ({
  useFindingStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/integration/hooks/useRequestTaskFromFinding', () => ({
  useRequestTaskFromFinding: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));

vi.mock('@/features/voc/hooks/useVocDetail', () => ({
  useVocDetail: () => ({ data: null }),
}));

vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({
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
  errorMapper: () => ({ message: 'mapped error' }),
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

describe('FindingDetailPanel display ids', () => {
  it('renders finding display_id in the detail header and linked task display_id in the link chip', async () => {
    renderWithClient(<FindingDetailPanel findingId="10000000-0000-0000-0000-000000000001" />);

    expect(screen.getByText('FIN-179')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('TASK-901')).toBeInTheDocument();
    });
    expect(screen.queryByText(/10000000/)).not.toBeInTheDocument();
  });
});
