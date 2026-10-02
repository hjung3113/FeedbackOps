import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NavRouteIntent } from '@fops/shared';

import { routeTree } from '@/routeTree.gen';
import { validateAnalyticsAreasSearch } from '../../features/admin/analytics-areas/search';
import { validatePermissionRequestsSearch } from '../../features/admin/permissions/permission-requests-search';
import { validateFindingsSearch } from '../_authed/findings';
import { validateHomeSearch } from '../_authed/home';
import { validateIntegrationDashboardSearch } from '../_authed/integration';
import { validateIntegrationCoverageSearch } from '../_authed/integration/coverage';
import { validateIntegrationLinksSearch } from '../_authed/integration/links';
import { validateSurveysSearch } from '../_authed/surveys';
import { validateSurveyDetailSearch } from '../_authed/surveys/$surveyId';
import { TasksRouteView, validateTasksSearch } from '../_authed/tasks';
import { validateVocClustersSearch } from '../_authed/voc-clusters';
import { validateVocSearch } from '../_authed/vocs';

vi.mock('@/features/tasks/routes/MilestonesRoute', () => ({
  MilestonesRoute: () => <div>Milestones view</div>,
}));
vi.mock('@/features/tasks/routes/TaskBoardRoute', () => ({
  TaskBoardRoute: () => <div>Task board view</div>,
}));
vi.mock('@/features/tasks/routes/TaskListRoute', () => ({
  TaskListRoute: () => <div>Task list view</div>,
}));
vi.mock('@/features/tasks/routes/TaskRequestsRoute', () => ({
  TaskRequestsRoute: () => <div>Task Requests view</div>,
}));

const ID = '11111111-1111-4111-8111-111111111111';

const routeCases: Array<{
  name: string;
  pathname: string;
  validateSearch: (raw: unknown) => unknown;
  raw: Record<string, unknown>;
  expected: Record<string, unknown>;
}> = [
  {
    name: 'Tasks',
    pathname: '/tasks',
    validateSearch: validateTasksSearch,
    raw: { view: 'list', param: 'task-1', unknown: 'ignored' },
    expected: { param: 'task-1' },
  },
  {
    name: 'VOC',
    pathname: '/vocs',
    validateSearch: validateVocSearch,
    raw: { view: 'list', selected: ID, tab: 'not-a-tab' },
    expected: { selected: ID },
  },
  {
    name: 'Home',
    pathname: '/home',
    validateSearch: validateHomeSearch,
    raw: { managedSystem: ID, tab: 'not-a-tab' },
    expected: { managedSystem: ID },
  },
  {
    name: 'Integration dashboard',
    pathname: '/integration',
    validateSearch: validateIntegrationDashboardSearch,
    raw: { managedSystem: 'not-a-uuid' },
    expected: {},
  },
  {
    name: 'Integration coverage',
    pathname: '/integration/coverage',
    validateSearch: validateIntegrationCoverageSearch,
    raw: { managedSystem: 'not-a-uuid' },
    expected: {},
  },
  {
    name: 'Integration links',
    pathname: '/integration/links',
    validateSearch: validateIntegrationLinksSearch,
    raw: { status: 'deleted', type: 'related_to' },
    expected: { type: 'related_to' },
  },
  {
    name: 'VOC Clusters',
    pathname: '/voc-clusters',
    validateSearch: validateVocClustersSearch,
    raw: { managedSystem: 'all', selected: 'not-a-uuid' },
    expected: { managedSystem: 'all' },
  },
  {
    name: 'Analytics Areas',
    pathname: '/admin/analytics-areas',
    validateSearch: validateAnalyticsAreasSearch,
    // 'yes' is invalid both as a raw string and after the router's JSON search parsing.
    raw: { selected: ID, includeArchived: 'yes' },
    expected: { selected: ID },
  },
  {
    name: 'Permission Requests',
    pathname: '/admin/permissions/requests',
    validateSearch: validatePermissionRequestsSearch,
    raw: { selected: ID, tab: 'pending' },
    expected: { selected: ID },
  },
  {
    name: 'Findings',
    pathname: '/findings',
    validateSearch: validateFindingsSearch,
    raw: { selected: 'not-a-uuid', execution: 'none' },
    expected: { execution: 'none' },
  },
  {
    name: 'Surveys',
    pathname: '/surveys',
    validateSearch: validateSurveysSearch,
    raw: { managedSystem: 'all', selected: 'not-a-uuid' },
    expected: { managedSystem: 'all' },
  },
  {
    name: 'Survey detail',
    pathname: `/surveys/${ID}`,
    validateSearch: validateSurveyDetailSearch,
    raw: { builder: 'yes' },
    expected: {},
  },
];

describe('route search validation', () => {
  it.each(routeCases)('$name drops invalid values and keeps valid search state', (routeCase) => {
    expect(routeCase.validateSearch(routeCase.raw)).toEqual(routeCase.expected);
  });

  it.each(routeCases)('$name clears dropped values after router search merging', (routeCase) => {
    const queryClient = new QueryClient();
    const router = createRouter({ routeTree, context: { queryClient } });
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(routeCase.raw)) search.set(key, String(value));

    const matches = router.matchRoutes(
      routeCase.pathname,
      router.options.parseSearch(`?${search.toString()}`),
    );

    expect(matches.at(-1)?.search).toEqual(routeCase.expected);
  });

  it('renders the default Tasks view after an invalid view value', () => {
    render(<TasksRouteView search={validateTasksSearch({ view: 'list' })} />);

    expect(screen.getByText('Task list view')).toBeInTheDocument();
  });
});

// #731 FIX1 (R2): these are the exact search objects the nav resolver emits for
// REQ/TASK (docs/implementation/api/navigation.md). The shipped `/tasks`
// schema reads `param`, so both intents must survive validateTasksSearch with
// the resolved id intact — `selected` would be dropped and the palette would
// lose the selection.
describe('nav resolve task intents survive the tasks search schema', () => {
  it.each([
    ['task_request', { route: '/tasks', search: { view: 'requests', param: ID } }],
    ['task', { route: '/tasks', search: { view: 'board', param: ID } }],
  ] as ReadonlyArray<[string, NavRouteIntent]>)(
    '%s intent keeps the resolved id through validateTasksSearch',
    (_entityType, intent) => {
      expect(validateTasksSearch(intent.search)).toEqual(intent.search);
    },
  );
});
