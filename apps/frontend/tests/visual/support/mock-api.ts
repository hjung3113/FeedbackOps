import {
  addVocClusterMemberRequestSchema,
  approvePermissionRequestSchema,
  denyPermissionRequestSchema,
  linkExistingFindingToVocClusterRequestSchema,
  needMoreInfoPermissionRequestSchema,
  permissionDecisionResultSchema,
  rejectPermissionRequestSchema,
  vocClusterDtoSchema,
} from '@fops/shared';
import type { Page, Route } from '@playwright/test';
import {
  VOC_REVIEW_IDS,
  populatedReviewCandidates,
  populatedReviewConversationPage,
  populatedReviewVoc,
} from '../fixtures/voc-public-update-review';
import {
  VOC_REPORTER_TASK_SUMMARY_IDS,
  reporterTaskSummaryConversationPage,
  reporterTaskSummaryVoc,
} from '../fixtures/voc-reporter-task-summary';

import {
  type PermissionScenarioName,
  createPermissionRequestsScenario,
  permissionDecisionResultTemplates,
} from '../fixtures/permissions';
import {
  type SurveyResultsVisualScenario,
  surveyResultVisualFixture,
  surveyResultVisualListFixture,
  surveyResultsFixtureFor,
} from '../fixtures/survey-results';
import {
  type SurveyVisualScenario,
  surveyVisualFixture,
  surveyVisualFixtureSchema,
} from '../fixtures/surveys';
import { IDS, managedSystems, memberFromCandidate } from '../fixtures/voc-clusters';
import { type ScenarioName, type VisualScenario, createScenario } from '../scenarios';

export type RoleLevel = 'admin' | 'developer' | 'user';

export interface InstalledMockApi {
  postedBodies: unknown[];
  postedRequests: Array<{
    body: unknown;
    idempotencyKey: string | null;
    pathname: string;
  }>;
  scenario: VisualScenario;
}

interface InstallOptions {
  permissionScenario?: PermissionScenarioName;
  role?: RoleLevel;
  scenario?: ScenarioName;
  /** Issue #180 VOC detail surface; schemas validate its fixture at import. */
  vocReview?: boolean;
  /** Issue #179 reporter-safe linked Task summary surface. */
  vocReporterTaskSummary?: boolean;
  surveyScenario?: SurveyVisualScenario;
  surveyResultsScenario?: SurveyResultsVisualScenario;
}

const fetchResourceTypes = new Set(['fetch', 'xhr']);

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function errorEnvelope(status: number): { code: string; message: string } {
  return {
    code: status === 404 ? 'not_found.record' : 'internal.unexpected',
    message: status === 404 ? 'record not found' : 'unexpected test error',
  };
}

function isRequest(
  route: Route,
  method: string,
  pathname: string,
  query?: (params: URLSearchParams) => boolean,
): boolean {
  const url = new URL(route.request().url());
  return (
    route.request().method() === method &&
    url.pathname === pathname &&
    (!query || query(url.searchParams))
  );
}

