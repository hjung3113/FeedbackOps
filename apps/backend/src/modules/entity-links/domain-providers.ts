// Temporary home (#479) for the entity-link providers that have not yet moved
// to their owning domain modules. Shrinks by one key per commit; deleted when
// the `task` provider moves in commit 5.
import { taskReporterSummarySchema, taskStatusSchema } from '@fops/shared';
import type { EntityLinkTargetSummary, TaskStatus } from '@fops/shared';
import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { checkFindingManage, checkFindingRead } from '../findings/authorization.js';
import { type FindingReadRow, findFindingById } from '../findings/repo-read.js';
import type { CheckService } from '../permissions/check-service.js';
import { type TaskRow, findTaskById } from '../tasks/repo.js';
import { type VocClusterRow, findVocClusterById } from '../voc-clusters/repo.js';
import type {
  EntityLinkProviderRegistry,
  EntityLinksActor,
  ReporterSummaryResult,
} from './provider-types.js';
import { type LinkEndpointRow, resolveVocEndpoint } from './repo.js';

function findingToInternalSummary(row: FindingReadRow): EntityLinkTargetSummary {
  return {
    type: 'finding',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    evidence_count: row.evidence_count,
  };
}

function taskToInternalSummary(row: TaskRow): EntityLinkTargetSummary {
  return {
    type: 'task',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    primary_managed_system_id: row.primary_managed_system_id,
    assignee_actor_id: row.assignee_actor_id,
    due_date: row.due_date,
  };
}

function clusterToInternalSummary(row: VocClusterRow): EntityLinkTargetSummary {
  return {
    type: 'voc_cluster',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
  };
}

async function assertVocReadScope(
  deps: { checkService: CheckService },
  actor: EntityLinksActor,
  subject: LinkEndpointRow,
): Promise<boolean> {
  if (subject.reporter_id && actor.actor_id === subject.reporter_id) return true;
  const readDecision = await deps.checkService.checkCapability(actor, 'voc.read', {
    workspace_id: actor.workspace_id,
    managed_system_id: subject.managed_system_id,
  });
  return readDecision.allow;
}

async function resolveFinding(db: Db, workspaceId: string, id: string) {
  const finding = await findFindingById(db, { workspaceId, findingId: id });
  if (!finding) return null;
  return {
    workspace_id: finding.workspace_id,
    managed_system_id: finding.primary_managed_system_id,
    reporter_id: null,
  };
}

async function resolveVocCluster(db: Db, workspaceId: string, id: string) {
  const cluster = await findVocClusterById(db, { workspaceId, clusterId: id });
  if (!cluster) return null;
  return {
    workspace_id: cluster.workspace_id,
    managed_system_id: cluster.primary_managed_system_id,
    reporter_id: null,
  };
}

async function resolveTask(db: Db, workspaceId: string, id: string) {
  const task = await findTaskById(db, { workspaceId, taskId: id });
  if (!task) return null;
  return {
    workspace_id: task.workspace_id,
    managed_system_id: task.primary_managed_system_id,
    reporter_id: null,
  };
}

function assertNever(value: never): never {
  throw new Error(`unrecognized Task status in reporter summary: ${String(value)}`);
}

function projectTaskStatusForReporter(status: TaskStatus): string {
  switch (status) {
    case 'backlog':
    case 'todo':
      return '진행 예정';
    case 'doing':
    case 'review':
      return '진행 중';
    case 'done':
      return '해결 준비 중';
    case 'released':
      return '반영됨';
    case 'reopened':
      return '다시 처리 중';
    default:
      return assertNever(status);
  }
}

export function toTaskReporterSummaryResult(task: {
  title: string;
  status: unknown;
}): ReporterSummaryResult {
  const parsedStatus = taskStatusSchema.safeParse(task.status);
  if (!parsedStatus.success) return { available: false };
  return {
    available: true,
    summary: taskReporterSummarySchema.parse({
      target_type: 'task',
      public_title: task.title,
      reporter_facing_status: projectTaskStatusForReporter(parsedStatus.data),
    }),
  };
}

