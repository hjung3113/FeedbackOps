// #1175: the Analytics Area single-select on the Inbox and Triage toolbars writes
// `filter.analytics_area` to the URL and to GET /vocs. Real route, router and query client.

import { listVocsQuerySchema } from '@fops/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AuthedVocsMount,
  type AuthedVocsRequest,
  jsonResponse,
  mountAuthedVocs,
} from '../../../../test/mountAuthedVocs';

const MS = '00000000-0000-4000-8000-0000000000aa';
const AREA = '11111111-1111-4111-8111-111111111111';
const ARCHIVED_AREA = '22222222-2222-4222-8222-222222222222';
const ROW_ID = '00000000-0000-4000-8000-000000000101';

const AREAS = [
  { id: AREA, name: '결제 분석', managed_system_id: MS, archived_at: null },
  {
    id: ARCHIVED_AREA,
    name: '옛 분석',
    managed_system_id: MS,
    archived_at: '2026-01-01T00:00:00.000Z',
  },
];

const ROW = {
  id: ROW_ID,
  display_id: 'VOC-A01',
  title: '영역 필터 행',
  primary_managed_system_id: MS,
  analytics_area_id: AREA,
  reporter_id: '00000000-0000-4000-8000-0000000000bb',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high' as const,
  reporter_facing_status: 'received' as const,
  triage_state: 'untriaged' as const,
  source_context: 'direct_use' as const,
  created_at: '2026-10-08T00:00:00.000Z',
  updated_at: '2026-10-08T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

const NAV_COUNTS = {
  'voc.triage': 71,
  'voc.tab.unassigned': 72,
  'voc.tab.untriaged': 73,
  'voc.tab.high': 74,
  'voc.tab.waiting': 75,
};

let mounted: AuthedVocsMount | undefined;
let rows: unknown[] = [ROW];
let patchResponse: Promise<Response> | undefined;

function mount(path: string) {
  mounted = mountAuthedVocs({
    initialPath: path,
    vocsShell: true,
    handle: (request: AuthedVocsRequest) => {
      if (request.method === 'PATCH' && patchResponse !== undefined) return patchResponse;
      if (request.method !== 'GET') return undefined;
      if (request.url.startsWith('/vocs?')) {
        return jsonResponse(200, { items: rows, page: { has_more: false } });
      }
      if (request.url.startsWith('/vocs/')) return new Promise<Response>(() => {});
      if (request.url.startsWith('/managed-systems'))
        return jsonResponse(200, { items: [{ id: MS, name: 'Tableau' }], total: 1 });
      if (request.url.startsWith('/analytics-areas')) {
        return jsonResponse(200, { items: AREAS, total: AREAS.length });
      }
      if (request.url.startsWith('/nav/counts')) {
        return jsonResponse(200, { counts: NAV_COUNTS });
      }
      if (request.url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
      return undefined;
    },
  });
  return mounted;
}

function listQuery(index = -1) {
  const requests = (mounted?.requests ?? []).filter((r) => r.url.startsWith('/vocs?'));
  const request = requests.at(index);
  if (request === undefined) throw new Error('no list request');
  const raw = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams);
  const parsed = listVocsQuerySchema.safeParse(raw);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : undefined;
}

async function choose(option: string) {
  const trigger = await screen.findByRole('combobox', { name: 'Analytics Area' });
  await act(async () => {
    fireEvent.keyDown(trigger, { key: 'Enter' });
  });
  const listbox = await screen.findByRole('listbox');
  await act(async () => {
    fireEvent.click(within(listbox).getByRole('option', { name: option }));
  });
}

function urlArea(): unknown {
  return (mounted?.router.state.location.search as Record<string, unknown>)[
    'filter.analytics_area'
  ];
}

afterEach(() => {
  expect(mounted?.unhandled ?? []).toEqual([]);
  toast.dismiss();
  vi.unstubAllGlobals();
  rows = [ROW];
  patchResponse = undefined;
});

describe.each(['/vocs?view=inbox', '/vocs?view=triage'])('Area filter on %s', (path) => {
  it('lists all, 미지정 and the actor areas with an archived suffix', async () => {
    mount(path);
    const trigger = await screen.findByRole('combobox', { name: 'Analytics Area' });
    expect(trigger).toHaveTextContent('전체 Analytics Area');
    await waitFor(() =>
      expect(mounted?.requests.some((r) => r.url.startsWith('/analytics-areas'))).toBe(true),
    );
    await act(async () => {
      fireEvent.keyDown(trigger, { key: 'Enter' });
    });
    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['전체 Analytics Area', '미지정', '결제 분석', '옛 분석 · 보관됨']);
  });

  it.each([
    ['결제 분석', AREA],
    ['미지정', 'unset'],
  ])('choosing %s sets the URL and the list request; 전체 clears both', async (option, value) => {
    mount(path);
    await choose(option);

    await waitFor(() => expect(urlArea()).toBe(value));
    await waitFor(() => expect(listQuery()?.['filter.analytics_area']).toBe(value));
    expect(listQuery()?.view).toBe(path.endsWith('triage') ? 'triage' : 'inbox');

    await choose('전체 Analytics Area');
    // The unfiltered page is already cached, so clearing may send no new request.
    await waitFor(() => expect(urlArea()).toBeUndefined());
  });
});

