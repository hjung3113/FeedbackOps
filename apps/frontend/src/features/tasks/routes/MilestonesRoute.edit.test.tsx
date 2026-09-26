import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import {
  createMilestone,
  getMilestone,
  listMilestones,
  updateMilestone,
} from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import type { MilestoneDetailDto, MilestoneDto } from '@fops/shared';
import { DetailPanelSlotContext } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestonesRoute } from './MilestonesRoute';

// #514 B2e — create and edit without status. Create is the same property block
// in a create state, opened by the New milestone toolbar control; the body
// carries the chosen Managed System as primary_managed_system_id and never a
// status. Edit is a title-only PATCH with If-Match; a 409 conflict.stale_write
// refetches the milestone and shows the server title.

// Shared across renders so tests can assert where selection sends the actor.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [
      { id: IDS.ownerU1, display_name: '김지원', kind: 'user' },
      { id: IDS.ownerU2, display_name: '박서연', kind: 'user' },
    ],
  }),
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({ items: [POWER_BI], total: 1 })),
}));

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [PRODUCT_USAGE], total: 1 })),
}));

vi.mock('@/lib/api/milestones', () => ({
  listMilestones: vi.fn(async () => ({ items: MILESTONES })),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
}));

const IDS = {
  workspace: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  msPowerBi: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1',
  areaProduct: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a1',
  ownerU1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
  ownerU2: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
  sso: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1021',
  created: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1099',
};

const LOOKUP_TIMESTAMP = '2026-07-01T00:00:00.000Z';

const POWER_BI = {
  id: IDS.msPowerBi,
  workspace_id: IDS.workspace,
  slug: 'powerbi',
  name: 'Power BI',
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: LOOKUP_TIMESTAMP,
  updated_at: LOOKUP_TIMESTAMP,
};

const PRODUCT_USAGE = {
  id: IDS.areaProduct,
  workspace_id: IDS.workspace,
  managed_system_id: IDS.msPowerBi,
  slug: 'product-usage',
  name: 'Product Usage',
  owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: LOOKUP_TIMESTAMP,
  updated_at: LOOKUP_TIMESTAMP,
};

const UPDATED_AT = '2026-07-21T08:30:00.000Z';

const SSO_ROW: MilestoneDto = {
  id: IDS.sso,
  workspace_id: IDS.workspace,
  display_id: 'MLS-1021',
  primary_managed_system_id: IDS.msPowerBi,
  title: 'SSO Stabilization',
  why: 'SSO 세션 만료 후 재인증 흐름이 없습니다.',
  status: 'in_progress',
  owner_actor_id: IDS.ownerU2,
  analytics_area_id: IDS.areaProduct,
  start_date: '2026-05-10',
  target_date: '2026-06-15',
  created_by: IDS.ownerU2,
  created_at: '2026-07-21T01:00:00.000Z',
  updated_at: UPDATED_AT,
  progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
};

const MILESTONES: MilestoneDto[] = [SSO_ROW];

function detailFor(row: MilestoneDto, title: string): MilestoneDetailDto {
  return { ...row, title, source_finding: null };
}

function createdRow(): MilestoneDto {
  return {
    ...SSO_ROW,
    id: IDS.created,
    display_id: 'MLS-1099',
    title: 'Launch review hardening',
    status: 'planning',
    analytics_area_id: null,
    owner_actor_id: IDS.ownerU1,
    created_by: IDS.ownerU1,
    progress: { released_done: 0, in_flight: 0, queued: 0, total: 0, percent: 0 },
  };
}

// The route forwards its detail slot to AppFrame; tests mirror AppFrame's
// host by rendering whatever the shell registers (permission-request-detail
// test pattern) so the panel content is assertable without the full frame.
function DetailPanelHost({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = React.useState<React.ReactNode>();
  const setContent = React.useCallback((_key: string, node: React.ReactNode) => setPanel(node), []);
  const clear = React.useCallback(() => setPanel(undefined), []);
  const context = React.useMemo(() => ({ setContent, clear }), [setContent, clear]);
  return (
    <DetailPanelSlotContext.Provider value={context}>
      {children}
      {panel}
    </DetailPanelSlotContext.Provider>
  );
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DetailPanelHost>{ui}</DetailPanelHost>
    </QueryClientProvider>,
  );
}

// The backend accepts RFC4122 v4 keys; the exact set is enforced by
// src/lib/api/__tests__/idempotency.test.ts.
const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fillCreateForm(managedSystemId: string): void {
  fireEvent.change(screen.getByLabelText('Managed System'), {
    target: { value: managedSystemId },
  });
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Launch review hardening' },
  });
  fireEvent.change(screen.getByLabelText('Why this milestone exists'), {
    target: { value: '출시 리뷰 전 필수 정리 항목입니다.' },
  });
  fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-08-01' } });
  fireEvent.change(screen.getByLabelText('Target'), { target: { value: '2026-09-01' } });
}

