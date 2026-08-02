import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/analytics-areas', () => ({ fetchAnalyticsAreas: vi.fn() }));
vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { type AnalyticsAreaDto, fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { TriagePanel } from '../TriagePanel';

const IDS = {
  voc: '00000000-0000-4000-8000-000000000001',
  targetMs: '00000000-0000-4000-8000-000000000010',
  otherMs: '00000000-0000-4000-8000-000000000020',
  targetCurrent: '00000000-0000-4000-8000-000000000101',
  targetOther: '00000000-0000-4000-8000-000000000102',
  targetArchived: '00000000-0000-4000-8000-000000000103',
  targetArchivedOther: '00000000-0000-4000-8000-000000000104',
  otherOne: '00000000-0000-4000-8000-000000000201',
  otherTwo: '00000000-0000-4000-8000-000000000202',
} as const;

const VOC: VocListItem = {
  id: IDS.voc,
  display_id: 'VOC-B4',
  title: 'Analytics Area 배선 확인',
  primary_managed_system_id: IDS.targetMs,
  analytics_area_id: IDS.targetCurrent,
  reporter_id: '00000000-0000-4000-8000-000000000002',
  owner_user_id: null,
  owner_team_id: null,
  severity: null,
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-08-02T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
  similar_count: 0,
  attachment_count: 0,
};

function area(
  id: string,
  managedSystemId: string,
  name: string,
  slug: string,
  archivedAt: string | null = null,
): AnalyticsAreaDto {
  return {
    id,
    workspace_id: '00000000-0000-4000-8000-000000000999',
    managed_system_id: managedSystemId,
    slug,
    name,
    owner_team_id: null,
    archived_at: archivedAt,
    archived_by_actor_id: archivedAt ? '00000000-0000-4000-8000-000000000998' : null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

const AREAS = [
  area(IDS.targetCurrent, IDS.targetMs, '매출 운영 분석', 'revenue-ops'),
  area(IDS.targetOther, IDS.targetMs, '고객 여정 분석', 'customer-journey'),
  area(
    IDS.targetArchived,
    IDS.targetMs,
    '레거시 재무 분석',
    'legacy-finance',
    '2026-07-01T00:00:00.000Z',
  ),
  area(
    IDS.targetArchivedOther,
    IDS.targetMs,
    '종료된 캠페인 분석',
    'retired-campaign',
    '2026-07-02T00:00:00.000Z',
  ),
  area(IDS.otherOne, IDS.otherMs, '타 시스템 품질 분석', 'other-quality'),
  area(IDS.otherTwo, IDS.otherMs, '타 시스템 성장 분석', 'other-growth'),
];

function renderPanel(voc: VocListItem = VOC) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TriagePanel voc={voc} />
    </QueryClientProvider>,
  );
}

describe('TriagePanel Analytics Area and optional owner', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.mocked(fetchAnalyticsAreas).mockReset();
    vi.mocked(fetchAnalyticsAreas).mockResolvedValue({ items: AREAS, total: AREAS.length });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('AC-B4a renders only the selected Managed System active area name set', async () => {
    renderPanel();

    const picker = await screen.findByTestId('triage-aa-picker');
    const names = within(picker)
      .getAllByRole('radio')
      .map((option) => option.textContent);
    expect(new Set(names)).toEqual(new Set(['매출 운영 분석', '고객 여정 분석']));
    expect(screen.queryByRole('radio', { name: '타 시스템 품질 분석' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '타 시스템 성장 분석' })).not.toBeInTheDocument();
  });

  it('AC-B4b fetches Analytics Areas exactly once with the VOC Managed System id', async () => {
    renderPanel();

    await screen.findByTestId('triage-aa-picker');
    expect(fetchAnalyticsAreas).toHaveBeenCalledTimes(1);
    expect(fetchAnalyticsAreas).toHaveBeenCalledWith({
      managedSystemId: IDS.targetMs,
      includeArchived: true,
      signal: expect.any(AbortSignal),
    });
  });

  it('AC-B4c renders the current Analytics Area name instead of its id', async () => {
    renderPanel();

    const current = await screen.findByRole('radio', { name: '매출 운영 분석' });
    expect(current).toHaveAttribute('data-state', 'on');
    expect(screen.queryByText(IDS.targetCurrent)).not.toBeInTheDocument();
  });

  it('AC-B4d excludes archived areas except the current archived value', async () => {
    renderPanel({ ...VOC, analytics_area_id: IDS.targetArchived });

    const current = await screen.findByRole('radio', { name: '레거시 재무 분석 (보관됨)' });
    expect(current).toHaveAttribute('data-state', 'on');
    expect(
      screen.queryByRole('radio', { name: '종료된 캠페인 분석 (보관됨)' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '매출 운영 분석' })).toBeInTheDocument();
  });

  it('AC-B4e renders an explicit empty state when the Managed System has no areas', async () => {
    vi.mocked(fetchAnalyticsAreas).mockResolvedValue({ items: [], total: 0 });
    renderPanel({ ...VOC, analytics_area_id: null });

    expect(
      await screen.findByText('이 Managed System에 선택할 수 있는 Analytics Area가 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('triage-aa-picker')).not.toBeInTheDocument();
  });

  it('AC-B10a submits null owner ids while keeping the dirty confirm action enabled', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ updated_at: '2026-08-02T01:00:00.000Z' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;
    renderPanel({ ...VOC, analytics_area_id: null });
    fireEvent.click(screen.getByRole('button', { name: /Low/i }));

    const confirm = screen.getByRole('button', { name: /Triage 확정 & 다음 VOC/i });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(([, init]) => init?.method === 'PATCH'),
      ).toBe(true),
    );
    const patchCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    const body = JSON.parse(String(patchCall?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ owner_user_id: null, owner_team_id: null });
  });

  it('AC-B10b labels Owner as optional and explains that unassigned is valid', async () => {
    renderPanel();

    expect(screen.getByText('Owner 배정 (선택)')).toBeInTheDocument();
    expect(
      screen.getByText('미지정 상태로 확정할 수 있으며 Owner는 나중에 지정할 수 있습니다.'),
    ).toBeInTheDocument();
  });
});