describe('Triage Area filter and queue counts', () => {
  it('omits all five unfiltered numbers while filtered and restores them when cleared', async () => {
    mount('/vocs?view=triage');
    const total = await screen.findByTestId('triage-queue-total');
    await waitFor(() => expect(total).toHaveTextContent('71 VOC'));
    expect(screen.getByTestId('triage-toolbar').textContent).toMatch(/\b72\b/);

    rows = [];
    await choose('결제 분석');

    await waitFor(() => expect(total).toHaveTextContent('— VOC'));
    await waitFor(() => expect(listQuery()?.['filter.analytics_area']).toBe(AREA));
    // The global sidebar counts are unchanged; the Triage screen shows none of them.
    const screenText = () => screen.getByTestId('triage-toolbar').textContent ?? '';
    const queueText = () => screen.getByRole('tabpanel').textContent ?? '';
    for (const number of ['71', '72', '73', '74', '75']) {
      expect(screenText()).not.toMatch(new RegExp(`\\b${number}\\b`));
      expect(queueText()).not.toMatch(new RegExp(`\\b${number}\\b`));
    }
    // No-matching-rows case: neutral empty state, no fabricated zero.
    expect(screenText()).not.toMatch(/\b0 VOC\b/);
    expect(queueText()).not.toMatch(/\b0\b/);

    await choose('전체 Analytics Area');
    await waitFor(() => expect(total).toHaveTextContent('71 VOC'));
    for (const number of ['72', '73', '74', '75']) {
      expect(screen.getByTestId('triage-toolbar').textContent).toMatch(
        new RegExp(`\\b${number}\\b`),
      );
    }
  });
});

describe('Triage Area switch with an optimistic removal in flight', () => {
  it('expires the old exclusion, keeps the session counter and the original command', async () => {
    let settle: (response: Response) => void = () => {};
    patchResponse = new Promise<Response>((resolve) => {
      settle = resolve;
    });
    mount(`/vocs?view=triage&selected=${ROW_ID}&filter.analytics_area=${AREA}`);
    const queue = await screen.findByRole('tabpanel');
    const rowTitle = () => within(queue).queryByText('영역 필터 행');
    await waitFor(() => expect(rowTitle()).not.toBeNull());

    fireEvent.click(await screen.findByRole('button', { name: /Triage 확정 & 다음 VOC/ }));
    await waitFor(() => expect(rowTitle()).toBeNull());

    // The new Area's read still returns the row; the old exclusion must not hide it.
    await choose('전체 Analytics Area');
    await waitFor(() => expect(rowTitle()).not.toBeNull());
    expect(mounted?.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);

    await act(async () => {
      settle(jsonResponse(200, { updated_at: '2026-10-09T00:00:00.000Z' }));
    });
    const patch = mounted?.requests.find((r) => r.method === 'PATCH');
    expect(patch?.url).toBe(`/vocs/${ROW_ID}`);
    await waitFor(() =>
      expect(screen.getByTestId('triage-processed-count')).toHaveTextContent('1건 처리됨'),
    );
  });
});

const OTHER_MS = '00000000-0000-4000-8000-0000000000cc';
const NEXT_ID = '00000000-0000-4000-8000-000000000102';