beforeEach(() => {
  vi.mocked(listMilestones).mockReset();
  vi.mocked(listMilestones).mockImplementation(async () => ({ items: MILESTONES }));
  vi.mocked(fetchManagedSystems).mockReset();
  vi.mocked(fetchManagedSystems).mockImplementation(async () => ({
    items: [POWER_BI],
    total: 1,
  }));
  vi.mocked(fetchAnalyticsAreas).mockReset();
  vi.mocked(fetchAnalyticsAreas).mockImplementation(async () => ({
    items: [PRODUCT_USAGE],
    total: 1,
  }));
  vi.mocked(getMilestone).mockReset();
  vi.mocked(createMilestone).mockReset();
  vi.mocked(updateMilestone).mockReset();
  navigateMock.mockReset();
});

describe('MilestonesRoute create (#514 B2e)', () => {
  it('submits the chosen Managed System as primary_managed_system_id, no managed_system_id, no status, with an idempotency key', async () => {
    vi.mocked(createMilestone).mockResolvedValue(createdRow());
    vi.mocked(getMilestone).mockResolvedValue(detailFor(createdRow(), 'Launch review hardening'));
    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');

    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();
    fillCreateForm(IDS.msPowerBi);
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));

    await waitFor(() => expect(vi.mocked(createMilestone)).toHaveBeenCalledTimes(1));
    const createCall = vi.mocked(createMilestone).mock.calls[0];
    if (!createCall) throw new Error('createMilestone call missing');
    const [body, idempotencyKey] = createCall;
    // Exact body — proves managed_system_id and status never ride along and
    // that the optional owner/Analytics Area fields stay off when unset.
    expect(body).toEqual({
      title: 'Launch review hardening',
      why: '출시 리뷰 전 필수 정리 항목입니다.',
      primary_managed_system_id: IDS.msPowerBi,
      start_date: '2026-08-01',
      target_date: '2026-09-01',
    });
    expect(idempotencyKey).toMatch(UUID_KEY);
  });

  it('selects the created id via param and preserves the Managed System scope', async () => {
    vi.mocked(createMilestone).mockResolvedValue(createdRow());
    vi.mocked(getMilestone).mockResolvedValue(detailFor(createdRow(), 'Launch review hardening'));
    renderWithClient(<MilestonesRoute managedSystem={IDS.msPowerBi} />);
    await screen.findByText('MLS-1021');

    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();
    fillCreateForm(IDS.msPowerBi);
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/tasks',
          search: { view: 'milestones', param: IDS.created, managedSystem: IDS.msPowerBi },
        }),
      );
    });
    // The create block hands over to the detail panel for the new id.
    expect(
      await screen.findByRole('heading', { name: 'Launch review hardening' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('milestone-create-panel')).not.toBeInTheDocument();
  });
});

describe('MilestonesRoute edit title (#514 B2e)', () => {
  it('keeps Managed System read-only while editing and PATCHes the title only with If-Match and an idempotency key', async () => {
    vi.mocked(getMilestone)
      .mockResolvedValueOnce(detailFor(SSO_ROW, 'SSO Stabilization'))
      .mockResolvedValue(detailFor(SSO_ROW, 'SSO Stabilization v2'));
    vi.mocked(updateMilestone).mockResolvedValue({ ...SSO_ROW, title: 'SSO Stabilization v2' });
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    // Read view: no input anywhere, Managed System stays stored text.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));

    // Edit state: only the title becomes an input — no Managed System control.
    const titleInput = screen.getByRole('textbox', { name: 'Title' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getAllByText('Power BI').length).toBeGreaterThan(0);

    fireEvent.change(titleInput, { target: { value: 'SSO Stabilization v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(vi.mocked(updateMilestone)).toHaveBeenCalledTimes(1));
    const patchCall = vi.mocked(updateMilestone).mock.calls[0];
    if (!patchCall) throw new Error('updateMilestone call missing');
    const [id, body, options] = patchCall;
    expect(id).toBe(IDS.sso);
    // Title only — never primary_managed_system_id, never status.
    expect(body).toEqual({ title: 'SSO Stabilization v2' });
    expect(options.ifMatch).toBe(UPDATED_AT);
    expect(options.idempotencyKey).toMatch(UUID_KEY);

    // The stored title returns through the refetched detail read.
    expect(
      await screen.findByRole('heading', { name: 'SSO Stabilization v2' }),
    ).toBeInTheDocument();
  });

  it('refetches the milestone and shows the server title on 409 conflict.stale_write', async () => {
    vi.mocked(getMilestone)
      .mockResolvedValueOnce(detailFor(SSO_ROW, 'SSO Stabilization'))
      .mockResolvedValue(detailFor(SSO_ROW, 'Renamed on another device'));
    vi.mocked(updateMilestone).mockRejectedValue(
      new ApiError(409, {
        code: 'conflict.stale_write',
        message: 'Milestone was modified by another actor.',
      }),
    );
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'My local rename' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The stale write drops the typed title, refetches, and shows the server row.
    await waitFor(() => expect(vi.mocked(getMilestone)).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('heading', { name: 'Renamed on another device' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SSO Stabilization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My local rename' })).not.toBeInTheDocument();
  });
});
