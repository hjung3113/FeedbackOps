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
import { actorFindingReadScope } from '../findings/authorization.js';
import { allManagedSystemIds } from '../managed-systems/read-projections.js';
import type { CheckService } from '../permissions/check-service.js';
import { isAuthorizationAbsence } from '../permissions/read-utility.js';
import type { RequestService } from '../permissions/request-service.js';
import { type Scope, actorScopeForCapability } from '../permissions/scope-service.js';
import { actorSurveyReadScope, checkSurveyRead } from '../surveys/authorization.js';
import type { VocGroupedCountReader, VocGroupedCountRow } from '../voc/index.js';
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
  vocReadService: VocGroupedCountReader;
};

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
  return (
    scope !== undefined &&
    (scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId))
  );
}

type SystemCoverage = NonNullable<DashboardSummary['by_managed_system'][number]['coverage']>;
type SystemQueues = NonNullable<DashboardSummary['by_managed_system'][number]['action_queues']>;
type SystemKpis = NonNullable<DashboardSummary['by_managed_system'][number]['kpis']>;

type AggregatedVocCounts = {
  total: number;
  unassigned: number;
  highNoLink: number;
  highSeverity: number;
  withTask: number;
  withAnalyticsArea: number;
};

function emptyAggregatedVocCounts(): AggregatedVocCounts {
  return {
    total: 0,
    unassigned: 0,
    highNoLink: 0,
    highSeverity: 0,
    withTask: 0,
    withAnalyticsArea: 0,
  };
}

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
    : [
        ...new Set(
          scopes.flatMap((scope) => (scope?.kind === 'scoped' ? scope.managedSystemIds : [])),
        ),
      ];
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

  async function getSummary(
    actor: DashboardActor,
    managedSystemId?: string,
  ): Promise<DashboardSummary> {
    // `all` is the public selector for no backing filter; repositories receive
    // undefined so they apply the actor's resolved scope rather than cast it as a UUID.
    const selectedManagedSystemId = managedSystemId === 'all' ? undefined : managedSystemId;
    const [findingScopeRaw, taskScopeRaw, surveyScopeRaw, vocScopeRaw] = await Promise.all([
      actorFindingReadScope(deps.db, actor, { requireElevatedRole: true }),
      actorScopeForCapability(deps.db, actor, 'finding.manage'),
      actorSurveyReadScope(deps.db, deps.checkService, actor),
      actorScopeForCapability(deps.db, actor, 'voc.read'),
    ]);
    // Reuse this scope in the grouped VOC read so metric counts do not resolve it again.
    const groupedVocCounts = await authorizationAbsent(() =>
      deps.vocReadService.countGroupedVocs({
        actor,
        readScope: vocScopeRaw,
        ...(selectedManagedSystemId !== undefined ? { managedSystemId: selectedManagedSystemId } : {}),
      }),
    );
    const vocCountsBySystem = new Map<string, AggregatedVocCounts>();
    const vocCountsByArea = new Map<string, Map<string, VocGroupedCountRow>>();
    for (const count of groupedVocCounts ?? []) {
      const systemCounts =
        vocCountsBySystem.get(count.managed_system_id) ?? emptyAggregatedVocCounts();
      systemCounts.total += count.total;
      systemCounts.unassigned += count.unassigned;
      systemCounts.highNoLink += count.high_no_link;
      systemCounts.highSeverity += count.high_severity;
      systemCounts.withTask += count.with_task;
      if (count.analytics_area_id !== null) {
        systemCounts.withAnalyticsArea += count.total;
        const areas =
          vocCountsByArea.get(count.managed_system_id) ?? new Map<string, VocGroupedCountRow>();
        areas.set(count.analytics_area_id, count);
        vocCountsByArea.set(count.managed_system_id, areas);
      }
      vocCountsBySystem.set(count.managed_system_id, systemCounts);
    }
    const sumGroupedVocCounts = (select: (row: VocGroupedCountRow) => number) =>
      groupedVocCounts?.reduce((total, row) => total + select(row), 0);
    const openVoc = sumGroupedVocCounts((row) => row.total);
    const unassigned = sumGroupedVocCounts((row) => row.unassigned);
    const highUnlinked = sumGroupedVocCounts((row) => row.high_no_link);
    const totalHigh = sumGroupedVocCounts((row) => row.high_severity);
    const findingScope = inRequestedScope(findingScopeRaw, selectedManagedSystemId);
    const taskScope = inRequestedScope(taskScopeRaw, selectedManagedSystemId);
    const surveyScope = inRequestedScope(surveyScopeRaw, selectedManagedSystemId);
    const vocScope = inRequestedScope(vocScopeRaw, selectedManagedSystemId);
    const surveyScopeForDashboard =
      surveyScope ?? (actor.role_level === 'admin' ? surveyScopeRaw : undefined);
    // Survey read scope is data-derived for survey listing. Dashboard queue
    // visibility is permission-derived: an Admin can truthfully see an empty
    // outcome queue even when no survey exists to contribute an MS id.
    const canSeeSurveyQueue =
      actor.role_level === 'admin' ||
      (surveyScopeForDashboard !== undefined &&
        (surveyScopeForDashboard.kind === 'all' ||
          surveyScopeForDashboard.managedSystemIds.length > 0));
    const queues: DashboardSummary['action_queues'] = [];
    const coverage: DashboardSummary['coverage'] = [];
    const kpis: DashboardSummary['kpis'] = {};

    if (openVoc !== undefined) kpis.open_voc = openVoc;
    if (unassigned !== undefined)
      queues.push({
        id: 'unassigned-voc',
        severity: 'urgent',
        count: unassigned,
        next_action: {
          label: 'Review VOCs',
          route: DASHBOARD_UNASSIGNED_VOC_ROUTE,
          intent: 'triage',
        },
        secondary_action: {
          label: 'Bulk assign',
          route: DASHBOARD_UNASSIGNED_VOC_ROUTE,
          intent: 'bulk_assign',
        },
      });
    if (highUnlinked !== undefined)
      queues.push({
        id: 'high-severity-unlinked',
        severity: 'urgent',
        count: highUnlinked,
        next_action: {
          label: 'Review high severity VOCs',
          route: DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
          intent: 'triage',
        },
        secondary_action: null,
      });

    if (
      findingScope !== undefined &&
      (findingScope.kind === 'all' || findingScope.managedSystemIds.length > 0)
    ) {
      const [active, noExecution] = await Promise.all([
        repo.countActiveFindings(
          deps.db,
          actor.workspace_id,
          findingScope,
          selectedManagedSystemId,
        ),
        repo.countActiveFindingsWithoutExecution(
          deps.db,
          actor.workspace_id,
          findingScope,
          selectedManagedSystemId,
        ),
      ]);
      kpis.active_finding = active;
      queues.push({
        id: 'actionable-finding-no-execution',
        severity: 'warn',
        count: noExecution,
        next_action: {
          label: 'Review Findings',
          route: DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
          intent: 'plan_execution',
        },
        secondary_action: null,
      });
      const executed = await repo.countActiveFindingsWithExecution(
        deps.db,
        actor.workspace_id,
        findingScope,
        selectedManagedSystemId,
      );
      coverage.push({
        id: 'finding-execution',
        value: executed,
        total: active,
        percent: percent(executed, active),
        status: coverageStatus(percent(executed, active)),
      });
    }

    if (
      taskScope !== undefined &&
      (taskScope.kind === 'all' || taskScope.managedSystemIds.length > 0)
    ) {
      kpis.tasks_in_flight = await repo.countTasksInFlight(
        deps.db,
        actor.workspace_id,
        taskScope,
        selectedManagedSystemId,
      );
      const pendingTaskRequests = await repo.countPendingTaskRequests(
        deps.db,
        actor.workspace_id,
        taskScope,
        selectedManagedSystemId,
      );
      kpis.pending_request = (kpis.pending_request ?? 0) + pendingTaskRequests;
      const unresolved = await repo.countReleasedTasksWithUnresolvedVoc(
        deps.db,
        actor.workspace_id,
        taskScope,
        selectedManagedSystemId,
      );
      queues.push({
        id: 'released-task-unresolved-voc',
        severity: 'warn',
        count: unresolved,
        next_action: {
          label: 'Review released Tasks',
          route: DASHBOARD_RELEASED_TASKS_ROUTE,
          intent: 'request_reporter_update',
        },
        secondary_action: null,
      });
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
      const gaps = await repo.countSurveyGaps(
        deps.db,
        actor.workspace_id,
        surveyScopeForDashboard,
        selectedManagedSystemId,
      );
      queues.push({
        id: 'bad-outcome-no-followup',
        severity: 'urgent',
        count: gaps,
        next_action: {
          label: 'Review outcome surveys',
          route: DASHBOARD_OUTCOME_SURVEYS_ROUTE,
          intent: 'create_followup',
        },
        secondary_action: null,
      });
    }

    const permissionRequests = await authorizationAbsent(() =>
      deps.requestService.listAllActive(actor),
    );
    if (permissionRequests !== undefined) {
      kpis.pending_request = (kpis.pending_request ?? 0) + permissionRequests.count;
      queues.push({
        id: 'permission-requests-pending',
        severity: 'info',
        count: permissionRequests.count,
        next_action: {
          label: 'Open Requests',
          route: DASHBOARD_PERMISSION_REQUESTS_ROUTE,
          intent: 'review_permissions',
        },
        secondary_action: null,
      });
    }

    if (
      openVoc !== undefined &&
      vocScope !== undefined &&
      (vocScope.kind === 'all' || vocScope.managedSystemIds.length > 0)
    ) {
      const vocTaskValue = sumGroupedVocCounts((row) => row.with_task)!;
      const analyticsAreaValue = sumGroupedVocCounts(
        (row) => (row.analytics_area_id !== null ? row.total : 0),
      )!;
      const vocTaskPercent = percent(vocTaskValue, openVoc);
      coverage.push({
        id: 'voc-task',
        value: vocTaskValue,
        total: openVoc,
        percent: vocTaskPercent,
        status: coverageStatus(vocTaskPercent),
      });
      const analyticsPercent = percent(analyticsAreaValue, openVoc);
      coverage.push({
        id: 'analytics-area',
        value: analyticsAreaValue,
        total: openVoc,
        percent: analyticsPercent,
        status: coverageStatus(analyticsPercent),
      });
      kpis.coverage_percent = vocTaskPercent;
    }

    // milestone-outcome has no MVP Milestone table or backing filter. Omit it.
    // high-followup has the same absence rule as the high-severity queue.
    if (highUnlinked !== undefined && openVoc !== undefined && totalHigh !== undefined) {
      const followed = totalHigh - highUnlinked;
      const highPercent = percent(followed, totalHigh);
      coverage.push({
        id: 'high-followup',
        value: followed,
        total: totalHigh,
        percent: highPercent,
        status: coverageStatus(highPercent),
      });
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
      const rowKpis: SystemKpis = {};
      const rowCoverage: SystemCoverage = {};
      const rowQueues: SystemQueues = {};

      if (includesManagedSystem(vocScope, systemId)) {
        const systemCounts = vocCountsBySystem.get(systemId) ?? emptyAggregatedVocCounts();
        rowKpis.open_voc = systemCounts.total;
        rowKpis.coverage_percent = percent(systemCounts.withTask, systemCounts.total);
        rowCoverage['voc-task'] = coverageCell(systemCounts.withTask, systemCounts.total);
        rowCoverage['analytics-area'] = coverageCell(
          systemCounts.withAnalyticsArea,
          systemCounts.total,
        );
        rowQueues['unassigned-voc'] = systemCounts.unassigned;
        rowQueues['high-severity-unlinked'] = systemCounts.highNoLink;
        rowCoverage['high-followup'] = coverageCell(
          systemCounts.highSeverity - systemCounts.highNoLink,
          systemCounts.highSeverity,
        );

        const areaCounts = vocCountsByArea.get(systemId);
        if (areaCounts !== undefined && areaCounts.size > 0) {
          row.analytics_areas = [...areaCounts].map(([areaId, area]) => ({
            analytics_area_id: areaId,
            coverage: {
              'voc-task': coverageCell(area.with_task, area.total),
              'high-followup': coverageCell(
                area.high_severity - area.high_no_link,
                area.high_severity,
              ),
            },
            action_queues: {
              'unassigned-voc': area.unassigned,
              'high-severity-unlinked': area.high_no_link,
            },
          }));
        }
      }

      if (includesManagedSystem(findingScope, systemId)) {
        const [active, noExecution, executed] = await Promise.all([
          repo.countActiveFindings(deps.db, actor.workspace_id, findingScope, systemId),
          repo.countActiveFindingsWithoutExecution(
            deps.db,
            actor.workspace_id,
            findingScope,
            systemId,
          ),
          repo.countActiveFindingsWithExecution(
            deps.db,
            actor.workspace_id,
            findingScope,
            systemId,
          ),
        ]);
        rowKpis.active_finding = active;
        rowCoverage['finding-execution'] = coverageCell(executed, active);
        rowQueues['actionable-finding-no-execution'] = noExecution;
      }

      if (includesManagedSystem(taskScope, systemId)) {
        const [tasksInFlight, unresolved, releasedUpdate] = await Promise.all([
          repo.countTasksInFlight(deps.db, actor.workspace_id, taskScope, systemId),
          repo.countReleasedTasksWithUnresolvedVoc(
            deps.db,
            actor.workspace_id,
            taskScope,
            systemId,
          ),
          repo.countReleasedTasksWithPublicUpdate(deps.db, actor.workspace_id, taskScope, systemId),
        ]);
        rowKpis.tasks_in_flight = tasksInFlight;
        rowCoverage['released-update'] = coverageCell(releasedUpdate.value, releasedUpdate.total);
        rowQueues['released-task-unresolved-voc'] = unresolved;
      }

      // ADR-0033 §C: an explicit survey.read deny dominates the admin bypass,
      // so the admin empty-queue exception must not emit a key for that system.
      const canSeeSurveyQueue =
        actor.role_level === 'admin'
          ? (await checkSurveyRead(deps.checkService, actor, systemId)).allow
          : includesManagedSystem(surveyScope, systemId);
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
      if (Object.keys(rowKpis).length > 0) row.kpis = rowKpis;
      byManagedSystem.push(row);
    }
    return { kpis, action_queues: queues, coverage, by_managed_system: byManagedSystem };
  }
  return { getSummary };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
