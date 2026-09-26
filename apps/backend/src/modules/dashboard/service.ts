import {
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
  DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  DASHBOARD_PERMISSION_REQUESTS_ROUTE,
  DASHBOARD_RELEASED_TASKS_ROUTE,
  DASHBOARD_UNASSIGNED_VOC_ROUTE,
  type DashboardSummary,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { actorFindingReadScope } from '../findings/authorization.js';
import { allManagedSystemIds } from '../managed-systems/read-projections.js';
import type { CheckService } from '../permissions/check-service.js';
import type { RequestService } from '../permissions/request-service.js';
import { type Scope, actorScopeForCapability } from '../permissions/scope-service.js';
import { actorSurveyReadScope } from '../surveys/authorization.js';
import type { CountVocsQuery } from '../voc/read-service.js';
import * as repo from './repo.js';

export interface DashboardActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

type DashboardDeps = {
  db: Db;
  checkService: CheckService;
  requestService: Pick<RequestService, 'listAllActive'>;
  vocReadService: { countVocs(args: { actor: DashboardActor; query: CountVocsQuery }): Promise<number> };
};

function isAuthorizationAbsence(error: unknown): error is HttpError {
  return error instanceof HttpError
    && (error.code === 'permission.denied' || error.code === 'permission.scope_required');
}

function inRequestedScope(scope: Scope, managedSystemId?: string): Scope | undefined {
  if (managedSystemId === undefined || managedSystemId === 'all') return scope;
  if (scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId)) {
    return { kind: 'scoped', managedSystemIds: [managedSystemId] };
  }
  return undefined;
}

function percent(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

function coverageStatus(value: number): 'good' | 'warn' | 'bad' {
  return value >= 75 ? 'good' : value >= 40 ? 'warn' : 'bad';
}

function includesManagedSystem(scope: Scope | undefined, managedSystemId: string): scope is Scope {
  return scope !== undefined
    && (scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId));
}

type SystemCoverage = NonNullable<DashboardSummary['by_managed_system'][number]['coverage']>;
type SystemQueues = NonNullable<DashboardSummary['by_managed_system'][number]['action_queues']>;

function coverageCell(value: number, total: number) {
  const coveragePercent = percent(value, total);
  return { value, total, percent: coveragePercent, status: coverageStatus(coveragePercent) };
}

async function managedSystemUnion(
  db: Db,
  workspaceId: string,
  scopes: Array<Scope | undefined>,
  selectedManagedSystemId?: string,
): Promise<string[]> {
  const managedSystemIds = scopes.some((scope) => scope?.kind === 'all')
    ? await allManagedSystemIds(db, workspaceId)
    : [...new Set(scopes.flatMap((scope) => scope?.kind === 'scoped' ? scope.managedSystemIds : []))];
  return selectedManagedSystemId === undefined
    ? managedSystemIds
    : managedSystemIds.filter((systemId) => systemId === selectedManagedSystemId);
}

