// #864: the inbox search commits at once on Enter and on blur. #849's UX
// review measured the loss: type a term and save a view within the debounce
// and the view is stored without `q`. This drives the REAL inbox
// (VocRouteShell) and the REAL sidebar saved-view form. After the real-timer
// mount, timers are frozen for the type → blur → navigation → submit window
// and the debounce is never advanced, so any `q` in the POST
// /saved-views body can only have come from the immediate commit. React's
// async `act` yields via setImmediate, which stays real.

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AuthedVocsMount,
  type AuthedVocsRequest,
  jsonResponse,
  mountAuthedVocs,
  savedView,
} from '../../test/mountAuthedVocs';

interface HarnessOptions {
  /** Resolved with the saved view's filter when the POST /saved-views lands. */
  onSavedViewPost: (filter: Record<string, unknown>) => void;
}

// Last mount's harness; afterEach fails the test when the app made a request
// no branch answered (React Query would otherwise swallow the 500).
let mounted: AuthedVocsMount | undefined;

function mountInboxHarness({ onSavedViewPost }: HarnessOptions) {
  mounted = mountAuthedVocs({
    initialPath: '/vocs?view=inbox',
    vocsShell: true,
    handle: (request: AuthedVocsRequest): Response | undefined => {
      if (request.method === 'POST' && request.url === '/saved-views') {
        const input = request.body as { name: string; filter: Record<string, unknown> };
        onSavedViewPost(input.filter);
        return jsonResponse(200, savedView('view-new', input.name, input.filter));
      }
      if (request.method === 'GET' && request.url === '/saved-views?surface=voc') {
        return jsonResponse(200, { items: [] });
      }
      if (request.method === 'GET' && request.url.startsWith('/vocs?')) {
        return jsonResponse(200, { items: [] });
      }
      return undefined;
    },
  });
  return mounted;
}

describe('#864 saving a view right after typing keeps q', () => {
  afterEach(() => {
    vi.useRealTimers();
    expect(mounted?.unhandled ?? []).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('commits q on blur so the POST /saved-views body has it before the debounce could elapse', async () => {
    let resolvePost!: (filter: Record<string, unknown>) => void;
    const postedFilter = new Promise<Record<string, unknown>>((resolve) => {
      resolvePost = resolve;
    });
    const { router } = mountInboxHarness({ onSavedViewPost: resolvePost });
    const box = await screen.findByRole('searchbox', { name: '필터, 키워드…' });
    const nameField = await screen.findByLabelText('저장된 보기 이름');

    // Mount and the first reads stay on real timers. Freeze only the
    // interaction window, and do not fake setImmediate: async act waits on it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      // The user's flow starts by focusing the box; jsdom does not focus on
      // fireEvent.change, so focus explicitly — otherwise the later focus() on
      // the name field blurs nothing and no commit can happen.
      box.focus();
      fireEvent.change(box, { target: { value: '로그인' } });
      nameField.focus(); // blurs the search box — commit at once (#864)
      // The commit's navigate() settles in microtasks; flush so the URL (and
      // with it savedViewFilter) carries q before the save. The debounce
      // is frozen and is not advanced.
      await act(async () => {});
      fireEvent.change(nameField, { target: { value: '검색 보기' } });
      fireEvent.click(screen.getByTestId('saved-view-save'));

      const filter = await postedFilter;
      expect(filter.q).toBe('로그인');

      const search = router.state.location.search as Record<string, unknown>;
      expect(search.q).toBe('로그인');
    } finally {
      vi.useRealTimers();
    }
  });
});
