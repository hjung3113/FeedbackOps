// #849: a saved view keeps the inbox search. `savedViewFilter` collects `q`
// from the /vocs URL next to the other filter keys, and `applySavedView`
// restores (or clears) it at the route-search boundary.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stringifyAppSearch } from '../../lib/router/search-serialization';
import {
  type AuthedVocsRequest,
  type SavedViewRow,
  jsonResponse,
  mountAuthedVocs,
  savedView,
} from '../../test/mountAuthedVocs';

interface HarnessOptions {
  initialPath: string;
  savedViews?: SavedViewRow[];
}

function mountSavedViewHarness({ initialPath, savedViews = [] }: HarnessOptions) {
  return mountAuthedVocs({
    initialPath,
    handle: (request: AuthedVocsRequest): Response | undefined => {
      if (request.method === 'POST' && request.url === '/saved-views') {
        const input = request.body as { name: string; filter: Record<string, unknown> };
        return jsonResponse(200, savedView('view-new', input.name, input.filter));
      }
      if (request.method === 'GET' && request.url === '/saved-views?surface=voc') {
        return jsonResponse(200, { items: savedViews });
      }
      return undefined;
    },
  });
}

function postsToSavedViews(requests: Array<{ method: string; url: string; body?: unknown }>) {
  return requests.filter(
    (request): request is { method: 'POST'; url: string; body: Record<string, unknown> } =>
      request.method === 'POST' && request.url === '/saved-views',
  );
}

describe('#849 saved views keep the inbox search', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applying a view without q clears the current search', async () => {
    const { router } = mountSavedViewHarness({
      initialPath: '/vocs?view=inbox&q=stale-search',
      savedViews: [savedView('view-2', '기본 보기', { view: 'inbox' })],
    });
    fireEvent.click(await screen.findByTestId('saved-view-apply-view-2'));

    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.searchStr);
      expect(search.get('q')).toBeNull();
      expect(search.get('view')).toBe('inbox');
    });
  });

  // Saving and applying a view keeps the search term exactly, including values the router JSON-quotes.
  it.each([['voc-1'], ['123'], ['true'], ['null'], ['"login error"']])(
    'saving and applying keeps the exact search term %s',
    async (term) => {
      const { requests, router } = mountSavedViewHarness({
        initialPath: `/vocs${stringifyAppSearch({ view: 'inbox', q: term })}`,
        savedViews: [savedView('view-1', '검색 보기', { view: 'inbox', q: term })],
      });
      fireEvent.change(await screen.findByLabelText('저장된 보기 이름'), {
        target: { value: '검색 보기' },
      });
      fireEvent.click(screen.getByTestId('saved-view-save'));

      await waitFor(() => expect(postsToSavedViews(requests)).toHaveLength(1));
      const body = postsToSavedViews(requests)[0]?.body as { filter: { q?: unknown } };
      expect(body.filter.q).toBe(term);

      fireEvent.click(screen.getByTestId('saved-view-apply-view-1'));
      await waitFor(() => {
        const search = router.state.location.search as Record<string, unknown>;
        expect(search.q).toBe(term);
      });
    },
  );
});