async function getTaskReporterSummary(
  db: Db,
  workspaceId: string,
  taskId: string,
): Promise<ReporterSummaryResult> {
  const result = await db.execute<{ title: string; status: unknown }>(sql`
    SELECT title, status
      FROM task.tasks
     WHERE id = ${taskId}
       AND workspace_id = ${workspaceId}
     LIMIT 1
  `);
  const task = result.rows[0];
  if (!task) return { available: false };

  return toTaskReporterSummaryResult(task);
}

async function getTaskReporterSummaries(
  db: Db,
  workspaceId: string,
  taskIds: readonly string[],
): Promise<Map<string, ReporterSummaryResult>> {
  if (taskIds.length === 0) return new Map();

  const result = await db.execute<{ id: string; title: string; status: unknown }>(sql`
    SELECT id, title, status
      FROM task.tasks
     WHERE workspace_id = ${workspaceId}
       AND id IN (${sql.join(
         taskIds.map((id) => sql`${id}`),
         sql`, `,
       )})
  `);
  return new Map(
    result.rows.map((task) => {
      return [task.id, toTaskReporterSummaryResult(task)];
    }),
  );
}

export const legacyEntityLinkProviders: Pick<
  EntityLinkProviderRegistry,
  'voc' | 'finding' | 'voc_cluster' | 'task'
> = {
  voc: {
    entityType: 'voc',
    assertExists: resolveVocEndpoint,
    getPermissionSubject: resolveVocEndpoint,
    canRead: assertVocReadScope,
    getReporterSummary: async () => ({ available: false }),
    getInternalSummary: async () => null,
    listExpectedLinks: async () => [],
  },
  finding: {
    entityType: 'finding',
    assertExists: resolveFinding,
    getPermissionSubject: resolveFinding,
    canRead: async (deps, actor, subject) => {
      const decision = await checkFindingRead(deps.checkService, actor, subject.managed_system_id, {
        requireElevatedRole: false,
      });
      return decision.allow;
    },
    canCreateTarget: async (deps, actor, subject) => {
      const decision = await checkFindingManage(
        deps.checkService,
        actor,
        subject.managed_system_id,
        { requireElevatedRole: false },
      );
      return decision.allow;
    },
    getReporterSummary: async () => ({ available: false }),
    getInternalSummary: async (db, workspaceId, id) => {
      const finding = await findFindingById(db, { workspaceId, findingId: id });
      return finding ? findingToInternalSummary(finding) : null;
    },
    listExpectedLinks: async () => [],
  },
  voc_cluster: {
    entityType: 'voc_cluster',
    assertExists: resolveVocCluster,
    getPermissionSubject: resolveVocCluster,
    canRead: async (deps, actor, subject) => {
      const decision = await checkFindingRead(deps.checkService, actor, subject.managed_system_id, {
        requireElevatedRole: false,
      });
      return decision.allow;
    },
    canCreateTarget: async (deps, actor, subject) => {
      const decision = await checkFindingManage(
        deps.checkService,
        actor,
        subject.managed_system_id,
        { requireElevatedRole: false },
      );
      return decision.allow;
    },
    getReporterSummary: async () => ({ available: false }),
    getInternalSummary: async (db, workspaceId, id) => {
      const cluster = await findVocClusterById(db, { workspaceId, clusterId: id });
      return cluster ? clusterToInternalSummary(cluster) : null;
    },
    listExpectedLinks: async () => [],
  },
  task: {
    entityType: 'task',
    assertExists: resolveTask,
    getPermissionSubject: resolveTask,
    canRead: async (deps, actor, subject) => {
      const decision = await checkFindingRead(deps.checkService, actor, subject.managed_system_id, {
        requireElevatedRole: false,
      });
      return decision.allow;
    },
    canCreateTarget: async (deps, actor, subject) => {
      const decision = await checkFindingManage(
        deps.checkService,
        actor,
        subject.managed_system_id,
        { requireElevatedRole: false },
      );
      return decision.allow;
    },
    getReporterSummary: getTaskReporterSummary,
    getReporterSummaries: getTaskReporterSummaries,
    getInternalSummary: async (db, workspaceId, id) => {
      const task = await findTaskById(db, { workspaceId, taskId: id });
      return task ? taskToInternalSummary(task) : null;
    },
    listExpectedLinks: async () => [],
  },
};
