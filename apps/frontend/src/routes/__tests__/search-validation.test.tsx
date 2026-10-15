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

it('keeps Survey detail list context, builder, and returnTo', () => {
  expect(
    validateSurveyDetailSearch({
      builder: true,
      returnTo: '/home',
      managedSystem: ID,
      'filter.analytics_area': 'unset',
      status: 'open',
      follow_up: 'needed',
      selected: ID,
    }),
  ).toEqual({
    builder: true,
    returnTo: '/home',
    managedSystem: ID,
    'filter.analytics_area': 'unset',
    status: 'open',
    follow_up: 'needed',
    selected: undefined,
  });
  expect(validateSurveyDetailSearch({ builder: false, returnTo: '/home?tab=dashboard' })).toEqual({
    builder: false,
    returnTo: '/home?tab=dashboard',
  });
});

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

describe('ADR-0069 exact Area destinations', () => {
  it.each([ID, 'unset'])('preserves %s on both strict list routes', (area) => {
    expect(validateVocSearch({ view: 'inbox', 'filter.analytics_area': area })).toEqual({
      view: 'inbox',
      'filter.analytics_area': area,
    });
    expect(validateFindingsSearch({ 'filter.analytics_area': area, status: 'active' })).toEqual({
      'filter.analytics_area': area,
      status: 'active',
    });
  });
  it('drops invalid Area and status without losing valid list context', () => {
    expect(validateVocSearch({ view: 'inbox', 'filter.analytics_area': 'garbage' })).toEqual({
      view: 'inbox',
    });
    expect(
      validateFindingsSearch({
        managedSystem: ID,
        'filter.analytics_area': 'garbage',
        status: 'draft',
      }),
    ).toEqual({ managedSystem: ID });
  });
});

describe('Task and Survey report destination validation', () => {
  it.each([ID, 'unset'])('keeps intersecting Task and Survey filters for %s', (area) => {
    const task = {
      view: 'backlog',
      managedSystem: ID,
      param: ID,
      'filter.analytics_area': area,
      status: 'doing',
      status_group: 'in-flight',
      overdue: true,
      public_update: 'missing',
      reporter_update: 'needed',
    };
    expect(validateTasksSearch(task)).toEqual(task);
    const survey = {
      managedSystem: ID,
      selected: ID,
      'filter.analytics_area': area,
      status: 'open',
      follow_up: 'needed',
    };
    expect(validateSurveysSearch(survey)).toEqual(survey);
  });
  it.each(['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened'])(
    'keeps Task status %s',
    (status) => {
      expect(validateTasksSearch({ status })).toEqual({ status });
    },
  );
  it('drops invalid report filters while keeping scope and selection', () => {
    expect(
      validateTasksSearch({
        view: 'my',
        param: ID,
        'filter.analytics_area': 'bad',
        status: 'open',
        status_group: 'all',
        overdue: 'false',
        public_update: 'yes',
        reporter_update: 'all',
      }),
    ).toEqual({ view: 'my', param: ID });
    expect(
      validateSurveysSearch({
        selected: ID,
        'filter.analytics_area': 'bad',
        status: 'closed',
        follow_up: 'all',
      }),
    ).toEqual({ selected: ID });
  });
  it('accepts a hand-written overdue=true link after browser decoding', () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(validateTasksSearch(router.options.parseSearch('?view=backlog&overdue=true'))).toEqual({
      view: 'backlog',
      overdue: true,
    });
    expect(
      router.options.stringifySearch(
        validateTasksSearch(router.options.parseSearch('?view=backlog&overdue=true')),
      ),
    ).toBe('?view=backlog&overdue=true');
  });
});
