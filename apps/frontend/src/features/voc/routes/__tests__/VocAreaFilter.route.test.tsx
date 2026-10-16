// #1175: the Analytics Area single-select on the Inbox and Triage toolbars writes
// `filter.analytics_area` to the URL and to GET /vocs. Real route, router and query client.

import { listVocsQuerySchema } from '@fops/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  { id: AREA, name: '결제 분석', archived_at: null },
  { id: ARCHIVED_AREA, name: '옛 분석', archived_at: '2026-01-01T00:00:00.000Z' },
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
