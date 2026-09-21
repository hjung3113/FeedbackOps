// useFindingDetailController.test.tsx — #399 step B controller coverage.
//
// renderHook + QueryClientProvider; cross-system hooks and @/lib/api are
// mocked with the same conventions as FindingDetailPanel.test.tsx. Negative
// assertions are paired with positive twins so a broken mock or query wiring
// cannot pass vacuously.

import type { PermissionCheckResponse } from '@/lib/api';
import { apiClient, getTask } from '@/lib/api';
import type { MeResponse } from '@/lib/auth/useMe';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import type { VocDetailResult } from '@/lib/cross-system/useVocDetail';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import type { FindingDto, TaskDetailDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFindingDetailController } from './useFindingDetailController';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const IDS = vi.hoisted(() => ({
  finding: '10000000-0000-0000-0000-000000000001',
  workspace: '90000000-0000-0000-0000-000000000009',
  managedSystem: '30000000-0000-0000-0000-000000000003',
  task: '20000000-0000-0000-0000-000000000002',
  actor: '40000000-0000-0000-0000-000000000004',
  voc: '50000000-0000-0000-0000-000000000005',
}));

vi.mock('@/lib/api', () => ({
  errorMapper: () => ({ message: 'mapped error' }),
  getTask: vi.fn(),
  apiClient: vi.fn(),
  useIdempotencyKey: () => ({ key: 'idem-key', markConsumed: vi.fn() }),
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: IDS.managedSystem, name: 'Billing Ops', archived_at: null }],
  })),
}));

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({ usePermissionCheck: vi.fn() }));

vi.mock('@/lib/cross-system/useVocDetail', () => ({ useVocDetail: vi.fn() }));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: vi.fn(() => ({
    actors: [{ id: IDS.actor, display_name: '분석가' }],
  })),
}));

const FINDING_LINKED: FindingDto = {
  id: IDS.finding,
  workspace_id: IDS.workspace,
  display_id: 'FIN-179',
  primary_managed_system_id: IDS.managedSystem,
  title: '리포트 속도 저하',
  summary: '쿼리 플랜 개선 필요',
  source_type: 'manual',
  source_id: null,
  evidence_count: 0,
  severity: 'high',
  confidence: 'medium',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: IDS.task,
  linked_milestone_id: null,
  created_by: IDS.actor,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
};

const FINDING_UNLINKED: FindingDto = { ...FINDING_LINKED, linked_task_id: null };

const FINDING_FROM_VOC: FindingDto = {
  ...FINDING_LINKED,
  source_type: 'voc',
  source_id: IDS.voc,
};

const TASK_DETAIL = {
  id: IDS.task,
  title: '매출 리포트 쿼리 플랜 개선',
  display_id: 'TASK-901',
} as TaskDetailDto;

function mockPermissionGate(opts: {
  role: 'admin' | 'user';
  state: 'approved' | 'denied';
}): void {
  vi.mocked(useMe).mockReturnValue({
    data: { actor: { role_level: opts.role } },
  } as unknown as UseQueryResult<MeResponse>);
  vi.mocked(usePermissionCheck).mockReturnValue({
    data: { state: opts.state },
  } as unknown as UseQueryResult<PermissionCheckResponse>);
}

function renderController(finding: FindingDto) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const setDataSpy = vi.spyOn(client, 'setQueryData');
  const view = renderHook(() => useFindingDetailController(finding), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, invalidateSpy, setDataSpy };
}

