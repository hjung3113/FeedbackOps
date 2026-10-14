import { createHash } from 'node:crypto';
import {
  type AreaReportMetric,
  type DashboardAreaReport,
  type DashboardAreaReportQuery,
  areaReportLink,
  dashboardAreaReportSchema,
} from '@fops/shared';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { readAnalyticsAreaMetadata } from '../analytics-areas/index.js';
import { hasElevatedFindingRole } from '../findings/authorization.js';
import { actorFindingListScope, countGroupedFindingsForReport } from '../findings/index.js';
import { readManagedSystemMetadata } from '../managed-systems/index.js';
import { type CheckService, memoizeCapabilityChecks } from '../permissions/check-service.js';
import { isAuthorizationAbsence } from '../permissions/read-utility.js';
import { type Scope, actorScopeForCapability } from '../permissions/scope-service.js';
import { actorSurveyReadScope, checkSurveyRead } from '../surveys/authorization.js';
import { countGroupedSurveysForReport } from '../surveys/index.js';
import { actorTaskListScope, countGroupedTasksForReport } from '../tasks/index.js';
import type { VocGroupedCountReader } from '../voc/index.js';
import type { DashboardActor } from './service.js';

const domains = ['voc', 'finding', 'task', 'survey'] as const;
type Domain = (typeof domains)[number];
type Group = { managed_system_id: string; analytics_area_id: string | null; total: number };
const key = (row: Pick<Group, 'managed_system_id' | 'analytics_area_id'>) =>
  `${row.managed_system_id}/${row.analytics_area_id ?? '~'}`;
const includes = (scope: Scope, id: string) =>
  scope.kind === 'all' || scope.managedSystemIds.includes(id);
const normalize = (scope: Scope) =>
  scope.kind === 'all' ? 'all' : [...scope.managedSystemIds].sort();
const cursorSchema = z
  .object({
    v: z.literal(1),
    bind: z.string(),
    system: z.string().uuid(),
    area: z.string().uuid().nullable(),
  })
  .strict();
const invalidCursor = () =>
  new HttpError('validation.failed', 'invalid cursor', {
    fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
  });

