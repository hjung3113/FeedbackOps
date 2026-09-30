import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  validateSearch: (raw: unknown) => unknown;
  raw: Record<string, unknown>;
  expected: Record<string, unknown>;
}> = [
  {
    name: 'Tasks',
    validateSearch: validateTasksSearch,
    raw: { view: 'list', param: 'task-1', unknown: 'ignored' },
    expected: { param: 'task-1' },
  },
  {
    name: 'VOC',
    validateSearch: validateVocSearch,
    raw: { view: 'list', selected: ID, tab: 'not-a-tab' },
    expected: { selected: ID },
  },
  {
    name: 'Home',
    validateSearch: validateHomeSearch,
    raw: { managedSystem: ID, tab: 'not-a-tab' },
    expected: { managedSystem: ID },
  },
  {
    name: 'Integration dashboard',
    validateSearch: validateIntegrationDashboardSearch,
    raw: { managedSystem: 'not-a-uuid' },
    expected: {},
  },
  {
    name: 'Integration coverage',
    validateSearch: validateIntegrationCoverageSearch,
    raw: { managedSystem: 'not-a-uuid' },
    expected: {},
  },
  {
    name: 'Integration links',
    validateSearch: validateIntegrationLinksSearch,
    raw: { status: 'deleted', type: 'related_to' },
    expected: { type: 'related_to' },
  },
  {
    name: 'VOC Clusters',
    validateSearch: validateVocClustersSearch,
    raw: { managedSystem: 'all', selected: 'not-a-uuid' },
    expected: { managedSystem: 'all' },
  },
  {
    name: 'Analytics Areas',
    validateSearch: validateAnalyticsAreasSearch,
    raw: { selected: ID, includeArchived: 'true' },
    expected: { selected: ID },
  },
  {
    name: 'Permission Requests',
    validateSearch: validatePermissionRequestsSearch,
    raw: { selected: ID, tab: 'pending' },
    expected: { selected: ID },
  },
  {
    name: 'Findings',
    validateSearch: validateFindingsSearch,
    raw: { selected: 'not-a-uuid', execution: 'none' },
    expected: { execution: 'none' },
  },
  {
    name: 'Surveys',
    validateSearch: validateSurveysSearch,
    raw: { managedSystem: 'all', selected: 'not-a-uuid' },
    expected: { managedSystem: 'all' },
  },
  {
    name: 'Survey detail',
    validateSearch: validateSurveyDetailSearch,
    raw: { builder: 'yes' },
    expected: {},
  },
];

describe('route search validation', () => {
  it.each(routeCases)('$name drops invalid values and keeps valid search state', (routeCase) => {
    expect(routeCase.validateSearch(routeCase.raw)).toEqual(routeCase.expected);
  });

  it('renders the default Tasks view after an invalid view value', () => {
    render(<TasksRouteView search={validateTasksSearch({ view: 'list' })} />);

    expect(screen.getByText('Task list view')).toBeInTheDocument();
  });
});