it.each([
  ['inbox', false, false],
  ['triage', false, false],
  ['inbox', true, false],
  ['triage', true, false],
  ['inbox', true, true],
] as const)(
  '%s Area options follow the Developer switcher list (two visible: %s, scoped: %s)',
  async (view, twoVisible, scoped) => {
    const systems = [
      { id: MS, name: 'Tableau' },
      { id: OTHER_MS, name: 'Power BI' },
    ];
    mounted = mountAuthedVocs({
      initialPath: `/vocs?view=${view}&filter.analytics_area=${ARCHIVED_AREA}${scoped ? `&managedSystem=${MS}` : ''}`,
      vocsShell: true,
      handle: (request) => {
        if (request.url === '/me')
          return jsonResponse(200, {
            actor: {
              id: 'developer-1',
              external_id: 'developer-1',
              email: 'developer@example.test',
              role_level: 'developer',
              display_name: 'Developer One',
            },
            workspace_id: 'workspace-1',
          });
        if (request.url.startsWith('/me/permissions/scope'))
          return jsonResponse(200, {
            scope: { kind: 'scoped', managed_system_ids: twoVisible ? [MS, OTHER_MS] : [MS] },
          });
        if (request.url.startsWith('/managed-systems'))
          return jsonResponse(200, {
            items: twoVisible ? systems : systems.slice(0, 1),
            total: twoVisible ? 2 : 1,
          });
        if (request.url.startsWith('/analytics-areas'))
          return jsonResponse(200, {
            items: [
              { id: AREA, name: 'Usage', managed_system_id: MS, archived_at: null },
              {
                id: ARCHIVED_AREA,
                name: 'Usage',
                managed_system_id: OTHER_MS,
                archived_at: '2026-01-01T00:00:00.000Z',
              },
            ],
            total: 2,
          });
        if (request.url.startsWith('/vocs?'))
          return jsonResponse(200, { items: [], page: { has_more: false } });
        if (request.url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
        return undefined;
      },
    });
    // The shared harness seeds Admin; refresh /me through the real query to exercise Developer.
    await act(async () => {
      await mounted?.router.options.context.queryClient.invalidateQueries({ queryKey: ['me'] });
    });
    const trigger = await screen.findByRole('combobox', { name: 'Analytics Area' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const listbox = await screen.findByRole('listbox');
    await waitFor(() =>
      expect(
        within(listbox)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(
        twoVisible && !scoped
          ? ['전체 Analytics Area', '미지정', 'Usage · Tableau', 'Usage · Power BI · 보관됨']
          : ['전체 Analytics Area', '미지정', 'Usage'],
      ),
    );
    expect(urlArea()).toBe(ARCHIVED_AREA);
    expect(listQuery()?.['filter.analytics_area']).toBe(ARCHIVED_AREA);
    if (view === 'inbox') {
      expect(screen.getByText('Analytics Area: Usage (보관됨)')).toBeInTheDocument();
    }
  },
);

it('undo across Area restores only the original VOC and preserves the remaining selected pin', async () => {
  render(<Toaster />);
  const next = { ...ROW, id: NEXT_ID, display_id: 'VOC-A02', title: '남은 선택 행' };
  let forwardDone = false;
  let undoDone = false;
  let settleForward: (response: Response) => void = () => {};
  let settleUndo: (response: Response) => void = () => {};
  const forward = new Promise<Response>((resolve) => {
    settleForward = resolve;
  });
  const undo = new Promise<Response>((resolve) => {
    settleUndo = resolve;
  });
  mounted = mountAuthedVocs({
    initialPath: `/vocs?view=triage&tab=untriaged&selected=${ROW_ID}&filter.analytics_area=${AREA}`,
    vocsShell: true,
    handle: (request) => {
      if (request.method === 'PATCH')
        return (request.body as { triage_state: string }).triage_state === 'triaged'
          ? forward
          : undo;
      if (request.url.startsWith('/vocs?'))
        return jsonResponse(200, {
          items: forwardDone && !undoDone ? [next] : [ROW, next],
          page: { has_more: false },
        });
      if (request.url.startsWith('/vocs/')) return new Promise<Response>(() => {});
      if (request.url.startsWith('/analytics-areas'))
        return jsonResponse(200, { items: [{ ...AREAS[0], managed_system_id: MS }], total: 1 });
      if (request.url.startsWith('/managed-systems'))
        return jsonResponse(200, { items: [{ id: MS, name: 'Tableau' }], total: 1 });
      if (request.url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
      return undefined;
    },
  });
  await screen.findByRole('heading', { name: ROW.title });
  fireEvent.click(screen.getByRole('button', { name: /Triage 확정 & 다음 VOC/ }));
  await waitFor(() => expect(mounted?.router.state.location.search.selected).toBe(NEXT_ID));
  await choose('전체 Analytics Area');
  await screen.findByRole('button', { name: /VOC-A01/ });
  expect(mounted?.router.state.location.search.selected).toBe(NEXT_ID);
  fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
  expect(screen.queryByTestId('triage-processed-count')).toBeNull();
  await act(async () => {
    forwardDone = true;
    settleForward(jsonResponse(200, { updated_at: '2026-10-09T00:00:00.000Z' }));
  });
  await waitFor(() =>
    expect(mounted?.requests.filter((r) => r.method === 'PATCH')).toHaveLength(2),
  );
  const patches = mounted?.requests.filter((r) => r.method === 'PATCH') ?? [];
  expect(patches.map((r) => r.url)).toEqual([`/vocs/${ROW_ID}`, `/vocs/${ROW_ID}`]);
  expect(patches[1]?.body).toMatchObject({
    triage_state: 'untriaged',
    analytics_area_id: AREA,
    severity: 'high',
    owner_user_id: null,
    owner_team_id: null,
  });
  expect(screen.queryByTestId('triage-processed-count')).toBeNull();
  const readsBeforeCompensation =
    mounted?.requests.filter((r) => r.url.startsWith('/vocs?')).length ?? 0;
  await act(async () => {
    undoDone = true;
    settleUndo(jsonResponse(200, { updated_at: '2026-10-10T00:00:00.000Z' }));
  });
  await waitFor(() =>
    expect(mounted?.requests.filter((r) => r.url.startsWith('/vocs?')).length).toBeGreaterThan(
      readsBeforeCompensation,
    ),
  );
  await screen.findByRole('button', { name: /VOC-A01/ });
  await waitFor(() => expect(listQuery()?.pin_voc_id).toBe(NEXT_ID));
  expect(screen.getByRole('button', { name: /VOC-A02/ })).toHaveAttribute('aria-selected', 'true');
  expect(mounted?.router.state.location.search.selected).toBe(NEXT_ID);
  expect(urlArea()).toBeUndefined();
  expect(screen.queryByTestId('triage-processed-count')).toBeNull();
});