describe('useFindingDetailController', () => {
  beforeEach(() => {
    vi.mocked(getTask).mockReset();
    vi.mocked(getTask).mockResolvedValue(TASK_DETAIL);
    vi.mocked(apiClient).mockReset();
    vi.mocked(apiClient).mockResolvedValue({ data: FINDING_LINKED } as never);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(useVocDetail).mockReturnValue({
      data: null,
    } as unknown as UseQueryResult<VocDetailResult>);
    mockPermissionGate({ role: 'user', state: 'approved' });
  });

  it('permission allowed: non-admin actor with an approved check passes the manage gate', () => {
    const { result } = renderController(FINDING_LINKED);
    expect(result.current.canManage).toBe(true);
    expect(result.current.markNotActionableDisabled).toBe(false);
    expect(result.current.sections).toHaveLength(6);
  });

  it('permission denied: gated action flags go false (positive twin above proves the gate)', () => {
    mockPermissionGate({ role: 'user', state: 'denied' });
    const { result } = renderController(FINDING_LINKED);
    expect(result.current.canManage).toBe(false);
    expect(result.current.markNotActionableDisabled).toBe(true);
  });

  it('admin short-circuit grants the manage gate even when the check is denied', () => {
    mockPermissionGate({ role: 'admin', state: 'denied' });
    const { result } = renderController(FINDING_LINKED);
    expect(result.current.canManage).toBe(true); // admin short-circuit, as before
  });

  it('no linked-task query is issued when linked_task_id is null (twin test proves the spy fires)', async () => {
    const { result } = renderController(FINDING_UNLINKED);
    await waitFor(() =>
      expect(result.current.managedSystemsById.get(IDS.managedSystem)).toBe('Billing Ops'),
    );
    expect(getTask).not.toHaveBeenCalled();
    expect(result.current.linkedTaskQuery.data).toBeUndefined();
  });

  it('linked-task query is issued once and fills display data when linked_task_id is set', async () => {
    const { result } = renderController(FINDING_LINKED);
    await waitFor(() =>
      expect(result.current.linkedTaskQuery.data?.title).toBe('매출 리포트 쿼리 플랜 개선'),
    );
    expect(getTask).toHaveBeenCalledTimes(1);
    expect(getTask).toHaveBeenCalledWith(IDS.task, expect.anything());
    expect(result.current.linkedTaskQuery.data?.display_id).toBe('TASK-901');
  });

  it('linked-task fetch is id-gated, not permission-gated (preserved semantics)', async () => {
    mockPermissionGate({ role: 'user', state: 'denied' });
    const { result } = renderController(FINDING_LINKED);
    await waitFor(() => expect(getTask).toHaveBeenCalledTimes(1));
    expect(result.current.canManage).toBe(false);
  });

  it('linked VOC title/display fall through from the shared voc query', async () => {
    vi.mocked(useVocDetail).mockReturnValue({
      data: { id: IDS.voc, title: '연관 VOC', display_id: 'VOC-77' },
    } as unknown as UseQueryResult<VocDetailResult>);
    const { result } = renderController(FINDING_FROM_VOC);
    await waitFor(() => expect(result.current.linkedVocTitle).toBe('연관 VOC'));
    expect(result.current.linkedVocDisplayId).toBe('VOC-77');
    expect(useVocDetail).toHaveBeenCalledWith(IDS.voc);
  });

  it.each([
    ['addEvidenceOpen', 'setAddEvidenceOpen'],
    ['linkEvidenceOpen', 'setLinkEvidenceOpen'],
    ['requestTaskOpen', 'setRequestTaskOpen'],
    ['linkTaskOpen', 'setLinkTaskOpen'],
  ] as const)('%s toggles open and closed', (openKey, setKey) => {
    const { result } = renderController(FINDING_LINKED);
    expect(result.current[openKey]).toBe(false);
    act(() => {
      result.current[setKey](true);
    });
    expect(result.current[openKey]).toBe(true);
    act(() => {
      result.current[setKey](false);
    });
    expect(result.current[openKey]).toBe(false);
  });

  it('mark-not-actionable success sets + invalidates exactly the finding query and toasts', async () => {
    const { result, invalidateSpy, setDataSpy } = renderController(FINDING_LINKED);
    act(() => {
      result.current.handleMarkNotActionable();
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Finding이 조치 불필요로 표시되었습니다.'),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['finding', IDS.finding] });
    expect(setDataSpy).toHaveBeenCalledWith(
      ['finding', IDS.finding],
      expect.objectContaining({ id: IDS.finding }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});