export function createDashboardService(deps: DashboardDeps) {
  async function authorizationAbsent<T>(read: () => Promise<T>): Promise<T | undefined> {
    try {
      return await read();
    } catch (error) {
      if (isAuthorizationAbsence(error)) return undefined;
      throw error;
    }
  }

  async function getSummary(actor: DashboardActor, managedSystemId?: string): Promise<DashboardSummary> {
    // `all` is the public selector for no backing filter; repositories receive
    // undefined so they apply the actor's resolved scope rather than cast it as a UUID.
    const selectedManagedSystemId = managedSystemId === 'all' ? undefined : managedSystemId;
    const voc = (tab?: CountVocsQuery['tab']) => authorizationAbsent(() => deps.vocReadService.countVocs({
      actor,
      query: {
        view: 'inbox',
        ...(selectedManagedSystemId !== undefined ? { managed_system_id: selectedManagedSystemId } : {}),
        ...(tab !== undefined ? { tab } : {}),
      },
    }));

    const countSystemVocs = (
      systemId: string,
      query: Pick<CountVocsQuery, 'tab' | 'filter.severity' | 'analyticsAreaId'> = {},
    ) => deps.vocReadService.countVocs({
      actor,
      query: { view: 'inbox', managed_system_id: systemId, ...query },
    });

    const [findingScopeRaw, taskScopeRaw, surveyScopeRaw, vocScopeRaw] = await Promise.all([
      actorFindingReadScope(deps.db, actor, { requireElevatedRole: true }),
      actorScopeForCapability(deps.db, actor, 'finding.manage'),
      actorSurveyReadScope(deps.db, deps.checkService, actor),
      actorScopeForCapability(deps.db, actor, 'voc.read'),
    ]);
    const findingScope = inRequestedScope(findingScopeRaw, selectedManagedSystemId);
    const taskScope = inRequestedScope(taskScopeRaw, selectedManagedSystemId);
    const surveyScope = inRequestedScope(surveyScopeRaw, selectedManagedSystemId);
    const vocScope = inRequestedScope(vocScopeRaw, selectedManagedSystemId);
    const surveyScopeForDashboard = surveyScope
      ?? (actor.role_level === 'admin' ? surveyScopeRaw : undefined);
    // Survey read scope is data-derived for survey listing. Dashboard queue
    // visibility is permission-derived: an Admin can truthfully see an empty
    // outcome queue even when no survey exists to contribute an MS id.
    const canSeeSurveyQueue = actor.role_level === 'admin'
      || (surveyScopeForDashboard !== undefined
        && (surveyScopeForDashboard.kind === 'all' || surveyScopeForDashboard.managedSystemIds.length > 0));
    const queues: DashboardSummary['action_queues'] = [];
    const coverage: DashboardSummary['coverage'] = [];
    const kpis: DashboardSummary['kpis'] = {};

    const [openVoc, unassigned, highUnlinked] = await Promise.all([voc(), voc('unassigned'), voc('high-no-link')]);
    if (openVoc !== undefined) kpis.open_voc = openVoc;
    if (unassigned !== undefined) queues.push({ id: 'unassigned-voc', severity: 'urgent', count: unassigned,
      next_action: { label: 'Review VOCs', route: DASHBOARD_UNASSIGNED_VOC_ROUTE, intent: 'triage' },
      secondary_action: { label: 'Bulk assign', route: DASHBOARD_UNASSIGNED_VOC_ROUTE, intent: 'bulk_assign' } });
    if (highUnlinked !== undefined) queues.push({ id: 'high-severity-unlinked', severity: 'urgent', count: highUnlinked,
      next_action: { label: 'Review high severity VOCs', route: DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE, intent: 'triage' }, secondary_action: null });

    if (findingScope !== undefined && (findingScope.kind === 'all' || findingScope.managedSystemIds.length > 0)) {
      const [active, noExecution] = await Promise.all([
        repo.countActiveFindings(deps.db, actor.workspace_id, findingScope, selectedManagedSystemId),
        repo.countActiveFindingsWithoutExecution(deps.db, actor.workspace_id, findingScope, selectedManagedSystemId),
      ]);
      kpis.active_finding = active;
      queues.push({ id: 'actionable-finding-no-execution', severity: 'warn', count: noExecution,
        next_action: { label: 'Review Findings', route: DASHBOARD_ACTIONABLE_FINDINGS_ROUTE, intent: 'plan_execution' }, secondary_action: null });
      const executed = await repo.countActiveFindingsWithExecution(deps.db, actor.workspace_id, findingScope, selectedManagedSystemId);
      coverage.push({ id: 'finding-execution', value: executed, total: active, percent: percent(executed, active), status: coverageStatus(percent(executed, active)) });
    }

    if (taskScope !== undefined && (taskScope.kind === 'all' || taskScope.managedSystemIds.length > 0)) {
      kpis.tasks_in_flight = await repo.countTasksInFlight(deps.db, actor.workspace_id, taskScope, selectedManagedSystemId);
      const pendingTaskRequests = await repo.countPendingTaskRequests(deps.db, actor.workspace_id, taskScope, selectedManagedSystemId);
      kpis.pending_request = (kpis.pending_request ?? 0) + pendingTaskRequests;
      const unresolved = await repo.countReleasedTasksWithUnresolvedVoc(
        deps.db,
        actor.workspace_id,
        taskScope,
        selectedManagedSystemId,
      );
      queues.push({ id: 'released-task-unresolved-voc', severity: 'warn', count: unresolved,
        next_action: { label: 'Review released Tasks', route: DASHBOARD_RELEASED_TASKS_ROUTE, intent: 'request_reporter_update' }, secondary_action: null });
      const releasedUpdate = await repo.countReleasedTasksWithPublicUpdate(
        deps.db,
        actor.workspace_id,
        taskScope,
        selectedManagedSystemId,
      );
      const releasedUpdatePercent = percent(releasedUpdate.value, releasedUpdate.total);
      coverage.push({
        id: 'released-update',
        ...releasedUpdate,
        percent: releasedUpdatePercent,
        status: coverageStatus(releasedUpdatePercent),
      });
    }

    if (surveyScopeForDashboard !== undefined && canSeeSurveyQueue) {
      const gaps = await repo.countSurveyGaps(deps.db, actor.workspace_id, surveyScopeForDashboard, selectedManagedSystemId);
      queues.push({ id: 'bad-outcome-no-followup', severity: 'urgent', count: gaps,
        next_action: { label: 'Review outcome surveys', route: DASHBOARD_OUTCOME_SURVEYS_ROUTE, intent: 'create_followup' }, secondary_action: null });
    }

    const permissionRequests = await authorizationAbsent(() => deps.requestService.listAllActive(actor));
    if (permissionRequests !== undefined) {
      kpis.pending_request = (kpis.pending_request ?? 0) + permissionRequests.count;
      queues.push({ id: 'permission-requests-pending', severity: 'info', count: permissionRequests.count,
        next_action: { label: 'Open Requests', route: DASHBOARD_PERMISSION_REQUESTS_ROUTE, intent: 'review_permissions' }, secondary_action: null });
    }

    if (openVoc !== undefined) {
      const selectedVocScope = vocScope;
      if (selectedVocScope !== undefined && (selectedVocScope.kind === 'all' || selectedVocScope.managedSystemIds.length > 0)) {
        const [vocTask, analytics] = await Promise.all([
          repo.countVocsWithTask(deps.db, actor.workspace_id, selectedVocScope, selectedManagedSystemId),
          repo.countAnalyticsAreaVocCoverage(deps.db, actor.workspace_id, selectedVocScope, selectedManagedSystemId),
        ]);
        const vocTaskPercent = percent(vocTask.value, vocTask.total);
        coverage.push({ id: 'voc-task', ...vocTask, percent: vocTaskPercent, status: coverageStatus(vocTaskPercent) });
        const analyticsPercent = percent(analytics.value, analytics.total);
        coverage.push({ id: 'analytics-area', ...analytics, percent: analyticsPercent, status: coverageStatus(analyticsPercent) });
        kpis.coverage_percent = vocTaskPercent;
      }
    }

    // milestone-outcome has no MVP Milestone table or backing filter. Omit it.
    // high-followup has the same absence rule as the high-severity queue.
    if (highUnlinked !== undefined && openVoc !== undefined) {
      const totalHigh = await authorizationAbsent(() => deps.vocReadService.countVocs({ actor, query: {
        view: 'inbox', ...(selectedManagedSystemId !== undefined ? { managed_system_id: selectedManagedSystemId } : {}),
        'filter.severity': ['high', 'critical'],
      } }));
      if (totalHigh !== undefined) {
        const followed = totalHigh - highUnlinked;
        const highPercent = percent(followed, totalHigh);
        coverage.push({ id: 'high-followup', value: followed, total: totalHigh, percent: highPercent, status: coverageStatus(highPercent) });
      }
    }

    const managedSystemIds = await managedSystemUnion(
      deps.db,
      actor.workspace_id,
      [vocScope, findingScope, taskScope, surveyScope],
      selectedManagedSystemId,
    );
    const byManagedSystem: DashboardSummary['by_managed_system'] = [];
    for (const systemId of managedSystemIds) {
      const row: DashboardSummary['by_managed_system'][number] = { managed_system_id: systemId };
      const rowCoverage: SystemCoverage = {};
      const rowQueues: SystemQueues = {};

      if (includesManagedSystem(vocScope, systemId)) {
        const [systemVoc, unassigned, highUnlinked, totalHigh, vocTask, analytics] = await Promise.all([
          countSystemVocs(systemId),
          countSystemVocs(systemId, { tab: 'unassigned' }),
          countSystemVocs(systemId, { tab: 'high-no-link' }),
          countSystemVocs(systemId, { 'filter.severity': ['high', 'critical'] }),
          repo.countVocsWithTask(deps.db, actor.workspace_id, vocScope, systemId),
          repo.countAnalyticsAreaVocCoverage(deps.db, actor.workspace_id, vocScope, systemId),
        ]);
        rowCoverage['voc-task'] = coverageCell(vocTask.value, systemVoc);
        rowCoverage['analytics-area'] = coverageCell(analytics.value, systemVoc);
        rowQueues['unassigned-voc'] = unassigned;
        rowQueues['high-severity-unlinked'] = highUnlinked;
        rowCoverage['high-followup'] = coverageCell(totalHigh - highUnlinked, totalHigh);

        const areaIds = await repo.listVocAnalyticsAreaIds(deps.db, actor.workspace_id, systemId);
        if (areaIds.length > 0) {
          row.analytics_areas = await Promise.all(areaIds.map(async (areaId) => {
            const [areaVoc, areaUnassigned, areaHighUnlinked, areaTotalHigh, areaVocTask] = await Promise.all([
              countSystemVocs(systemId, { analyticsAreaId: areaId }),
              countSystemVocs(systemId, { tab: 'unassigned', analyticsAreaId: areaId }),
              countSystemVocs(systemId, { tab: 'high-no-link', analyticsAreaId: areaId }),
              countSystemVocs(systemId, { 'filter.severity': ['high', 'critical'], analyticsAreaId: areaId }),
              repo.countVocsWithTask(deps.db, actor.workspace_id, vocScope, systemId, areaId),
            ]);
            return {
              analytics_area_id: areaId,
              coverage: {
                'voc-task': coverageCell(areaVocTask.value, areaVoc),
                'high-followup': coverageCell(areaTotalHigh - areaHighUnlinked, areaTotalHigh),
              },
              action_queues: {
                'unassigned-voc': areaUnassigned,
                'high-severity-unlinked': areaHighUnlinked,
              },
            };
          }));
        }
      }

      if (includesManagedSystem(findingScope, systemId)) {
        const [active, noExecution, executed] = await Promise.all([
          repo.countActiveFindings(deps.db, actor.workspace_id, findingScope, systemId),
          repo.countActiveFindingsWithoutExecution(deps.db, actor.workspace_id, findingScope, systemId),
          repo.countActiveFindingsWithExecution(deps.db, actor.workspace_id, findingScope, systemId),
        ]);
        rowCoverage['finding-execution'] = coverageCell(executed, active);
        rowQueues['actionable-finding-no-execution'] = noExecution;
      }

      if (includesManagedSystem(taskScope, systemId)) {
        const [unresolved, releasedUpdate] = await Promise.all([
          repo.countReleasedTasksWithUnresolvedVoc(deps.db, actor.workspace_id, taskScope, systemId),
          repo.countReleasedTasksWithPublicUpdate(deps.db, actor.workspace_id, taskScope, systemId),
        ]);
        rowCoverage['released-update'] = coverageCell(releasedUpdate.value, releasedUpdate.total);
        rowQueues['released-task-unresolved-voc'] = unresolved;
      }

      const canSeeSurveyQueue = actor.role_level === 'admin'
        || includesManagedSystem(surveyScope, systemId);
      if (canSeeSurveyQueue && surveyScopeForDashboard !== undefined) {
        rowQueues['bad-outcome-no-followup'] = await repo.countSurveyGaps(
          deps.db,
          actor.workspace_id,
          surveyScopeForDashboard,
          systemId,
        );
      }

      if (Object.keys(rowCoverage).length > 0) row.coverage = rowCoverage;
      if (Object.keys(rowQueues).length > 0) row.action_queues = rowQueues;
      byManagedSystem.push(row);
    }
    return { kpis, action_queues: queues, coverage, by_managed_system: byManagedSystem };
  }
  return { getSummary };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
