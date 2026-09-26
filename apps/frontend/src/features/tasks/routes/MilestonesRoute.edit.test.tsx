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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestonesRoute } from './MilestonesRoute';

// #514 B2e — create and edit. Create is the same property block in a create
// state, opened by the New milestone toolbar control; the body carries the
// chosen Managed System as primary_managed_system_id. Edit is a title-only
// PATCH with If-Match; a 409 conflict.stale_write refetches the milestone and
// shows the server title. B2e-status (ADR-0050) adds the Properties Status
// control: a four-value select whose change PATCHes { status } with If-Match.

// Shared across renders so tests can assert where selection sends the actor.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [
      { id: IDS.ownerU1, display_name: '김지원', kind: 'user', role_level: 'admin' },
      { id: IDS.ownerU2, display_name: '박서연', kind: 'user', role_level: 'user' },
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

// Astra finding 4 — create options must carry the ownership/archive metadata
// the API validates on create: archived systems get 409 conflict.parent_archived,
// areas of another system get 422 out_of_scope, archived areas get 409
// parent_archived (docs/implementation/api/milestones.md).
const IDS_F4 = {
  msErp: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c2',
  msArchived: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c3',
  areaErp: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a2',
  areaArchived: 'dddddddd-dddd-4ddd-8ddd-dddddddd00a3',
};

const ERP = {
  ...POWER_BI,
  id: IDS_F4.msErp,
  slug: 'erp',
  name: 'ERP',
};

const ARCHIVED_MS = {
  ...POWER_BI,
  id: IDS_F4.msArchived,
  slug: 'legacy-warehouse',
  name: 'Legacy Warehouse',
  archived_at: '2026-07-02T00:00:00.000Z',
  archived_by_actor_id: IDS.ownerU1,
};

const ERP_USAGE = {
  ...PRODUCT_USAGE,
  id: IDS_F4.areaErp,
  managed_system_id: IDS_F4.msErp,
  slug: 'erp-usage',
  name: 'ERP Usage',
};

const ARCHIVED_AREA = {
  ...PRODUCT_USAGE,
  id: IDS_F4.areaArchived,
  slug: 'legacy-funnel',
  name: 'Legacy Funnel',
  archived_at: '2026-07-03T00:00:00.000Z',
  archived_by_actor_id: IDS.ownerU1,
};

function mockLookupsForF4(): void {
  vi.mocked(fetchManagedSystems).mockImplementation(async () => ({
    items: [POWER_BI, ERP, ARCHIVED_MS],
    total: 3,
  }));
  vi.mocked(fetchAnalyticsAreas).mockImplementation(async () => ({
    items: [PRODUCT_USAGE, ERP_USAGE, ARCHIVED_AREA],
    total: 3,
  }));
}

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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DetailPanelHost>{ui}</DetailPanelHost>
    </QueryClientProvider>,
  );
  return { view, queryClient };
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

    // Read view: the B2e-status control is the only combobox; Managed System
    // stays stored text.
    expect(screen.queryByRole('combobox', { name: 'Managed System' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));

    // Edit state: the title becomes an input — still no Managed System control.
    const titleInput = screen.getByRole('textbox', { name: 'Title' });
    expect(screen.queryByRole('combobox', { name: 'Managed System' })).not.toBeInTheDocument();
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

// #514 B2e fixup — create mode must not mask selection, and dirty forms must
// confirm before the header close discards them (ui-design-system dirty-form
// rule). All other B2e create/edit behavior is covered above.
describe('MilestonesRoute fixup (#514 B2e)', () => {
  it('replaces create state with the selected record and keeps the Managed System scope', async () => {
    vi.mocked(getMilestone).mockResolvedValue(detailFor(SSO_ROW, 'SSO Stabilization'));
    renderWithClient(<MilestonesRoute managedSystem={IDS.msPowerBi} />);
    await screen.findByText('MLS-1021');

    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();

    // Selecting an existing row while create is open hands the slot over.
    fireEvent.click(screen.getByText('SSO Stabilization'));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/tasks',
          search: { view: 'milestones', param: IDS.sso, managedSystem: IDS.msPowerBi },
        }),
      );
    });
    expect(await screen.findByRole('heading', { name: 'SSO Stabilization' })).toBeInTheDocument();
    expect(screen.queryByTestId('milestone-create-panel')).not.toBeInTheDocument();
  });

  it('confirms before discarding dirty create and title-edit drafts on header close', async () => {
    // Dirty create form: decline keeps the panel and draft, confirm discards.
    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');
    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Draft to discard' } });

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-create-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    expect(screen.getByTestId('milestone-create-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Draft to discard');

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    fireEvent.click(await screen.findByRole('button', { name: '이동' }));
    await waitFor(() => {
      expect(screen.queryByTestId('milestone-create-panel')).not.toBeInTheDocument();
    });

    cleanup();

    // Dirty title edit: same confirm flow on the detail panel header close.
    vi.mocked(getMilestone).mockResolvedValue(detailFor(SSO_ROW, 'SSO Stabilization'));
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Draft rename' },
    });

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft rename');

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    fireEvent.click(await screen.findByRole('button', { name: '이동' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'SSO Stabilization' })).not.toBeInTheDocument();
    });
  });
});

