import type { DashboardSummary } from '@fops/shared';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { selectEligibleVocLinksForReleasedTask } from '../entity-links/repo.js';
import { actorFindingReadScope } from '../findings/authorization.js';
import type { CheckService } from '../permissions/check-service.js';
import { actorScopeForCapability, type Scope } from '../permissions/scope-service.js';
import type { RequestService } from '../permissions/request-service.js';
import type { CountVocsQuery } from '../voc/read-service.js';
import { actorSurveyReadScope } from '../surveys/authorization.js';
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

    const [findingScopeRaw, taskScopeRaw, surveyScopeRaw] = await Promise.all([
      actorFindingReadScope(deps.db, actor, { requireElevatedRole: true }),
      actorScopeForCapability(deps.db, actor, 'finding.manage'),
      actorSurveyReadScope(deps.db, deps.checkService, actor),
    ]);
    const findingScope = inRequestedScope(findingScopeRaw, selectedManagedSystemId);
    const taskScope = inRequestedScope(taskScopeRaw, selectedManagedSystemId);
    const surveyScope = inRequestedScope(surveyScopeRaw, selectedManagedSystemId);
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
      next_action: { label: 'Review VOCs', route: '/vocs?view=inbox&tab=unassigned', intent: 'triage' },
      secondary_action: { label: 'Bulk assign', route: '/vocs?view=inbox&tab=unassigned', intent: 'bulk_assign' } });
    if (highUnlinked !== undefined) queues.push({ id: 'high-severity-unlinked', severity: 'urgent', count: highUnlinked,
      next_action: { label: 'Review high severity VOCs', route: '/vocs?view=inbox&tab=high-no-link', intent: 'triage' }, secondary_action: null });

    if (findingScope !== undefined && (findingScope.kind === 'all' || findingScope.managedSystemIds.length > 0)) {
      const [active, noExecution] = await Promise.all([
        repo.countActiveFindings(deps.db, actor.workspace_id, findingScope, selectedManagedSystemId),
        repo.countActiveFindingsWithoutExecution(deps.db, actor.workspace_id, findingScope, selectedManagedSystemId),
      ]);
      kpis.active_finding = active;
      queues.push({ id: 'actionable-finding-no-execution', severity: 'warn', count: noExecution,
        next_action: { label: 'Review Findings', route: '/findings?status=active', intent: 'plan_execution' }, secondary_action: null });
      const executed = await repo.countActiveFindingsWithExecution(deps.db, actor.workspace_id, findingScope, selectedManagedSystemId);
      coverage.push({ id: 'finding-execution', value: executed, total: active, percent: percent(executed, active), status: coverageStatus(percent(executed, active)) });
    }

    if (taskScope !== undefined && (taskScope.kind === 'all' || taskScope.managedSystemIds.length > 0)) {
      kpis.tasks_in_flight = await repo.countTasksInFlight(deps.db, actor.workspace_id, taskScope, selectedManagedSystemId);
      const pendingTaskRequests = await repo.countPendingTaskRequests(deps.db, actor.workspace_id, taskScope, selectedManagedSystemId);
      kpis.pending_request = (kpis.pending_request ?? 0) + pendingTaskRequests;
      const released = await repo.releasedTaskIds(deps.db, actor.workspace_id, taskScope, selectedManagedSystemId);
      const unresolvedTasks = await Promise.all(released.map(async (taskId) => {
        const links = await selectEligibleVocLinksForReleasedTask(deps.db, { workspaceId: actor.workspace_id, taskId });
        const unresolved = await repo.unresolvedVocIds(deps.db, actor.workspace_id, links.map((link) => link.voc_id));
        return unresolved.size > 0;
      }));
      const unresolved = unresolvedTasks.filter(Boolean).length;
      queues.push({ id: 'released-task-unresolved-voc', severity: 'warn', count: unresolved,
        next_action: { label: 'Review released Tasks', route: '/tasks?status=released', intent: 'request_reporter_update' }, secondary_action: null });
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
        next_action: { label: 'Review outcome surveys', route: '/surveys?type=outcome', intent: 'create_followup' }, secondary_action: null });
    }

    const permissionRequests = await authorizationAbsent(() => deps.requestService.listAllActive(actor));
    if (permissionRequests !== undefined) {
      kpis.pending_request = (kpis.pending_request ?? 0) + permissionRequests.count;
      queues.push({ id: 'permission-requests-pending', severity: 'info', count: permissionRequests.count,
        next_action: { label: 'Open Requests', route: '/admin/permission-requests', intent: 'review_permissions' }, secondary_action: null });
    }

    if (openVoc !== undefined) {
      const vocScope = await actorScopeForCapability(deps.db, actor, 'voc.read');
      const selectedVocScope = inRequestedScope(vocScope, selectedManagedSystemId);
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
    return { kpis, action_queues: queues, coverage };
  }
  return { getSummary };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
