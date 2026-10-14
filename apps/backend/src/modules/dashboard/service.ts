import { createAreaReportReader } from './area-report.js';
import { recoveryHistoryWindowStart } from './history-window.js';
import { createHash } from 'node:crypto';
import { type SQL, sql } from 'drizzle-orm';
import { HttpError } from '../../lib/errors.js';
import { findingRecoveryProjection, findingRecoveryRepairScope } from '../findings/index.js';
import {
  countRecoveryPermissionRequests,
  permissionRecoveryProjection,
} from '../permissions/index.js';
import { surveyRecoveryProjection } from '../surveys/index.js';
import { taskRecoveryProjection } from '../tasks/index.js';
import {
  type VocGroupedCountReader,
  type VocGroupedCountRow,
  readTaskRecoveryVocs,
  vocRecoveryProjection,
  vocRecoveryRepairScope,
} from '../voc/index.js';

import {
  type CoverageMetricId,
  type CoverageThresholdPair,
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_HIGH_SEVERITY_UNLINKED_ROUTE,
  DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  DASHBOARD_PERMISSION_REQUESTS_ROUTE,
  DASHBOARD_RELEASED_TASKS_ROUTE,
  DASHBOARD_UNASSIGNED_VOC_ROUTE,
  type DashboardSummary,
  RECOVERY_CATEGORIES,
  type RecoveryCategory,
  type RecoveryItem,
  type RecoveryListQuery,
  recoveryDetailSchema,
  recoveryListSchema,
} from '@fops/shared';
import { z } from 'zod';

import type { Db } from '../../db/client.js';
import { actorFindingReadScope } from '../findings/authorization.js';
import { allManagedSystemIds } from '../managed-systems/read-projections.js';
import type { CheckService } from '../permissions/check-service.js';
import { isAuthorizationAbsence } from '../permissions/read-utility.js';
import type { RequestService } from '../permissions/request-service.js';
import { type Scope, actorScopeForCapability } from '../permissions/scope-service.js';
import {
  actorSurveyReadScope,
  actorSurveyRecoveryScope,
  checkSurveyRead,
} from '../surveys/authorization.js';
import { getResolvedWorkspaceSettings } from '../workspace-settings/index.js';
import * as repo from './repo.js';
import { recoveryIdentity as identity, decodeRecoveryIdentity as decodeIdentity } from './identity.js';
import { lockRecoveryIdentity } from './recorder.js';
import { recoveryHistorySchema, type RecoveryHistoryQuery, type RecoveryPresentationPatch } from '@fops/shared';

export interface DashboardActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

const ownerRecoveryReaders = {
  vocRecoveryProjection,
  vocRecoveryRepairScope,
  findingRecoveryProjection,
  findingRecoveryRepairScope,
  taskRecoveryProjection,
  permissionRecoveryProjection,
  surveyRecoveryProjection,
  readTaskRecoveryVocs,
};
export type DashboardRecoveryReaders = typeof ownerRecoveryReaders;

