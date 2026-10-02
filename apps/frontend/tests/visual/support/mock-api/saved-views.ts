import { errorEnvelope, json } from './shared';
import type { MockApiHandler } from './shared';

export function createSavedViewHandlers(): MockApiHandler[] {
  return [
    {
      method: 'GET',
      path: '/saved-views',
      handle: (route, context, url) => {
        const surface = url.searchParams.get('surface');
        return json(route, 200, {
          items: surface
            ? context.savedViews.filter((view) => view.surface === surface)
            : context.savedViews,
        });
      },
    },
    {
      method: 'POST',
      path: '/saved-views',
      handle: (route, context, _url) => {
        const body = route.request().postDataJSON() as {
          surface: string;
          name: string;
          filter: Record<string, unknown>;
        };
        const now = '2026-07-28T00:00:00.000Z';
        const view = {
          id: `saved-view-${context.savedViews.length + 1}`,
          ...body,
          created_at: now,
          updated_at: now,
        };
        context.savedViews.push(view);
        return json(route, 201, view);
      },
    },
    {
      method: 'DELETE',
      path: /^\/saved-views\/[^/]+$/,
      handle: async (route, context, url) => {
        const id = url.pathname.split('/').at(-1);
        const index = context.savedViews.findIndex((view) => view.id === id);
        if (index === -1) await json(route, 404, errorEnvelope(404));
        else await route.fulfill({ status: 204 });
        if (index !== -1) context.savedViews.splice(index, 1);
      },
    },
  ];
}