// #514 B2e-status (ADR-0050) — the Properties Status control offers exactly
// the persisted set planning | in_progress | blocked | released and PATCH is
// free among them, so no transition here is forbidden. A change PATCHes
// { status } with If-Match (the row's updated_at) and a fresh idempotency key
// and never carries primary_managed_system_id. An error keeps the prior
// status locally; a stale write refetches and shows the server row.
describe('MilestonesRoute status (#514 B2e-status)', () => {
  const statusSelect = () => screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement;

  it('offers exactly the ADR-0050 set with the prototype labels', async () => {
    vi.mocked(getMilestone).mockResolvedValue(detailFor(SSO_ROW, 'SSO Stabilization'));
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    expect(Array.from(statusSelect().options).map((option) => option.value)).toEqual([
      'planning',
      'in_progress',
      'blocked',
      'released',
    ]);
    // Labels verbatim from MILESTONE_STATUS_META in screen-milestones.jsx.
    expect(Array.from(statusSelect().options).map((option) => option.textContent)).toEqual([
      'Planning',
      'In progress',
      'Blocked',
      'Released',
    ]);
    expect(statusSelect()).toHaveValue('in_progress');
  });

  it('PATCHes { status } only, with If-Match and an idempotency key, and refetches the stored row', async () => {
    vi.mocked(getMilestone)
      .mockResolvedValueOnce(detailFor(SSO_ROW, 'SSO Stabilization'))
      .mockResolvedValue(detailFor({ ...SSO_ROW, status: 'released' }, 'SSO Stabilization'));
    vi.mocked(updateMilestone).mockResolvedValue({ ...SSO_ROW, status: 'released' });
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    fireEvent.change(statusSelect(), { target: { value: 'released' } });

    await waitFor(() => expect(vi.mocked(updateMilestone)).toHaveBeenCalledTimes(1));
    const patchCall = vi.mocked(updateMilestone).mock.calls[0];
    if (!patchCall) throw new Error('updateMilestone call missing');
    const [id, body, options] = patchCall;
    expect(id).toBe(IDS.sso);
    // Exact body — proves primary_managed_system_id (and everything else)
    // never rides along on a status change.
    expect(body).toEqual({ status: 'released' });
    expect(options.ifMatch).toBe(UPDATED_AT);
    expect(options.idempotencyKey).toMatch(UUID_KEY);

    // The stored status returns through the refetched detail read; the
    // select is controlled by it, not by the local choice.
    await waitFor(() => expect(vi.mocked(getMilestone)).toHaveBeenCalledTimes(2));
    expect(statusSelect()).toHaveValue('released');
    expect(screen.queryByText('Status update failed.')).not.toBeInTheDocument();
  });

  it('shows the error and keeps the prior status when the PATCH fails', async () => {
    vi.mocked(getMilestone).mockResolvedValue(detailFor(SSO_ROW, 'SSO Stabilization'));
    vi.mocked(updateMilestone).mockRejectedValue(
      new ApiError(500, { code: 'internal.unexpected', message: 'Status update failed.' }),
    );
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    fireEvent.change(statusSelect(), { target: { value: 'blocked' } });

    expect(await screen.findByText('Status update failed.')).toBeInTheDocument();
    // The old status is not overwritten locally: the select stays on it and
    // no refetch masks the failure.
    expect(statusSelect()).toHaveValue('in_progress');
    expect(vi.mocked(getMilestone)).toHaveBeenCalledTimes(1);
  });

  it('refetches the milestone and shows the server status on 409 conflict.stale_write', async () => {
    vi.mocked(getMilestone)
      .mockResolvedValueOnce(detailFor(SSO_ROW, 'SSO Stabilization'))
      .mockResolvedValue(detailFor({ ...SSO_ROW, status: 'released' }, 'SSO Stabilization'));
    vi.mocked(updateMilestone).mockRejectedValue(
      new ApiError(409, {
        code: 'conflict.stale_write',
        message: 'Milestone was modified by another actor.',
      }),
    );
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    fireEvent.change(statusSelect(), { target: { value: 'blocked' } });

    await waitFor(() => expect(vi.mocked(getMilestone)).toHaveBeenCalledTimes(2));
    expect(statusSelect()).toHaveValue('released');
    // No surfaced error and no local overwrite: the server row wins.
    expect(screen.queryByText('Status update failed.')).not.toBeInTheDocument();
    expect(screen.queryByText('Milestone was modified by another actor.')).not.toBeInTheDocument();
  });

  // B2e-status fixup (midreview P2) — the status stale-write refetch brings a
  // new concurrency token; an open title draft composed against the old row
  // must not silently rebase onto it (the server could no longer reject the
  // stale draft). The stale-title reconciliation (discard editor and draft)
  // runs before the refetch, like the title-409 path.
  it('discards an open title draft when the status change conflicts and the server row moved', async () => {
    const REMOTE_UPDATED_AT = '2026-07-21T09:15:00.000Z';
    vi.mocked(getMilestone)
      .mockResolvedValueOnce(detailFor(SSO_ROW, 'SSO Stabilization'))
      .mockResolvedValue(
        detailFor(
          { ...SSO_ROW, title: 'Remote title', status: 'blocked', updated_at: REMOTE_UPDATED_AT },
          'Remote title',
        ),
      );
    vi.mocked(updateMilestone).mockRejectedValue(
      new ApiError(409, {
        code: 'conflict.stale_write',
        message: 'Milestone was modified by another actor.',
      }),
    );
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    // The draft is composed against V1 while the editor is open.
    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Local draft' },
    });

    // The status PATCH carries V1 and loses the race against V2.
    fireEvent.change(statusSelect(), { target: { value: 'blocked' } });

    // The refetched V2 row wins; the editor and its stale draft are gone, so
    // the draft can never be saved against V2's concurrency token.
    await waitFor(() => expect(vi.mocked(getMilestone)).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Remote title' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.queryByText('Local draft')).not.toBeInTheDocument();
    expect(statusSelect()).toHaveValue('blocked');
    // Only the status PATCH happened: the stale draft was never re-sent.
    expect(vi.mocked(updateMilestone)).toHaveBeenCalledTimes(1);

    // No draft remains, so the header close no longer needs confirmation.
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByText('변경사항이 저장되지 않았습니다')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Remote title' })).not.toBeInTheDocument();
    });
  });

  // The reconciliation is specific to the stale-write branch: a generic
  // status failure surfaces its error and leaves the open editor and draft
  // (and the dirty-close confirmation behind them) untouched.
  it('keeps an open title draft when the status change fails generically', async () => {
    vi.mocked(getMilestone).mockResolvedValue(detailFor(SSO_ROW, 'SSO Stabilization'));
    vi.mocked(updateMilestone).mockRejectedValue(
      new ApiError(500, { code: 'internal.unexpected', message: 'Status update failed.' }),
    );
    renderWithClient(<MilestonesRoute selectedParam={IDS.sso} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Local draft' },
    });
    fireEvent.change(statusSelect(), { target: { value: 'blocked' } });

    expect(await screen.findByText('Status update failed.')).toBeInTheDocument();
    expect(statusSelect()).toHaveValue('in_progress');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Local draft');
    expect(vi.mocked(getMilestone)).toHaveBeenCalledTimes(1);
  });
});

