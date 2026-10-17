// #1175: Inbox and 내 VOC read GET /vocs in cursor pages of 50. Drives the real route,
// router and query client; only fetch is stubbed.

import { listVocsQuerySchema } from '@fops/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AuthedVocsMount,
  type AuthedVocsRequest,
  jsonResponse,
  mountAuthedVocs,
} from '../../../../test/mountAuthedVocs';

const MS = '00000000-0000-4000-8000-0000000000aa';

function voc(n: number, title: string) {
  return {
    id: `00000000-0000-4000-8000-00000000010${n}`,
    display_id: `VOC-P0${n}`,
    title,
    primary_managed_system_id: MS,
    analytics_area_id: null,
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
    attachment_count: 0,
  };
}

const PAGE_ONE = [voc(1, '첫 페이지 A'), voc(2, '첫 페이지 B')];
const PAGE_TWO = [voc(3, '둘째 페이지 C')];

let mounted: AuthedVocsMount | undefined;
let nextPage: () => Response | Promise<Response> = () =>
  jsonResponse(200, { items: PAGE_TWO, page: { has_more: false } });
let firstPage: (request: AuthedVocsRequest) => Response | Promise<Response> = () =>
  jsonResponse(200, { items: PAGE_ONE, page: { has_more: true, cursor: 'cursor-1' } });

function vocsQuery(request: AuthedVocsRequest) {
  const raw = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams);
  const parsed = listVocsQuerySchema.safeParse(raw);
  expect(parsed.success).toBe(true);
  return { raw, data: parsed.success ? parsed.data : undefined };
}

