import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { DOCUMENT_TITLE_COPY, getDocumentScreenTitle } from '@/lib/copy/document-titles';
import { DocumentTitleProvider, useDocumentTitle } from './document-title';

describe('document screen titles', () => {
  it.each([
    ['/home', {}, DOCUMENT_TITLE_COPY.home],
    ['/vocs', { view: 'inbox' }, DOCUMENT_TITLE_COPY.voc.inbox],
    ['/vocs', { view: 'triage' }, DOCUMENT_TITLE_COPY.voc.triage],
    ['/vocs', { view: 'my' }, DOCUMENT_TITLE_COPY.voc.my],
    ['/vocs', { action: 'create' }, DOCUMENT_TITLE_COPY.voc.create],
    ['/voc-clusters', {}, DOCUMENT_TITLE_COPY.vocClusters],
    ['/voc-clusters/cluster-1', {}, DOCUMENT_TITLE_COPY.vocClusters],
    ['/findings', {}, DOCUMENT_TITLE_COPY.findings],
    ['/findings/finding-1', {}, DOCUMENT_TITLE_COPY.findingDetail],
    ['/tasks', { view: 'requests' }, DOCUMENT_TITLE_COPY.tasks.requests],
    ['/tasks', { view: 'backlog' }, DOCUMENT_TITLE_COPY.tasks.backlog],
    ['/tasks', { view: 'board' }, DOCUMENT_TITLE_COPY.tasks.board],
    ['/tasks', { view: 'my' }, DOCUMENT_TITLE_COPY.tasks.my],
    ['/tasks', { view: 'inbox' }, DOCUMENT_TITLE_COPY.tasks.backlog],
    ['/tasks', { view: 'milestones' }, DOCUMENT_TITLE_COPY.tasks.milestones],
    ['/integration', {}, DOCUMENT_TITLE_COPY.integration.dashboard],
    ['/integration/coverage', {}, DOCUMENT_TITLE_COPY.integration.coverage],
    ['/integration/links', {}, DOCUMENT_TITLE_COPY.integration.links],
    ['/surveys', {}, DOCUMENT_TITLE_COPY.surveys.list],
    ['/surveys/survey-1', {}, DOCUMENT_TITLE_COPY.surveys.detail],
    ['/surveys/survey-1/results', {}, DOCUMENT_TITLE_COPY.surveys.results],
    ['/surveys/survey-1/follow-up', {}, DOCUMENT_TITLE_COPY.surveys.followUp],
    ['/admin/managed-systems', {}, DOCUMENT_TITLE_COPY.admin.managedSystems],
    ['/admin/analytics-areas', {}, DOCUMENT_TITLE_COPY.admin.analyticsAreas],
    ['/admin/permissions/requests', {}, DOCUMENT_TITLE_COPY.admin.permissionRequests],
    ['/admin/settings', {}, DOCUMENT_TITLE_COPY.admin.settings],
    ['/login', {}, DOCUMENT_TITLE_COPY.login],
    ['/unmatched', {}, DOCUMENT_TITLE_COPY.notFound],
  ])('uses the screen title for %s', (pathname, search, expected) => {
    expect(getDocumentScreenTitle(pathname, search)).toBe(expected);
  });

  it('sets and restores a record title without a RouterProvider', async () => {
    function RouterlessTitleProbe() {
      const [hasTitle, setHasTitle] = useState(true);
      useDocumentTitle(hasTitle ? 'VOC-001 · 결제 오류 문의' : null);

      return (
        <button type="button" onClick={() => setHasTitle(false)}>
          Clear title
        </button>
      );
    }

    const { unmount } = render(<RouterlessTitleProbe />);
    await waitFor(() => expect(document.title).toBe('VOC-001 · 결제 오류 문의 · FeedbackOps'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear title' }));
    await waitFor(() => expect(document.title).toBe(DOCUMENT_TITLE_COPY.app));

    unmount();
  });

  it('shows a loaded detail title, then clears it for blocked and missing selections', async () => {
    function DetailTitleProbe() {
      const [state, setState] = useState<'loading' | 'loaded' | 'blocked' | 'missing'>('loading');
      const title = state === 'loaded' ? 'VOC-001 · 결제 오류 문의' : null;
      useDocumentTitle(title);

      return (
        <div>
          <button type="button" onClick={() => setState('loaded')}>
            Load detail
          </button>
          <button type="button" onClick={() => setState('blocked')}>
            Select blocked detail
          </button>
          <button type="button" onClick={() => setState('missing')}>
            Select missing detail
          </button>
        </div>
      );
    }

    const rootRoute = createRootRoute({
      component: () => (
        <DocumentTitleProvider>
          <Outlet />
        </DocumentTitleProvider>
      ),
    });
    const vocsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/vocs',
      component: DetailTitleProbe,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([vocsRoute]),
      history: createMemoryHistory({ initialEntries: ['/vocs?view=inbox'] }),
    });

    const { unmount } = render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.voc.inbox} · FeedbackOps`),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load detail' }));
    await waitFor(() => expect(document.title).toBe('VOC-001 · 결제 오류 문의 · FeedbackOps'));

    fireEvent.click(screen.getByRole('button', { name: 'Select blocked detail' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.voc.inbox} · FeedbackOps`),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load detail' }));
    await waitFor(() => expect(document.title).toBe('VOC-001 · 결제 오류 문의 · FeedbackOps'));

    fireEvent.click(screen.getByRole('button', { name: 'Select missing detail' }));
    await waitFor(() =>
      expect(document.title).toBe(`${DOCUMENT_TITLE_COPY.voc.inbox} · FeedbackOps`),
    );

    unmount();
    expect(document.title).toBe(DOCUMENT_TITLE_COPY.app);
  });
});
