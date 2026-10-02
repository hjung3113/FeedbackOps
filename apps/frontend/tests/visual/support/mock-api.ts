import type { Page } from '@playwright/test';
import {
  populatedInboxNotifications,
  subjectReferenceInboxNotifications,
} from '../fixtures/notifications';
import { createPermissionRequestsScenario } from '../fixtures/permissions';
import { IDS } from '../fixtures/voc-clusters';
import { VOC_REPORTER_TASK_SUMMARY_IDS } from '../fixtures/voc-reporter-task-summary';
import { createScenario } from '../scenarios';
import { createPermissionContextHandlers } from './mock-api/access';
import { createAdminMutationHandlers, createWorkspaceSettingHandlers } from './mock-api/admin';
import { createCommonHandlers, createDefaultActorHandlers } from './mock-api/common';
import { createDashboardHandlers } from './mock-api/dashboard';
import { createCommentHandlers, createFindingListFallbackHandlers } from './mock-api/fallback';
import { createFindingHandlers } from './mock-api/finding';
import { createHomeRequestHandlers } from './mock-api/home';
import { createManagedSystemHandlers } from './mock-api/managed-systems';
import { createMilestoneHandlers } from './mock-api/milestones';
import { createPermissionRequestHandlers } from './mock-api/permissions';
import { createSavedViewHandlers } from './mock-api/saved-views';
import { matchMockApiHandler } from './mock-api/shared';
import {
  createSurveyActorHandlers,
  createSurveyHandlers,
  createSurveyManagedSystemHandlers,
} from './mock-api/surveys';
import type { MockApiContext } from './mock-api/types';
import type { InstallOptions, InstalledMockApi, SavedView } from './mock-api/types';
import { createVocHandlers } from './mock-api/voc';
import {
  createVocClusterDetailHandlers,
  createVocClusterListHandlers,
} from './mock-api/voc-clusters';

export type { InstalledMockApi, RoleLevel } from './mock-api/types';
export { parsePermissionDecisionBody } from './mock-api/permissions';

const fetchResourceTypes = new Set(['fetch', 'xhr']);

export async function installMockApi(
  page: Page,
  options: InstallOptions = {},
): Promise<InstalledMockApi> {
  const scenario = createScenario(options.scenario);
  const postedBodies: unknown[] = [];
  const postedRequests: InstalledMockApi['postedRequests'] = [];
  const permissionRequests = createPermissionRequestsScenario(options.permissionScenario);
  const savedViews: SavedView[] = [];
  if (options.savedViews) {
    savedViews.push({
      id: 'saved-view-1',
      surface: 'voc',
      name: 'High priority',
      filter: { view: 'inbox', 'filter.severity': 'high,critical' },
      created_at: '2026-07-28T00:00:00.000Z',
      updated_at: '2026-07-28T00:00:00.000Z',
    });
  }
  const role = options.role ?? 'admin';
  const reporterActorId = options.vocReporterTaskSummary
    ? VOC_REPORTER_TASK_SUMMARY_IDS.reporter
    : IDS.actor;
  const context: MockApiContext = {
    options,
    scenario,
    postedBodies,
    postedRequests,
    permissionRequests,
    savedViews,
    notificationItems:
      options.notifications === 'populated'
        ? [...populatedInboxNotifications.items]
        : options.notifications === 'subject-references'
          ? [...subjectReferenceInboxNotifications.items]
          : [],
    role,
    reporterActorId,
  };
  const baseOrigin = new URL(`http://127.0.0.1:${process.env.PW_PORT ?? '4173'}`).origin;

  // Array order is the first-match precedence from the original handler chain.
  const handlers = [
    ...createCommonHandlers(context),
    ...createDashboardHandlers(context),
    ...createMilestoneHandlers(context),
    ...createHomeRequestHandlers(context),
    ...createSavedViewHandlers(),
    ...createVocHandlers(context),
    ...createPermissionContextHandlers(),
    ...createFindingHandlers(context),
    ...createSurveyActorHandlers(context),
    ...createDefaultActorHandlers(),
    ...createAdminMutationHandlers(context),
    ...createWorkspaceSettingHandlers(context),
    ...createSurveyHandlers(context),
    ...createPermissionRequestHandlers(),
    ...createVocClusterListHandlers(),
    ...createSurveyManagedSystemHandlers(context),
    ...createManagedSystemHandlers(),
    ...createFindingListFallbackHandlers(),
    ...createCommentHandlers(),
    ...createVocClusterDetailHandlers(),
  ];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseOrigin || !fetchResourceTypes.has(request.resourceType())) {
      await route.continue();
      return;
    }

    for (const handler of handlers) {
      const pathMatch = matchMockApiHandler(handler, request.method(), url);
      if (!pathMatch) continue;
      await handler.handle(route, context, url, pathMatch);
      return;
    }

    throw new Error(
      `Unmatched same-origin ${request.resourceType()} request: ${request.method()} ${url}`,
    );
  });

  return { postedBodies, postedRequests, scenario };
}