export async function installMockApi(
  page: Page,
  options: InstallOptions = {},
): Promise<InstalledMockApi> {
  const scenario = createScenario(options.scenario);
  const postedBodies: unknown[] = [];
  const postedRequests: InstalledMockApi['postedRequests'] = [];
  const permissionRequests = createPermissionRequestsScenario(options.permissionScenario);
  const role = options.role ?? 'admin';
  const reporterActorId = options.vocReporterTaskSummary
    ? VOC_REPORTER_TASK_SUMMARY_IDS.reporter
    : IDS.actor;
  const baseOrigin = new URL(`http://127.0.0.1:${process.env.PW_PORT ?? '4173'}`).origin;

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseOrigin || !fetchResourceTypes.has(request.resourceType())) {
      await route.continue();
      return;
    }

    if (isRequest(route, 'GET', '/me')) {
      await json(route, 200, {
        actor: {
          id: reporterActorId,
          external_id: `visual-${role}`,
          email: `${role}@example.test`,
          display_name: `Visual ${role}`,
          role_level: role,
        },
        workspace_id: IDS.workspace,
      });
      return;
    }

    if (options.vocReview && isRequest(route, 'GET', '/vocs')) {
      await json(route, 200, { items: [populatedReviewVoc] });
      return;
    }

    if (options.vocReporterTaskSummary && isRequest(route, 'GET', '/vocs')) {
      await json(route, 200, { items: [reporterTaskSummaryVoc] });
      return;
    }

    if (
      options.vocReporterTaskSummary &&
      isRequest(route, 'GET', `/vocs/${VOC_REPORTER_TASK_SUMMARY_IDS.voc}`)
    ) {
      await json(route, 200, reporterTaskSummaryVoc);
      return;
    }

    if (
      options.vocReporterTaskSummary &&
      isRequest(route, 'GET', `/vocs/${VOC_REPORTER_TASK_SUMMARY_IDS.voc}/conversation`)
    ) {
      await json(route, 200, reporterTaskSummaryConversationPage);
      return;
    }

    if (options.vocReview && isRequest(route, 'GET', `/vocs/${VOC_REVIEW_IDS.voc}`)) {
      await json(route, 200, populatedReviewVoc);
      return;
    }

    if (options.vocReview && isRequest(route, 'GET', `/vocs/${VOC_REVIEW_IDS.voc}/conversation`)) {
      await json(route, 200, populatedReviewConversationPage);
      return;
    }

    if (
      options.vocReview &&
      isRequest(route, 'GET', `/vocs/${VOC_REVIEW_IDS.voc}/public-update-candidates`)
    ) {
      await json(route, 200, populatedReviewCandidates);
      return;
    }

    if (options.vocReview && isRequest(route, 'GET', '/actors')) {
      await json(route, 200, { actors: [] });
      return;
    }

    if (options.vocReporterTaskSummary && isRequest(route, 'GET', '/actors')) {
      await json(route, 200, { actors: [] });
      return;
    }

    if (options.vocReview && isRequest(route, 'GET', '/analytics-areas')) {
      await json(route, 200, { items: [], total: 0 });
      return;
    }

    if (options.vocReporterTaskSummary && isRequest(route, 'GET', '/analytics-areas')) {
      await json(route, 200, { items: [], total: 0 });
      return;
    }

    if (isRequest(route, 'GET', '/me/permissions/check')) {
      await json(route, 200, {
        state: role === 'admin' ? 'approved' : 'blocked_non_requestable',
        decision: { allow: role === 'admin' },
      });
      return;
    }

    if (options.surveyScenario && isRequest(route, 'GET', '/surveys')) {
      const scenario = options.surveyScenario;
      await json(
        route,
        scenario === 'error' ? 500 : 200,
        scenario === 'error'
          ? errorEnvelope(500)
          : scenario === 'empty'
            ? []
            : [surveyVisualFixtureSchema.parse(surveyVisualFixture)],
      );
      return;
    }

    if (options.surveyResultsScenario && isRequest(route, 'GET', '/surveys')) {
      await json(route, 200, surveyResultVisualListFixture);
      return;
    }

    if (
      options.surveyResultsScenario &&
      isRequest(route, 'GET', `/surveys/${surveyResultVisualFixture.id}`)
    ) {
      await json(route, 200, surveyResultVisualFixture);
      return;
    }

    if (
      options.surveyResultsScenario &&
      isRequest(route, 'GET', `/surveys/${surveyResultVisualFixture.id}/results`)
    ) {
      await json(route, 200, surveyResultsFixtureFor(options.surveyResultsScenario));
      return;
    }

    if (options.surveyScenario && isRequest(route, 'GET', `/surveys/${surveyVisualFixture.id}`)) {
      await json(route, 200, surveyVisualFixtureSchema.parse(surveyVisualFixture));
      return;
    }

    if (isRequest(route, 'GET', '/permissions/requests')) {
      await json(route, 200, {
        requests: permissionRequests,
        count: permissionRequests.length,
      });
      return;
    }

    const permissionDecisionMatch = url.pathname.match(
      /^\/permissions\/requests\/([^/]+)\/(approve|reject|need-more-info|deny)$/,
    );
    if (request.method() === 'POST' && permissionDecisionMatch) {
      const [, requestId, rawAction] = permissionDecisionMatch;
      const action = rawAction as keyof typeof permissionDecisionResultTemplates | undefined;
      if (!requestId || !action)
        throw new Error(`Missing permission decision target for ${request.method()} ${url}`);
      const rawBody = request.postDataJSON();
      const body = parsePermissionDecisionBody(action, rawBody);
      postedBodies.push(body);
      postedRequests.push({
        body,
        idempotencyKey: await request.headerValue('Idempotency-Key'),
        pathname: url.pathname,
      });
      const target = permissionRequests.find((candidate) => candidate.id === requestId);
      if (!target)
        throw new Error(`No mutable permission request fixture for ${request.method()} ${url}`);
      const template = permissionDecisionResultTemplates[action];
      target.status = template.status;
      await json(route, 200, permissionDecisionResultSchema.parse({ ...template, id: requestId }));
      return;
    }

    if (isRequest(route, 'GET', '/voc-clusters')) {
      await json(
        route,
        scenario.list.status,
        scenario.list.status === 200
          ? { items: scenario.list.items }
          : errorEnvelope(scenario.list.status),
      );
      return;
    }

    if (isRequest(route, 'GET', '/managed-systems')) {
      await json(route, 200, managedSystems);
      return;
    }

    if (isRequest(route, 'GET', '/findings')) {
      await json(route, 200, { items: scenario.findings });
      return;
    }

    const candidateMatch = url.pathname.match(/^\/voc-clusters\/([^/]+)\/candidate-peers$/);
    if (request.method() === 'GET' && candidateMatch) {
      await json(route, 200, scenario.candidates);
      return;
    }

    const addMemberMatch = url.pathname.match(/^\/voc-clusters\/([^/]+)\/vocs$/);
    if (request.method() === 'POST' && addMemberMatch) {
      const clusterId = addMemberMatch[1];
      if (!clusterId) throw new Error(`Missing cluster id for ${request.method()} ${url}`);
      const body = addVocClusterMemberRequestSchema.parse(request.postDataJSON());
      postedBodies.push(body);
      const detail = scenario.details[clusterId];
      if (!detail?.cluster)
        throw new Error(`No mutable cluster fixture for ${request.method()} ${url}`);
      if (detail.cluster.members?.some((member) => member.voc_id === body.voc_id)) {
        throw new Error(`Candidate is already a member for ${request.method()} ${url}`);
      }
      detail.cluster = vocClusterDtoSchema.parse({
        ...detail.cluster,
        member_count: detail.cluster.member_count + 1,
        members: [...(detail.cluster.members ?? []), memberFromCandidate()],
      });
      await route.fulfill({ status: 204 });
      return;
    }

    const linkFindingMatch = url.pathname.match(/^\/voc-clusters\/([^/]+)\/link-finding$/);
    if (request.method() === 'POST' && linkFindingMatch) {
      const clusterId = linkFindingMatch[1];
      if (!clusterId) throw new Error(`Missing cluster id for ${request.method()} ${url}`);
      const body = linkExistingFindingToVocClusterRequestSchema.parse(request.postDataJSON());
      postedBodies.push(body);
      postedRequests.push({
        body,
        idempotencyKey: await request.headerValue('Idempotency-Key'),
        pathname: url.pathname,
      });
      const detail = scenario.details[clusterId];
      const finding = scenario.findings.find((candidate) => candidate.id === body.finding_id);
      if (!detail?.cluster || !finding)
        throw new Error(`No linkable Finding fixture for ${request.method()} ${url}`);
      const linked = {
        id: finding.id,
        display_id: finding.display_id,
        status: finding.status,
      } as const;
      detail.cluster = vocClusterDtoSchema.parse({
        ...detail.cluster,
        linked_findings: [
          ...(detail.cluster.linked_findings ?? []).filter((item) => item.id !== finding.id),
          linked,
        ],
      });
      await json(route, 201, linked);
      return;
    }

    const detailMatch = url.pathname.match(/^\/voc-clusters\/([^/]+)$/);
    if (request.method() === 'GET' && detailMatch) {
      const clusterId = detailMatch[1];
      if (!clusterId) throw new Error(`Missing cluster id for ${request.method()} ${url}`);
      const response = scenario.details[clusterId] ?? { status: 404 };
      await json(
        route,
        response.status,
        response.status === 200 ? response.cluster : errorEnvelope(response.status),
      );
      return;
    }

    throw new Error(
      `Unmatched same-origin ${request.resourceType()} request: ${request.method()} ${url}`,
    );
  });

  return { postedBodies, postedRequests, scenario };
}

function parsePermissionDecisionBody(
  action: keyof typeof permissionDecisionResultTemplates,
  body: unknown,
): unknown {
  switch (action) {
    case 'approve':
      return approvePermissionRequestSchema.parse(body);
    case 'reject':
      return rejectPermissionRequestSchema.parse(body);
    case 'need-more-info':
      return needMoreInfoPermissionRequestSchema.parse(body);
    case 'deny':
      return denyPermissionRequestSchema.parse(body);
  }
}
