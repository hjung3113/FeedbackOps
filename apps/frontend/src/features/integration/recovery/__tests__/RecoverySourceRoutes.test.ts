import { validatePermissionRequestsSearch } from '@/features/admin/permissions/permission-requests-search';
import { routeTree } from '@/routeTree.gen';
import { validateSurveyDetailSearch } from '@/routes/_authed/surveys/$surveyId';
import { validateTasksSearch } from '@/routes/_authed/tasks';
import { validateVocSearch } from '@/routes/_authed/vocs';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { expect, it } from 'vitest';

const ID = '11111111-1111-4111-8111-111111111111';
const returnTo = '/integration?category=unassigned-voc&cursor=page-two';
it.each([
  [`/vocs?selected=${ID}`, '/_authed/vocs'],
  [`/vocs?selected=${ID}&view=triage&managedSystem=${ID}`, '/_authed/vocs'],
  [`/tasks?param=${ID}`, '/_authed/tasks'],
  [`/findings?selected=${ID}`, '/_authed/findings/'],
  [`/admin/permissions/requests?selected=${ID}`, '/_authed/admin/permissions/requests'],
  [`/surveys/${ID}/follow-up`, '/_authed/surveys/$surveyId/follow-up'],
])('resolves recovery source/action URL %s in the shipped route tree', (href, routeId) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory(),
    context: { queryClient: new QueryClient() },
  });
  const url = new URL(href, 'http://localhost');
  url.searchParams.set('returnTo', returnTo);
  const matches = router.matchRoutes(url.pathname, Object.fromEntries(url.searchParams));
  expect(matches.at(-1)?.routeId).toBe(routeId);
  expect(matches.some((match) => match.globalNotFound)).toBe(false);
});
it.each([
  [validateVocSearch, { selected: ID, view: 'triage', managedSystem: ID }],
  [validateTasksSearch, { param: ID }],
  [validatePermissionRequestsSearch, { selected: ID }],
  [validateSurveyDetailSearch, {}],
])('preserves bounded recovery queue return context at a source route', (validate, search) => {
  expect(validate({ ...search, returnTo })).toMatchObject({ ...search, returnTo });
  expect(validate({ ...search, returnTo: '//foreign.example' }).returnTo).toBeUndefined();
});