// Astra finding 3 — an uncertain create (server committed the row but the
// response was lost) leaves the form open with an error. Retrying the same
// logical payload must reuse the Idempotency-Key so the server replays the
// stored response (docs/implementation/api/milestones.md: a matching replay
// returns the stored response, reuse with a different body is 409) instead of
// creating a second Milestone; a changed payload rotates the key.
describe('MilestonesRoute create retry (Astra finding 3)', () => {
  function openCreateForm(): Promise<void> {
    return (async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
      await screen.findByTestId('milestone-create-panel');
      fillCreateForm(IDS.msPowerBi);
    })();
  }

  it('retries a lost-response create under the same idempotency key and body', async () => {
    vi.mocked(createMilestone)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(createdRow());
    vi.mocked(getMilestone).mockResolvedValue(detailFor(createdRow(), 'Launch review hardening'));
    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');
    await openCreateForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();

    // Same logical payload, resubmitted by the user after the lost response.
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));

    await waitFor(() => expect(vi.mocked(createMilestone)).toHaveBeenCalledTimes(2));
    const firstCall = vi.mocked(createMilestone).mock.calls[0];
    const secondCall = vi.mocked(createMilestone).mock.calls[1];
    if (!firstCall || !secondCall) throw new Error('createMilestone calls missing');
    expect(secondCall[1]).toBe(firstCall[1]);
    expect(secondCall[1]).toMatch(UUID_KEY);
    expect(secondCall[0]).toEqual(firstCall[0]);

    // The replay resolves and hands over to the detail panel.
    expect(
      await screen.findByRole('heading', { name: 'Launch review hardening' }),
    ).toBeInTheDocument();
  });

  it('rotates the idempotency key when the resubmitted payload changes', async () => {
    vi.mocked(createMilestone)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(createdRow());
    vi.mocked(getMilestone).mockResolvedValue(detailFor(createdRow(), 'Launch review hardening'));
    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');
    await openCreateForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Launch review hardening v2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));

    await waitFor(() => expect(vi.mocked(createMilestone)).toHaveBeenCalledTimes(2));
    const firstCall = vi.mocked(createMilestone).mock.calls[0];
    const secondCall = vi.mocked(createMilestone).mock.calls[1];
    if (!firstCall || !secondCall) throw new Error('createMilestone calls missing');
    // A different logical creation is a new key: reuse would be 409
    // conflict.idempotency_key_reuse.
    expect(secondCall[1]).not.toBe(firstCall[1]);
    expect(secondCall[0]).not.toEqual(firstCall[0]);
  });
});