function mount(path: string) {
  mounted = mountAuthedVocs({
    initialPath: path,
    vocsShell: true,
    handle: (request) => {
      if (request.method === 'GET' && request.url.startsWith('/vocs?')) {
        const { raw } = vocsQuery(request);
        return raw.cursor === 'cursor-1' ? nextPage() : firstPage(request);
      }
      if (request.url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
      return undefined;
    },
  });
  return mounted;
}

function listRequests(): AuthedVocsRequest[] {
  return (mounted?.requests ?? []).filter((r) => r.method === 'GET' && r.url.startsWith('/vocs?'));
}

async function navigateSearch(patch: Record<string, unknown>) {
  const router = mounted?.router;
  if (router === undefined) throw new Error('not mounted');
  await act(async () => {
    await router.navigate({
      to: '/vocs',
      search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
    });
  });
}

afterEach(() => {
  expect(mounted?.unhandled ?? []).toEqual([]);
  vi.unstubAllGlobals();
  nextPage = () => jsonResponse(200, { items: PAGE_TWO, page: { has_more: false } });
  firstPage = () =>
    jsonResponse(200, { items: PAGE_ONE, page: { has_more: true, cursor: 'cursor-1' } });
});

const VIEWS = [
  ['inbox', '/vocs?view=inbox'],
  ['my', '/vocs?view=my'],
] as const;

describe('Inbox and 내 VOC cursor paging (#1175)', () => {
  it.each(VIEWS)(
    '%s: 더 불러오기 sends the returned cursor and appends rows',
    async (view, path) => {
      mount(path);
      expect(await screen.findByText('첫 페이지 A')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));

      expect(await screen.findByText('둘째 페이지 C')).toBeInTheDocument();
      expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
      const [first, second] = listRequests();
      if (first === undefined || second === undefined)
        throw new Error('expected two list requests');
      const one = vocsQuery(first);
      const two = vocsQuery(second);
      expect(one.raw.cursor).toBeUndefined();
      expect(one.data?.limit).toBe(50);
      expect(two.raw.cursor).toBe('cursor-1');
      const { cursor: _cursor, ...rest } = two.raw;
      expect(rest).toEqual(one.raw);
      expect(one.data?.view).toBe(view);
    },
  );

  it.each([
    ['inbox', '/vocs?view=inbox', { sort: 'created_at:asc' }],
    ['inbox', '/vocs?view=inbox', { 'filter.owner': 'assigned' }],
    ['inbox', '/vocs?view=inbox', { tab: 'high' }],
    ['inbox', '/vocs?view=inbox', { managedSystem: MS }],
    ['my', '/vocs?view=my', { sort: 'created_at:asc' }],
    ['my', '/vocs?view=my', { 'filter.owner': 'assigned' }],
    ['my', '/vocs?view=my', { managedSystem: MS }],
  ] as const)(
    '%s: a %j change restarts at page one without a cursor',
    async (_view, path, patch) => {
      mount(path);
      await screen.findByText('첫 페이지 A');
      fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));
      await screen.findByText('둘째 페이지 C');
      const before = listRequests().length;
      let release: (response: Response) => void = () => {};
      firstPage = () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        });

      await navigateSearch(patch);

      await waitFor(() => expect(listRequests().length).toBe(before + 1));
      const request = listRequests().at(-1);
      if (request === undefined) throw new Error('missing request');
      expect(vocsQuery(request).raw.cursor).toBeUndefined();
      // Not a q-only change: the old pages are gone while page one loads.
      expect(screen.queryByText('둘째 페이지 C')).not.toBeInTheDocument();
      expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
      await act(async () => {
        release(jsonResponse(200, { items: [voc(4, '새 조건 D')], page: { has_more: false } }));
      });
      expect(await screen.findByText('새 조건 D')).toBeInTheDocument();
      expect(screen.queryByText('둘째 페이지 C')).not.toBeInTheDocument();
    },
  );

  it('keeps the loaded rows while a q-only change loads its first page', async () => {
    mount('/vocs?view=inbox&tab=untriaged&q=abc');
    await screen.findByText('첫 페이지 A');
    let release: (response: Response) => void = () => {};
    firstPage = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });

    await navigateSearch({ q: 'abd' });

    await waitFor(() =>
      expect(listRequests().some((r) => vocsQuery(r).raw.q === 'abd')).toBe(true),
    );
    expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
    expect(screen.queryByRole('rowgroup', { name: 'VOC 목록 로딩 중' })).not.toBeInTheDocument();
    await act(async () => {
      release(jsonResponse(200, { items: [voc(5, '검색 결과 E')], page: { has_more: false } }));
    });
    expect(await screen.findByText('검색 결과 E')).toBeInTheDocument();
    expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
  });

  it('keeps rows for actual search start, pending q edits and clear with tab restoration', async () => {
    mount('/vocs?view=inbox&tab=high');
    await screen.findByText('첫 페이지 A');
    firstPage = () => new Promise<Response>(() => {});
    const box = screen.getByRole('searchbox', { name: '제목 또는 ID' });
    for (const q of ['abc', 'abd']) {
      fireEvent.change(box, { target: { value: q } });
      fireEvent.keyDown(box, { key: 'Enter' });
      await waitFor(() => expect(mounted?.router.state.location.search.q).toBe(q));
      expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
    }
    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(mounted?.router.state.location.search.tab).toBe('high'));
    expect(mounted?.router.state.location.search.q).toBeUndefined();
    expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
  });

  it('keeps the search rows while clearing to an uncached default tab loads', async () => {
    mount('/vocs?view=inbox&q=abc');
    await screen.findByText('첫 페이지 A');
    firstPage = () => new Promise<Response>(() => {});
    fireEvent.keyDown(screen.getByRole('searchbox', { name: '제목 또는 ID' }), { key: 'Escape' });
    await waitFor(() => expect(mounted?.router.state.location.search.q).toBeUndefined());
    await waitFor(() => {
      const request = listRequests().at(-1);
      if (request === undefined) throw new Error('missing request');
      expect(vocsQuery(request).raw.tab).toBe('untriaged');
    });
    expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
  });

  it.each(['pending-search tab click', 'saved-view tab and q'])(
    '%s clears old-tab rows while the request is pending',
    async (transition) => {
      mount('/vocs?view=inbox&tab=high');
      await screen.findByText('첫 페이지 A');
      firstPage = () => new Promise<Response>(() => {});
      if (transition === 'pending-search tab click') {
        const box = screen.getByRole('searchbox', { name: '제목 또는 ID' });
        fireEvent.change(box, { target: { value: 'abc' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        await waitFor(() =>
          expect(listRequests().some((r) => vocsQuery(r).raw.q === 'abc')).toBe(true),
        );
        expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByRole('tab', { name: /미배정/ }));
      } else {
        await navigateSearch({ tab: 'unassigned', q: 'abc' });
      }
      await waitFor(() => {
        const request = listRequests().at(-1);
        if (request === undefined) throw new Error('missing request');
        expect(vocsQuery(request).raw.tab).toBe('unassigned');
      });
      expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
      expect(screen.getByRole('rowgroup', { name: 'VOC 목록 로딩 중' })).toBeInTheDocument();
    },
  );

  it.each(VIEWS)(
    '%s: a failed next page keeps the loaded rows and offers 다시 시도',
    async (_view, path) => {
      mount(path);
      await screen.findByText('첫 페이지 A');
      nextPage = () => jsonResponse(500, { error: { code: 'internal.unexpected', message: 'x' } });

      fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));

      const retry = await screen.findByRole('button', { name: '다시 시도' }, { timeout: 5000 });
      expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
      expect(screen.queryByText('불러오기 실패')).not.toBeInTheDocument();
      nextPage = () => jsonResponse(200, { items: PAGE_TWO, page: { has_more: false } });
      fireEvent.click(retry);
      expect(await screen.findByText('둘째 페이지 C')).toBeInTheDocument();
    },
  );
});
