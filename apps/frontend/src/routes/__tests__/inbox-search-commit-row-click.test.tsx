// #864: mousedown on a row blurs the search box, and the blur commit writes q
// before click. Without placeholder data the new list query has no cache, the
// rows swap for skeletons, and the click never writes `selected`. This drives
// the real inbox. The next list request is left pending so the failure does
// not depend on a fast response. The 300 ms debounce is frozen and not advanced.

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AuthedVocsRequest, jsonResponse, mountAuthedVocs } from '../../test/mountAuthedVocs';

const ROW_ID = '00000000-0000-4000-8000-000000000008';

const ROW = {
  id: ROW_ID,
  display_id: 'VOC-SEED-08',
  title: '시드 행',
  primary_managed_system_id: '00000000-0000-4000-8000-0000000000aa',
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

function hang(): Promise<Response> {
  return new Promise(() => {});
}

function mountInbox() {
  return mountAuthedVocs({
    initialPath: '/vocs?view=inbox',
    vocsShell: true,
    handle: (request: AuthedVocsRequest): Response | Promise<Response> | undefined => {
      if (request.method === 'GET' && request.url.startsWith('/vocs?')) {
        const q = new URL(request.url, 'http://localhost').searchParams.get('q');
        // The committed draft has no cached page. Leave it pending.
        if (q !== null) return hang();
        return jsonResponse(200, { items: [ROW] });
      }
      if (request.method === 'GET' && request.url.startsWith('/vocs/')) return hang();
      if (request.url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
      return undefined;
    },
  });
}

describe('#864 a row click while a search draft is pending still selects the row', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes selected when pointerdown, mousedown, blur, mouseup and click land before the debounce', async () => {
    const { router } = mountInbox();
    const box = await screen.findByRole('searchbox', { name: '필터, 키워드…' });
    const row = (await screen.findByText('VOC-SEED-08')).closest('[role="row"]');
    expect(row).not.toBeNull();
    if (row === null) return;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      box.focus();
      fireEvent.change(box, { target: { value: 'voc-0' } });
      fireEvent.pointerDown(row);
      fireEvent.mouseDown(row);
      fireEvent.blur(box);
      // The browser flushes the blur commit's navigation before mouseup/click.
      // That is the gap where a cache miss detaches the row.
      await act(async () => {});
      fireEvent.mouseUp(row);
      fireEvent.click(row);
      await act(async () => {});

      const search = router.state.location.search as { selected?: string };
      expect(search.selected).toBe(ROW_ID);
    } finally {
      vi.useRealTimers();
    }
  });
});