// Astra finding 4 — create options mirror the API's create checks: only
// active Managed Systems are offered (archived → 409 parent_archived), and
// only active areas of the selected system (foreign → 422 out_of_scope,
// archived → 409 parent_archived). Selecting an incompatible system clears
// the area selection. Archived entries stay in the display lookups for rows
// that reference them.
describe('MilestonesRoute create options (Astra finding 4)', () => {
  it('offers only active systems and only active areas of the selected system', async () => {
    mockLookupsForF4();
    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');

    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();

    const systemSelect = screen.getByLabelText('Managed System') as HTMLSelectElement;
    expect(Array.from(systemSelect.options).map((option) => option.textContent)).toEqual([
      'Select…',
      'Power BI',
      'ERP',
    ]);

    // With no system selected, no area can be valid yet.
    const areaSelect = screen.getByLabelText('Analytics Area') as HTMLSelectElement;
    expect(Array.from(areaSelect.options).map((option) => option.textContent)).toEqual(['—']);

    fireEvent.change(systemSelect, { target: { value: IDS.msPowerBi } });
    expect(Array.from(areaSelect.options).map((option) => option.textContent)).toEqual([
      '—',
      'Product Usage',
    ]);

    fireEvent.change(systemSelect, { target: { value: IDS_F4.msErp } });
    expect(Array.from(areaSelect.options).map((option) => option.textContent)).toEqual([
      '—',
      'ERP Usage',
    ]);
  });

  it('clears the area selection when the system changes and the area no longer belongs', async () => {
    mockLookupsForF4();
    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');

    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();

    const systemSelect = screen.getByLabelText('Managed System') as HTMLSelectElement;
    const areaSelect = screen.getByLabelText('Analytics Area') as HTMLSelectElement;
    fireEvent.change(systemSelect, { target: { value: IDS.msPowerBi } });
    fireEvent.change(areaSelect, { target: { value: IDS.areaProduct } });
    expect(areaSelect).toHaveValue(IDS.areaProduct);

    fireEvent.change(systemSelect, { target: { value: IDS_F4.msErp } });

    // The stale selection cannot ride along: it would be a 422 out_of_scope
    // create, and the user re-picks deliberately for the new system.
    expect(areaSelect).toHaveValue('');
  });
});