type DashboardDeps = {
  recoveryClock?: () => Date;
  db: Db;
  recoveryReaders?: DashboardRecoveryReaders;
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

function coverageStatus(
  value: number,
  total: number,
  band: CoverageThresholdPair,
): 'good' | 'warn' | 'bad' | 'no_data' {
  if (total === 0) return 'no_data';
  return value >= band.good_min_percent ? 'good' : value >= band.warn_min_percent ? 'warn' : 'bad';
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

function coverageCell(value: number, total: number, band: CoverageThresholdPair) {
  const coveragePercent = percent(value, total);
  return {
    value,
    total,
    percent: coveragePercent,
    status: coverageStatus(coveragePercent, total, band),
  };
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
    const { coverage_thresholds: bands } = await getResolvedWorkspaceSettings(
      deps.db,
      actor.workspace_id,
    );
    const cell = (id: CoverageMetricId, value: number, total: number) =>
      coverageCell(value, total, bands[id]);
    // `all` is the public selector for no backing filter; repositories receive
    // undefined so they apply the actor's resolved scope rather than cast it as a UUID.
    const selectedManagedSystemId = managedSystemId === 'all' ? undefined : managedSystemId;
    const [findingScopeRaw, taskScopeRaw, surveyReadScopeRaw, vocScopeRaw] = await Promise.all([
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
        ...(selectedManagedSystemId !== undefined
          ? { managedSystemId: selectedManagedSystemId }
          : {}),
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
    const surveyScopeRaw = actor.role_level === 'admin'
      ? await actorSurveyRecoveryScope(deps.db, deps.checkService, actor) : surveyReadScopeRaw;
    const surveyScope = inRequestedScope(surveyScopeRaw, selectedManagedSystemId);
    const vocScope = inRequestedScope(vocScopeRaw, selectedManagedSystemId);
    const surveyScopeForDashboard = surveyScope;
    const canSeeSurveyQueue = surveyScope !== undefined &&
      (surveyScope.kind === 'all' || surveyScope.managedSystemIds.length > 0);
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
        status: coverageStatus(percent(executed, active), active, bands['finding-execution']),
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
        status: coverageStatus(
          releasedUpdatePercent,
          releasedUpdate.total,
          bands['released-update'],
        ),
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
      countRecoveryPermissionRequests(deps.db, deps.checkService, actor),
    );
    if (permissionRequests !== undefined) {
      kpis.pending_request = (kpis.pending_request ?? 0) + permissionRequests;
      queues.push({
        id: 'permission-requests-pending',
        severity: 'info',
        count: permissionRequests,
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
      const analyticsAreaValue = sumGroupedVocCounts((row) =>
        row.analytics_area_id !== null ? row.total : 0,
      )!;
      const vocTaskPercent = percent(vocTaskValue, openVoc);
      coverage.push({
        id: 'voc-task',
        value: vocTaskValue,
        total: openVoc,
        percent: vocTaskPercent,
        status: coverageStatus(vocTaskPercent, openVoc, bands['voc-task']),
      });
      const analyticsPercent = percent(analyticsAreaValue, openVoc);
      coverage.push({
        id: 'analytics-area',
        value: analyticsAreaValue,
        total: openVoc,
        percent: analyticsPercent,
        status: coverageStatus(analyticsPercent, openVoc, bands['analytics-area']),
      });
      kpis.coverage_percent = vocTaskPercent;
    }

    // milestone-outcome is a reserved coverage id that is never emitted: no
    // Milestone-outcome coverage definition exists yet. Omit it.
    // high-followup has the same absence rule as the high-severity queue.
    if (highUnlinked !== undefined && openVoc !== undefined && totalHigh !== undefined) {
      const followed = totalHigh - highUnlinked;
      const highPercent = percent(followed, totalHigh);
      coverage.push({
        id: 'high-followup',
        value: followed,
        total: totalHigh,
        percent: highPercent,
        status: coverageStatus(highPercent, totalHigh, bands['high-followup']),
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
        rowCoverage['voc-task'] = cell('voc-task', systemCounts.withTask, systemCounts.total);
        rowCoverage['analytics-area'] = cell(
          'analytics-area',
          systemCounts.withAnalyticsArea,
          systemCounts.total,
        );
        rowQueues['unassigned-voc'] = systemCounts.unassigned;
        rowQueues['high-severity-unlinked'] = systemCounts.highNoLink;
        rowCoverage['high-followup'] = cell(
          'high-followup',
          systemCounts.highSeverity - systemCounts.highNoLink,
          systemCounts.highSeverity,
        );

        const areaCounts = vocCountsByArea.get(systemId);
        if (areaCounts !== undefined && areaCounts.size > 0) {
          row.analytics_areas = [...areaCounts].map(([areaId, area]) => ({
            analytics_area_id: areaId,
            coverage: {
              'voc-task': cell('voc-task', area.with_task, area.total),
              'high-followup': cell(
                'high-followup',
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
        rowCoverage['finding-execution'] = cell('finding-execution', executed, active);
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
        rowCoverage['released-update'] = cell(
          'released-update',
          releasedUpdate.value,
          releasedUpdate.total,
        );
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
    return {
      computed_at: new Date().toISOString(),
      kpis,
      action_queues: queues,
      coverage,
      by_managed_system: byManagedSystem,
    };
  }
  const recovery = createRecoveryReader(deps);
  return { getAreaReport: createAreaReportReader(deps), getSummary, listRecoveryItems: recovery.list, getRecoveryItem: recovery.detail, patchRecoveryPresentation: recovery.patchPresentation, getRecoveryHistory: recovery.history };
}

export type DashboardService = ReturnType<typeof createDashboardService>;

const metadata = {
  'unassigned-voc': {
    priority: 10,
    severity: 'urgent',
    type: 'voc',
    reason: 'VOC 담당자가 지정되지 않았습니다.',
  },
  'high-severity-unlinked': {
    priority: 10,
    severity: 'urgent',
    type: 'voc',
    reason: '심각도가 높은 VOC에 후속 작업이 연결되지 않았습니다.',
  },
  'actionable-finding-no-execution': {
    priority: 20,
    severity: 'warn',
    type: 'finding',
    reason: 'Active Finding에 실행 작업이 연결되지 않았습니다.',
  },
  'released-task-unresolved-voc': {
    priority: 20,
    severity: 'warn',
    type: 'task',
    reason: 'Released Task에 아직 해결되지 않은 VOC가 연결되어 있습니다.',
  },
  'bad-outcome-no-followup': {
    priority: 10,
    severity: 'urgent',
    type: 'survey',
    reason: 'Outcome Survey에 후속 판단이 필요합니다.',
  },
  'permission-requests-pending': {
    priority: 30,
    severity: 'info',
    type: 'permission_request',
    reason: 'Permission Request 검토가 필요합니다.',
  },
} as const;
const notFound = () => new HttpError('not_found.record', 'recovery item not found');

const cursorSchema = z
  .object({
    v: z.literal(1),
    bind: z.string(),
    priority: z.number().int(),
    category: z.enum(RECOVERY_CATEGORIES),
    sourceId: z.string().uuid(),
  })
  .strict();
type Cursor = z.infer<typeof cursorSchema>;
function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
function decodeCursor(raw: string, bind: string): Cursor {
  const invalid = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw invalid();
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (
      encodeCursor(cursor) !== raw ||
      cursor.bind !== bind ||
      cursor.priority !== metadata[cursor.category].priority
    )
      throw invalid();
    return cursor;
  } catch {
    throw invalid();
  }
}
function selectScope(scope: Scope, selected?: string): Scope {
  if (!selected || selected === 'all') return scope;
  return {
    kind: 'scoped',
    managedSystemIds:
      scope.kind === 'all' || scope.managedSystemIds.includes(selected) ? [selected] : [],
  };
}
function normalizedScope(scope: Scope) {
  return scope.kind === 'all' ? 'all' : [...scope.managedSystemIds].sort();
}
type SourceRow = {
  category: RecoveryCategory;
  priority: number;
  source_id: string;
  system_id: string | null;
  display_id: string | null;
  title: string | null;
  active: boolean;
  withdrawn: boolean;
  actor_id: string | null;
  team_id: string | null;
  repair_id: string | null;
  repair_system_id: string | null;
  occurrence?: number | null;
  presentation_state?: 'visible' | 'snoozed' | 'muted';
  snoozed_until?: string | null;
  resolution?: RecoveryItem['resolution'];
};
function route(
  type: NonNullable<RecoveryItem['source']>['type'],
  id: string,
  triageSystem?: string | null,
): string {
  if (type === 'permission_request') return `/admin/permissions/requests?selected=${id}`;
  if (type === 'survey') return `/surveys/${id}/follow-up`;
  if (type === 'voc')
    return `/vocs?selected=${id}${triageSystem ? `&view=triage&managedSystem=${triageSystem}` : ''}`;
  if (type === 'task') return `/tasks?param=${id}`;
  return `/findings?selected=${id}`;
}
function hint(keys: string[], adminQueue = false): RecoveryItem['responsible_actor_hint'] {
  if (adminQueue) return { kind: 'admin_queue', label: 'Admin 검토 대기열' };
  const owners = [...new Set(keys)];
  if (owners.length > 1) return { kind: 'multiple', label: '여러 담당자' };
  const owner = owners[0];
  if (!owner) return { kind: 'unassigned', label: '미지정' };
  return owner.startsWith('a:')
    ? { kind: 'actor', label: '담당 Actor', actor_id: owner.slice(2) }
    : { kind: 'team', label: '담당 팀', team_id: owner.slice(2) };
}
function ownerKeys(row: { actor_id: string | null; team_id: string | null }) {
  return row.actor_id ? [`a:${row.actor_id}`] : row.team_id ? [`t:${row.team_id}`] : [];
}

function createRecoveryReader(deps: {
  recoveryClock?: () => Date;
  db: Db;
  checkService: CheckService;
  recoveryReaders?: DashboardRecoveryReaders;
}) {
  const readers = deps.recoveryReaders ?? ownerRecoveryReaders;
  async function projections(
    actor: DashboardActor,
    query: Pick<RecoveryListQuery, 'category' | 'managed_system_id'>,
    sourceId?: string,
    db = deps.db,
    includeInactive = false,
  ) {
    const check: CheckService = db === deps.db ? deps.checkService : {
      capabilityScope: (actor, capability, subject, options) => deps.checkService.capabilityScope(actor, capability, subject, { ...options, tx: db }),
      checkCapability: (actor, capability, subject, options) => deps.checkService.checkCapability(actor, capability, subject, { ...options, tx: db }),
    };
    const [vocRaw, findingRaw, taskRaw, surveyRaw, vocRepair, findingRepair] = await Promise.all([
      actorScopeForCapability(db, actor, 'voc.read'),
      actorFindingReadScope(db, actor, { requireElevatedRole: true }),
      actorScopeForCapability(db, actor, 'finding.manage'),
      actorSurveyRecoveryScope(db, check, actor),
      readers.vocRecoveryRepairScope(db, check, actor),
      readers.findingRecoveryRepairScope(db, check, actor),
    ]);
    const scopes = [vocRaw, findingRaw, taskRaw, surveyRaw].map((scope) =>
      selectScope(scope, query.managed_system_id),
    );
    const [vocScope, findingScope, taskScope, surveyScope] = scopes as [Scope, Scope, Scope, Scope];
    const categories = query.category ? [query.category] : [...RECOVERY_CATEGORIES];
    let surveyRepairSystems: string[] = [];
    let permissionAllowed = false;
    const sources = await Promise.all(
      categories.map(async (category) => {
        let projection: SQL;
        if (category === 'unassigned-voc' || category === 'high-severity-unlinked') {
          projection = readers.vocRecoveryProjection(
            actor.workspace_id,
            vocScope,
            category,
            vocRepair,
            sourceId,
          );
        } else if (category === 'actionable-finding-no-execution') {
          projection = readers.findingRecoveryProjection(
            actor.workspace_id,
            findingScope,
            findingRepair,
            sourceId,
          );
        } else if (category === 'released-task-unresolved-voc') {
          projection = readers.taskRecoveryProjection({
            workspaceId: actor.workspace_id,
            scope: taskScope,
            vocReadScope: vocRaw,
            vocRepairScope: vocRepair,
            actorId: actor.actor_id,
            roleLevel: actor.role_level,
            ...(sourceId ? { sourceId } : {}),
          });
        } else if (category === 'bad-outcome-no-followup') {
          const survey = await readers.surveyRecoveryProjection(
            db,
            check,
            actor,
            surveyScope,
            sourceId,
            includeInactive,
          );
          projection = survey.query;
          surveyRepairSystems = survey.repairSystems;
        } else {
          const permission = await readers.permissionRecoveryProjection(
            check,
            actor,
            sourceId,
          );
          projection = permission.query;
          permissionAllowed = permission.allowed;
        }
        return sql`SELECT ${category}::text AS category, ${metadata[category].priority}::int AS priority, source.* FROM (${projection}) source`;
      }),
    );
    return {
      query: sql.join(sources, sql` UNION ALL `),
      vocScope: vocRaw,
      binding: {
        permissionAllowed,
        surveyRepairSystems: [...surveyRepairSystems].sort(),
        scopes: scopes.map(normalizedScope),
        vocRepair: normalizedScope(vocRepair),
        findingRepair: normalizedScope(findingRepair),
      },
    };
  }
  async function hydrate(
    actor: DashboardActor,
    rows: SourceRow[],
    vocScope: Scope,
  ): Promise<RecoveryItem[]> {
    const affected = await readers.readTaskRecoveryVocs(deps.db, {
      workspaceId: actor.workspace_id,
      actorId: actor.actor_id,
      readScope: vocScope,
      taskIds: rows
        .filter((row) => row.category === 'released-task-unresolved-voc' && row.title !== null)
        .map((row) => row.source_id),
    });
    return rows.map((row) => {
      const meta = metadata[row.category];
      const vocs = affected.filter((voc) => voc.task_id === row.source_id);
      const keys = [...ownerKeys(row), ...vocs.flatMap((voc) => voc.owner_keys)];
      const source =
        row.title === null
          ? null
          : {
              type: meta.type,
              id: row.source_id,
              display_id: row.display_id,
              title: row.title,
              route: route(meta.type, row.source_id),
            };
      const next_actions: RecoveryItem['next_actions'] = [];
      if (row.active && !row.withdrawn && row.repair_id) {
        const type = meta.type === 'task' ? 'voc' : meta.type;
        const id = row.repair_id;
        const action =
          type === 'voc'
            ? meta.type === 'task'
              ? 'write_public_update'
              : 'triage'
            : type === 'finding'
              ? 'plan_execution'
              : type === 'survey'
                ? 'create_finding'
                : 'review_permission';
        next_actions.push({
          id: action,
          label:
            action === 'triage'
              ? 'VOC 검토'
              : action === 'write_public_update'
                ? 'VOC 공개 업데이트'
                : action === 'plan_execution'
                  ? 'Task Request 생성'
                  : action === 'create_finding'
                    ? '후속 판단'
                    : 'Permission Request 반려',
          availability: 'available',
          blocked_reason: null,
          requestable_permission: null,
          target: {
            source_type: type,
            source_id: id,
            route: route(type, id, action === 'triage' ? row.repair_system_id : undefined),
            endpoint:
              action === 'triage'
                ? `/vocs/${id}`
                : action === 'write_public_update'
                  ? `/vocs/${id}/public-updates`
                  : action === 'plan_execution'
                    ? `/findings/${id}/request-task`
                    : action === 'review_permission'
                      ? `/permissions/requests/${id}/reject`
                      : null,
            method: action === 'triage' ? 'PATCH' : action === 'create_finding' ? null : 'POST',
            intent: action,
          },
          confirmation: {
            required: action === 'write_public_update' || action === 'review_permission',
            title:
              action === 'write_public_update'
                ? 'VOC 공개 업데이트 전송'
                : action === 'review_permission'
                  ? 'Permission Request 반려'
                  : '후속 작업 검토',
            body:
              action === 'write_public_update'
                ? '보고자에게 공개할 내용을 확인해 주세요.'
                : action === 'review_permission'
                  ? '반려 사유를 입력해 주세요.'
                  : '연결된 화면에서 필요한 내용을 입력해 주세요.',
            risk_level:
              action === 'write_public_update' || action === 'review_permission' ? 'medium' : 'low',
            reason_required: action === 'review_permission',
            audit_event_intent:
              action === 'write_public_update'
                ? 'public_update_created'
                : action === 'review_permission'
                  ? 'permission_rejected'
                  : action === 'plan_execution'
                    ? 'task_request_created_from_finding'
                    : action === 'create_finding'
                      ? 'finding_created_from_survey_response'
                      : null,
          },
        });
      }
      return {
        recovery_item_id: identity(row.category, row.source_id),
        category: row.category,
        occurrence: row.occurrence ?? null,
        presentation: { state: row.presentation_state ?? 'visible', snoozed_until: row.snoozed_until ?? null },
        resolution: row.resolution ?? null,
        state: row.withdrawn ? 'withdrawn' : row.active ? 'active' : 'resolved',
        reason_code: row.category,
        reason: meta.reason,
        priority: meta.priority,
        severity: meta.severity,
        managed_system_id: row.system_id,
        source,
        affected: vocs.map((voc) => ({
          type: 'voc' as const,
          id: voc.id,
          display_id: voc.display_id,
          title: voc.title,
          route: route('voc', voc.id),
        })),
        next_actions,
        responsible_actor_hint: hint(keys, meta.type === 'permission_request'),
      };
    });
  }
  async function list(actor: DashboardActor, query: RecoveryListQuery) {
    const projection = await projections(actor, query);
    const bind = createHash('sha256')
      .update(
        JSON.stringify({
          workspace: actor.workspace_id,
          actor: actor.actor_id,
          role: actor.role_level,
          category: query.category ?? null,
          selected: query.managed_system_id === 'all' ? null : (query.managed_system_id ?? null),
          view: query.view,
          presentation: query.presentation,
          ...projection.binding,
        }),
      )
      .digest('hex');
    const cursor = query.cursor ? decodeCursor(query.cursor, bind) : null;
    const after = cursor
      ? sql`(priority, category, source_id) > (${cursor.priority}::int, ${cursor.category}::text, ${cursor.sourceId}::uuid)`
      : sql`true`;
    const result = await deps.db.execute<{ total: number; visible_total: number; hidden_total: number; items: SourceRow[] }>(sql`
      WITH sources AS (${projection.query}), matched AS MATERIALIZED (
        SELECT source.*, CASE WHEN i.state='active' THEN i.occurrence END AS occurrence, ${presentationColumns()} FROM sources source
        LEFT JOIN dashboard.recovery_identities i ON i.workspace_id=${actor.workspace_id}::uuid
          AND i.category=source.category AND i.source_id=source.source_id
        LEFT JOIN dashboard.recovery_presentations p ON p.workspace_id=i.workspace_id
          AND p.recovery_item_id=i.recovery_item_id AND p.occurrence=i.occurrence AND i.state='active' AND p.actor_id=${actor.actor_id}::uuid
        WHERE active AND NOT withdrawn
          AND ${query.view === 'actionable' ? sql`repair_id IS NOT NULL` : sql`true`}
      ), selected AS MATERIALIZED (SELECT * FROM matched WHERE
          ${query.presentation === 'hidden' ? sql`presentation_state <> 'visible'` : sql`presentation_state = 'visible'`}),
        page AS (SELECT * FROM selected WHERE ${after} ORDER BY priority, category, source_id LIMIT ${query.limit + 1})
      SELECT (SELECT count(*)::int FROM selected) AS total,
        (SELECT count(*)::int FROM matched WHERE presentation_state='visible') AS visible_total,
        (SELECT count(*)::int FROM matched WHERE presentation_state<>'visible') AS hidden_total,
        COALESCE((SELECT jsonb_agg(page ORDER BY priority, category, source_id) FROM page), '[]'::jsonb) AS items`);
    const data = result.rows[0];
    const rows = (data?.items ?? []).slice(0, query.limit);
    const hasMore = (data?.items.length ?? 0) > query.limit;
    const last = rows.at(-1);
    return recoveryListSchema.parse({
      computed_at: new Date().toISOString(),
      items: await hydrate(actor, rows, projection.vocScope),
      total: Number(data?.total ?? 0),
      visible_total: Number(data?.visible_total ?? 0),
      hidden_total: Number(data?.hidden_total ?? 0),
      page: {
        has_more: hasMore,
        ...(hasMore && last
          ? {
              cursor: encodeCursor({
                v: 1,
                bind,
                priority: last.priority,
                category: last.category,
                sourceId: last.source_id,
              }),
            }
          : {}),
      },
    });
  }
  async function detail(actor: DashboardActor, token: string) {
    const { category, sourceId } = decodeIdentity(token);
    const projection = await projections(actor, { category }, sourceId);
    const result = await deps.db.execute<SourceRow>(
      sql`SELECT * FROM (${projection.query}) source WHERE source_id = ${sourceId}::uuid LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row || row.title === null) throw notFound();
    const enriched = await enrich(actor, row);
    const item = (await hydrate(actor, [enriched], projection.vocScope))[0];
    if (!item) throw notFound();
    return recoveryDetailSchema.parse({ ...item, computed_at: new Date().toISOString() });
  }
  function presentationColumns() {
    return sql`CASE WHEN p.state='muted' THEN 'muted'
          WHEN p.state='snoozed' AND p.snoozed_until > now() THEN 'snoozed' ELSE 'visible' END AS presentation_state,
          CASE WHEN p.state='snoozed' AND p.snoozed_until > now() THEN to_char(p.snoozed_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS snoozed_until`;
  }
  async function enrich(actor: DashboardActor, row: SourceRow, db = deps.db): Promise<SourceRow> {
    const token = identity(row.category, row.source_id);
    const stored = (
      await db.execute<
        Pick<SourceRow, 'occurrence' | 'presentation_state' | 'snoozed_until' | 'resolution'> & {
          state: string;
        }
      >(sql`
          SELECT i.occurrence, i.state, ${presentationColumns()},
            CASE WHEN h.id IS NOT NULL THEN jsonb_build_object('resolved_at',
              to_char(h.resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'outcome',h.outcome,'evidence',h.evidence,'action',h.action) END AS resolution
          FROM dashboard.recovery_identities i
          LEFT JOIN dashboard.recovery_presentations p ON p.workspace_id=i.workspace_id AND p.recovery_item_id=i.recovery_item_id
            AND p.occurrence=i.occurrence AND p.actor_id=${actor.actor_id}::uuid
          LEFT JOIN dashboard.recovery_history h ON h.workspace_id=i.workspace_id AND h.recovery_item_id=i.recovery_item_id
            AND h.occurrence=i.occurrence
          WHERE i.workspace_id=${actor.workspace_id}::uuid AND i.recovery_item_id=${token}`)
    ).rows[0];
    const current = row.withdrawn ? 'withdrawn' : row.active ? 'active' : 'resolved';
    return {
      ...row,
      ...stored,
      ...(stored && (stored as { state?: string }).state !== current
        ? {
            occurrence: null,
            presentation_state: 'visible' as const,
            snoozed_until: null,
            resolution: null,
          }
        : {}),
    };
  }
  async function patchPresentation(
    actor: DashboardActor,
    token: string,
    input: RecoveryPresentationPatch,
  ) {
    const { category, sourceId } = decodeIdentity(token);
    await deps.db.transaction(async (tx) => {
      await lockRecoveryIdentity(tx, actor.workspace_id, token);
      const projection = await projections(actor, { category }, sourceId, tx);
      const row = (
        await tx.execute<SourceRow>(sql`SELECT * FROM (${projection.query}) source
          WHERE source_id=${sourceId}::uuid LIMIT 1`)
      ).rows[0];
      if (!row || row.title === null) throw notFound();
      if (input.action !== 'restore' && (!row.active || row.withdrawn))
        throw new HttpError('conflict.stale_write', 'recovery item is no longer active', {
          failure_code: 'recovery_item_resolved',
        });
      if (input.action !== 'restore')
        await tx.execute(sql`INSERT INTO dashboard.recovery_identities
          (workspace_id,recovery_item_id,category,source_id,managed_system_id,occurrence,state)
          VALUES (${actor.workspace_id}::uuid,${token},${category},${sourceId}::uuid,${row.system_id}::uuid,1,'active')
          ON CONFLICT (workspace_id,recovery_item_id) DO NOTHING`);
      const stored = (
        await tx.execute<{ occurrence: number; state: string }>(sql`SELECT occurrence,state
          FROM dashboard.recovery_identities WHERE workspace_id=${actor.workspace_id}::uuid AND recovery_item_id=${token} FOR UPDATE`)
      ).rows[0];
      if (!stored) return; // Absent-row restore is an authorized no-op.
      if (input.action !== 'restore' && stored.state !== 'active') {
        await tx.execute(sql`UPDATE dashboard.recovery_identities SET state='active',occurrence=occurrence+1,observed_at=clock_timestamp()
            WHERE workspace_id=${actor.workspace_id}::uuid AND recovery_item_id=${token}`);
        stored.occurrence++;
      }
      const state =
        input.action === 'mute' ? 'muted' : input.action === 'snooze' ? 'snoozed' : 'visible';
      const until =
        input.action === 'snooze'
          ? sql`now() + ${input.days}::int * interval '1 day'`
          : sql`NULL::timestamptz`;
      await tx.execute(sql`INSERT INTO dashboard.recovery_presentations
          (workspace_id,recovery_item_id,actor_id,occurrence,state,snoozed_until)
          VALUES (${actor.workspace_id}::uuid,${token},${actor.actor_id}::uuid,${stored.occurrence},${state},${until})
          ON CONFLICT (workspace_id,recovery_item_id,actor_id,occurrence)
          DO UPDATE SET state=EXCLUDED.state,snoozed_until=EXCLUDED.snoozed_until`);
    });
    return detail(actor, token);
  }
  async function history(actor: DashboardActor, query: RecoveryHistoryQuery) {
    const projection = await projections(actor, query, undefined, deps.db, true);
    const bind = createHash('sha256')
      .update(
        JSON.stringify({
          actor,
          category: query.category,
          selected: query.managed_system_id,
          history: true,
          ...projection.binding,
        }),
      )
      .digest('hex');
    const invalid = () =>
      new HttpError('validation.failed', 'invalid cursor', {
        fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
      });
    const schema = z
      .object({ bind: z.string(), at: z.string().datetime(), id: z.string().uuid() })
      .strict();
    let cursor: z.infer<typeof schema> | undefined;
    if (query.cursor) {
      try {
        cursor = schema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
        if (
          cursor.bind !== bind ||
          Buffer.from(JSON.stringify(cursor)).toString('base64url') !== query.cursor
        )
          throw invalid();
      } catch {
        throw invalid();
      }
    }
    const cutoff = sql`${recoveryHistoryWindowStart(deps.recoveryClock?.() ?? new Date()).toISOString()}::timestamptz`;
    const data = (
      await deps.db.execute<{
        total: number;
        window_start: string;
        items: Array<
          SourceRow & {
            id: string;
            history_occurrence: number;
            history_resolution: NonNullable<RecoveryItem['resolution']>;
          }
        >;
      }>(sql`WITH sources AS (${projection.query}), matched AS MATERIALIZED (
        SELECT source.*, i.occurrence, ${presentationColumns()}, h.id, h.occurrence AS history_occurrence,
          jsonb_build_object('resolved_at',to_char(h.resolved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'outcome',h.outcome,'evidence',h.evidence,'action',h.action) AS history_resolution,h.resolved_at
        FROM dashboard.recovery_history h JOIN dashboard.recovery_identities i
          ON i.workspace_id=h.workspace_id AND i.recovery_item_id=h.recovery_item_id
        JOIN sources source ON source.category=i.category AND source.source_id=i.source_id
        LEFT JOIN dashboard.recovery_presentations p ON p.workspace_id=i.workspace_id AND p.recovery_item_id=i.recovery_item_id
          AND p.occurrence=i.occurrence AND i.state='active' AND p.actor_id=${actor.actor_id}::uuid
        WHERE h.workspace_id=${actor.workspace_id}::uuid AND h.resolved_at >= ${cutoff} AND source.title IS NOT NULL
      ), page AS (SELECT * FROM matched WHERE ${cursor ? sql`(resolved_at,id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql`true`}
        ORDER BY resolved_at DESC,id DESC LIMIT ${query.limit + 1})
        SELECT (SELECT count(*)::int FROM matched) AS total,
          to_char(${cutoff} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS window_start,
          COALESCE((SELECT jsonb_agg(page ORDER BY resolved_at DESC,id DESC) FROM page),'[]'::jsonb) AS items`)
    ).rows[0];
    const rows = (data?.items ?? []).slice(0, query.limit);
    const hydrated = await hydrate(actor, rows, projection.vocScope);
    const last = rows.at(-1);
    const more = (data?.items.length ?? 0) > query.limit;
    return recoveryHistorySchema.parse({
      computed_at: new Date().toISOString(),
      window_start: data?.window_start,
      total: Number(data?.total ?? 0),
      items: rows.map((row, index) => ({
        id: row.id,
        item: hydrated[index],
        occurrence: row.history_occurrence,
        resolution: row.history_resolution,
      })),
      page: {
        has_more: more,
        ...(more && last
          ? {
              cursor: Buffer.from(
                JSON.stringify({ bind, at: last.history_resolution.resolved_at, id: last.id }),
              ).toString('base64url'),
            }
          : {}),
      },
    });
  }
  return { list, detail, patchPresentation, history };
}