export function createAreaReportReader(deps: {
  db: Db;
  checkService: CheckService;
  vocReadService: VocGroupedCountReader;
}) {
  return async (
    actor: DashboardActor,
    query: DashboardAreaReportQuery,
  ): Promise<DashboardAreaReport> => {
    // Keep this before scopes, metadata or any report data read.
    if (!hasElevatedFindingRole(actor))
      throw new HttpError('permission.denied', 'elevated role required');
    const check = memoizeCapabilityChecks(deps.checkService);
    const managedSystemId =
      query.managed_system_id === 'all' ? undefined : query.managed_system_id?.toLowerCase();
    const analyticsAreaId =
      query.analytics_area_id === 'unset' ? 'unset' : query.analytics_area_id?.toLowerCase();
    const [vocScope, findingScope, taskScope, surveyScope] = await Promise.all([
      actorScopeForCapability(deps.db, actor, 'voc.read'),
      actorFindingListScope(deps.db, check, actor, managedSystemId),
      actorTaskListScope(deps.db, check, actor, managedSystemId),
      actorSurveyReadScope(deps.db, check, actor),
    ]);
    const args = { actor, ...(managedSystemId === undefined ? {} : { managedSystemId }) };
    const [vocs, findings, tasks, surveys] = await Promise.all([
      deps.vocReadService.countGroupedVocs({ ...args, readScope: vocScope }).catch((error) => {
        if (isAuthorizationAbsence(error)) return [];
        throw error;
      }),
      countGroupedFindingsForReport(deps.db, { ...args, readScope: findingScope }),
      countGroupedTasksForReport(deps.db, { ...args, readScope: taskScope }),
      countGroupedSurveysForReport(deps.db, { ...args, readScope: surveyScope }),
    ]);
    const groups = { voc: vocs, finding: findings, task: tasks.rows, survey: surveys };
    const union = new Map<string, Group>();
    for (const rows of Object.values(groups)) for (const row of rows) union.set(key(row), row);
    const systems = [...new Set([...union.values()].map((row) => row.managed_system_id))].sort();
    // Availability is a point decision for every union system, never evidence of source rows.
    // The list scope functions use the same decisions and the same request-local memo.
    const [availableFindings, availableTasks, surveyDecisions] = await Promise.all([
      actorFindingListScope(deps.db, check, actor, managedSystemId, systems),
      actorTaskListScope(deps.db, check, actor, managedSystemId, systems),
      Promise.all(systems.map((id) => checkSurveyRead(check, actor, id))),
    ]);
    const available: Record<Domain, Scope> = {
      voc: vocScope,
      finding: availableFindings,
      task: availableTasks,
      survey: {
        kind: 'scoped',
        managedSystemIds: systems.filter((_, i) => surveyDecisions[i]?.allow),
      },
    };
    const bind = createHash('sha256')
      .update(
        JSON.stringify({
          workspace: actor.workspace_id,
          actor: actor.actor_id,
          role: actor.role_level,
          system: managedSystemId ?? 'all',
          area: analyticsAreaId ?? 'all',
          scopes: [
            vocScope,
            findingScope,
            taskScope,
            surveyScope,
            ...domains.map((domain) => available[domain]),
          ].map(normalize),
        }),
      )
      .digest('hex');
    let after: string | undefined;
    if (query.cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw invalidCursor();
        const decoded = cursorSchema.parse(
          JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
        );
        if (
          decoded.bind !== bind ||
          Buffer.from(JSON.stringify(decoded)).toString('base64url') !== query.cursor
        )
          throw invalidCursor();
        after = key({ managed_system_id: decoded.system, analytics_area_id: decoded.area });
      } catch {
        throw invalidCursor();
      }
    }
    const contexts = systems.map((managed_system_id) => {
      const context: DashboardAreaReport['classification_context'][number] = { managed_system_id };
      for (const domain of domains) {
        if (!includes(available[domain], managed_system_id)) continue;
        const rows: Group[] = groups[domain];
        const inSystem = rows.filter((row) => row.managed_system_id === managed_system_id);
        context[domain] = {
          classified: inSystem.reduce(
            (sum, row) => sum + (row.analytics_area_id === null ? 0 : row.total),
            0,
          ),
          total: inSystem.reduce((sum, row) => sum + row.total, 0),
        };
      }
      return context;
    });
    // Metadata IDs come exclusively from authorized grouped reads, before paging/filtering.
    const [systemMetadata, areaMetadata] = await Promise.all([
      readManagedSystemMetadata(deps.db, actor.workspace_id, systems),
      readAnalyticsAreaMetadata(deps.db, actor.workspace_id, [
        ...new Set(
          [...union.values()].flatMap((row) =>
            row.analytics_area_id === null ? [] : [row.analytics_area_id],
          ),
        ),
      ]),
    ]);
    const systemById = new Map(systemMetadata.map((row) => [row.id, row]));
    const areaById = new Map(areaMetadata.map((row) => [row.id, row]));
    const ordered = [...union.values()]
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
      .filter(
        (row) =>
          analyticsAreaId === undefined ||
          row.analytics_area_id === (analyticsAreaId === 'unset' ? null : analyticsAreaId),
      )
      .filter((row) => after === undefined || key(row) > after);
    const hasMore = ordered.length > query.limit;
    const indexes = {
      voc: new Map(vocs.map((row) => [key(row), row])),
      finding: new Map(findings.map((row) => [key(row), row])),
      task: new Map(tasks.rows.map((row) => [key(row), row])),
      survey: new Map(surveys.map((row) => [key(row), row])),
    };
    const items = ordered.slice(0, query.limit).map((source) => {
      const system = systemById.get(source.managed_system_id);
      const area =
        source.analytics_area_id === null ? undefined : areaById.get(source.analytics_area_id);
      if (
        !system ||
        (source.analytics_area_id !== null && (!area || area.managed_system_id !== system.id))
      )
        throw new Error('Authorized report metadata missing');
      const count = (metric: AreaReportMetric, value: number) => ({
        count: value,
        ...(value > 0 ? { link: areaReportLink(metric, system.id, source.analytics_area_id) } : {}),
      });
      const ratio = (metric: AreaReportMetric, value: number, total: number) => ({
        value,
        total,
        ...(total > value
          ? { link: areaReportLink(metric, system.id, source.analytics_area_id) }
          : {}),
      });
      const row: DashboardAreaReport['items'][number] = {
        managed_system_id: system.id,
        managed_system_name: system.name,
        managed_system_archived: system.archived,
        analytics_area_id: source.analytics_area_id,
        analytics_area_name: area?.name ?? null,
        analytics_area_archived: area?.archived ?? false,
      };
      if (includes(available.voc, system.id)) {
        const v = indexes.voc.get(key(source));
        row.voc = {
          total: count('voc.total', v?.total ?? 0),
          unassigned: count('voc.unassigned', v?.unassigned ?? 0),
          high_no_followup: count('voc.high_no_followup', v?.high_no_link ?? 0),
          task_link: ratio('voc.task_link', v?.with_task ?? 0, v?.total ?? 0),
        };
      }
      if (includes(available.finding, system.id)) {
        const f = indexes.finding.get(key(source));
        row.finding = {
          active: count('finding.active', f?.active ?? 0),
          execution: ratio('finding.execution', f?.execution ?? 0, f?.active ?? 0),
          no_execution: count('finding.no_execution', f?.no_execution ?? 0),
        };
      }
      if (includes(available.task, system.id)) {
        const t = indexes.task.get(key(source));
        row.task = {
          by_status: {
            backlog: count('task.backlog', t?.backlog ?? 0),
            todo: count('task.todo', t?.todo ?? 0),
            doing: count('task.doing', t?.doing ?? 0),
            review: count('task.review', t?.review ?? 0),
            done: count('task.done', t?.done ?? 0),
            released: count('task.released', t?.released ?? 0),
            reopened: count('task.reopened', t?.reopened ?? 0),
          },
          in_flight: count('task.in_flight', t?.in_flight ?? 0),
          overdue: count('task.overdue', t?.overdue ?? 0),
          ...(includes(available.voc, system.id)
            ? {
                released_update: ratio(
                  'task.released_update',
                  t?.released_updated ?? 0,
                  t?.released_total ?? 0,
                ),
                public_update_missing: count(
                  'task.public_update_missing',
                  t?.public_update_missing ?? 0,
                ),
                reporter_update_needed: count(
                  'task.reporter_update_needed',
                  t?.reporter_update_needed ?? 0,
                ),
              }
            : {}),
        };
      }
      if (includes(available.survey, system.id)) {
        const s = indexes.survey.get(key(source));
        row.survey = {
          open: count('survey.open', s?.open ?? 0),
          follow_up_needed: count('survey.follow_up_needed', s?.follow_up_needed ?? 0),
        };
      }
      return row;
    });
    const last = items.at(-1);
    return dashboardAreaReportSchema.parse({
      computed_at: new Date().toISOString(),
      as_of_date: tasks.as_of_date,
      items,
      classification_context: contexts,
      page: {
        has_more: hasMore,
        ...(hasMore && last
          ? {
              cursor: Buffer.from(
                JSON.stringify({
                  v: 1,
                  bind,
                  system: last.managed_system_id,
                  area: last.analytics_area_id,
                }),
              ).toString('base64url'),
            }
          : {}),
      },
    });
  };
}