// Opus P3-2 (owner half) — the create contract accepts only an Admin or
// Developer as owner_actor_id (a User owner is 422 validation.failed with
// out_of_scope, docs/implementation/api/milestones.md), so the Owner options
// carry eligible actors only. Display lookups keep every actor so rows and
// panels still resolve names for User-role owners.
describe('MilestonesRoute create owner options (Opus P3-2)', () => {
  it('offers only Admin/Developer owners and keeps User actors in display lookups', async () => {
    renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');

    // The existing row is owned by 박서연 (role_level 'user'): the display
    // lookup resolves her avatar initial even though she is not selectable.
    expect(screen.getByText('박')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();

    const ownerSelect = screen.getByLabelText('Owner') as HTMLSelectElement;
    expect(Array.from(ownerSelect.options).map((option) => option.textContent)).toEqual([
      '—',
      '김지원',
    ]);
  });
});

// Opus P3-3 — prevParamRef advances before the pending decision, so after
// declining the dirty-create switch the effect never fires again. Cancelling
// the create must then sync the panel with the actual URL param instead of
// leaving the stale pre-switch selection.
describe('MilestonesRoute create cancel sync (Opus P3-3)', () => {
  it('selects the URL param when the create is cancelled after a declined switch', async () => {
    vi.mocked(getMilestone).mockResolvedValue(detailFor(SSO_ROW, 'SSO Stabilization'));
    const { view, queryClient } = renderWithClient(<MilestonesRoute />);
    await screen.findByText('MLS-1021');

    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    expect(await screen.findByTestId('milestone-create-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Draft to keep' } });

    // External URL change (Back/Forward) while the dirty create is open: the
    // discard confirmation opens and declining keeps the draft.
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <DetailPanelHost>
          <MilestonesRoute selectedParam={IDS.sso} />
        </DetailPanelHost>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    expect(screen.getByTestId('milestone-create-panel')).toBeInTheDocument();

    // Giving up on the draft closes the create; the panel must now show what
    // the URL says (param=MLS-1021), not the stale empty selection.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('milestone-create-panel')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'SSO Stabilization' })).toBeInTheDocument();
  });
});
